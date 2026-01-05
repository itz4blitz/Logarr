import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';

import { IssueSearchDto, UpdateIssueDto, MergeIssuesDto } from './issues.dto';
import { IssuesGateway } from './issues.gateway';
import { IssuesService } from './issues.service';

@Controller('issues')
export class IssuesController {
  private readonly logger = new Logger(IssuesController.name);

  constructor(
    private readonly issuesService: IssuesService,
    private readonly issuesGateway: IssuesGateway
  ) {}

  @Get()
  async search(@Query() query: IssueSearchDto) {
    return this.issuesService.search(query);
  }

  @Get('stats')
  async getStats(@Query('serverId') serverId?: string) {
    return this.issuesService.getStats(serverId);
  }

  @Get('categories')
  async getCategories() {
    return this.issuesService.getCategories();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.issuesService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() updateDto: UpdateIssueDto) {
    return this.issuesService.update(id, updateDto);
  }

  @Post('merge')
  async mergeIssues(@Body() mergeDto: MergeIssuesDto) {
    return this.issuesService.mergeIssues(mergeDto);
  }

  @Post(':id/acknowledge')
  async acknowledge(@Param('id', ParseUUIDPipe) id: string) {
    return this.issuesService.update(id, { status: 'acknowledged' });
  }

  @Post(':id/resolve')
  async resolve(@Param('id', ParseUUIDPipe) id: string, @Body() body: { resolvedBy?: string }) {
    const updateData: UpdateIssueDto = { status: 'resolved' };
    if (body.resolvedBy) {
      updateData.resolvedBy = body.resolvedBy;
    }
    return this.issuesService.update(id, updateData);
  }

  @Post(':id/ignore')
  async ignore(@Param('id', ParseUUIDPipe) id: string) {
    return this.issuesService.update(id, { status: 'ignored' });
  }

  @Post(':id/reopen')
  async reopen(@Param('id', ParseUUIDPipe) id: string) {
    return this.issuesService.update(id, { status: 'open' });
  }

  @Post('backfill')
  async backfillFromLogs(@Query('serverId') serverId?: string) {
    this.logger.log(`Starting issue backfill${serverId ? ` for server ${serverId}` : ''}`);

    // Create progress callback that broadcasts via WebSocket
    const progressCallback = (progress: {
      status: 'started' | 'progress' | 'completed' | 'error';
      totalLogs: number;
      processedLogs: number;
      issuesCreated: number;
      issuesUpdated: number;
      currentBatch?: number;
      totalBatches?: number;
      error?: string;
    }) => {
      this.issuesGateway.broadcastBackfillProgress(progress, serverId);
    };

    const result = await this.issuesService.backfillFromLogs(serverId, progressCallback);
    this.logger.log(
      `Backfill complete: ${result.processedLogs} logs processed, ${result.issuesCreated} issues created, ${result.issuesUpdated} issues updated`
    );
    return result;
  }

  @Get(':id/occurrences')
  async getOccurrences(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number
  ) {
    return this.issuesService.getOccurrences(id, limit, offset);
  }

  @Get(':id/timeline')
  async getTimeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.issuesService.getTimeline(id);
  }

  @Post(':id/analyze')
  async analyzeIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { providerId?: string }
  ) {
    this.logger.log(
      `Analyzing issue ${id}${body.providerId ? ` with provider ${body.providerId}` : ''}`
    );
    try {
      return await this.issuesService.analyzeIssue(id, body.providerId);
    } catch (error) {
      this.logger.error(`Failed to analyze issue ${id}:`, error);
      throw error;
    }
  }

  @Post(':id/analyze/followup')
  async analyzeFollowUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { conversationId: string; question: string; providerId?: string }
  ) {
    this.logger.log(`Follow-up question for issue ${id}, conversation ${body.conversationId}`);
    return this.issuesService.analyzeIssueFollowUp(
      id,
      body.conversationId,
      body.question,
      body.providerId
    );
  }

  @Get(':id/analyze/conversation/:conversationId')
  async getAnalysisConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string
  ) {
    return this.issuesService.getAnalysisConversation(id, conversationId);
  }

  @Get(':id/analyze/conversation')
  async getLatestAnalysisConversation(@Param('id', ParseUUIDPipe) id: string) {
    return this.issuesService.getLatestAnalysisConversation(id);
  }
}
