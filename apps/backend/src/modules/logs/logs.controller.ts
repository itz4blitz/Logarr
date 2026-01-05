import { Controller, Get, Post, Query, Param, Logger, Inject, forwardRef } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { FileIngestionService } from '../file-ingestion/file-ingestion.service';
import { IngestionService } from '../ingestion/ingestion.service';

import { LogSearchDto, LogEntryDto, LogStatsDto } from './logs.dto';
import { LogsGateway } from './logs.gateway';
import { LogsService } from './logs.service';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  private readonly logger = new Logger(LogsController.name);

  constructor(
    private readonly logsService: LogsService,
    @Inject(forwardRef(() => FileIngestionService))
    private readonly fileIngestionService: FileIngestionService,
    @Inject(forwardRef(() => IngestionService))
    private readonly ingestionService: IngestionService,
    private readonly logsGateway: LogsGateway
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search logs' })
  @ApiResponse({ status: 200, type: [LogEntryDto] })
  async search(@Query() query: LogSearchDto) {
    return this.logsService.search(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get log statistics' })
  @ApiResponse({ status: 200, type: LogStatsDto })
  async getStats(@Query('serverId') serverId?: string) {
    return this.logsService.getStats(serverId);
  }

  @Get('sources')
  @ApiOperation({ summary: 'Get available log sources' })
  @ApiResponse({ status: 200, type: [String] })
  async getSources(@Query('serverId') serverId?: string) {
    return this.logsService.getSources(serverId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a log entry by ID' })
  @ApiResponse({ status: 200, type: LogEntryDto })
  async findOne(@Param('id') id: string) {
    return this.logsService.findOne(id);
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Get a log entry with related data (server, issues)' })
  @ApiResponse({ status: 200 })
  async getLogWithRelations(@Param('id') id: string) {
    return this.logsService.getLogWithRelations(id);
  }

  @Post('backfill-files')
  @ApiOperation({ summary: 'Backfill logs from log files for a server' })
  @ApiResponse({ status: 200 })
  async backfillFromFiles(@Query('serverId') serverId: string) {
    if (!serverId) {
      throw new Error('serverId is required');
    }

    this.logger.log(`Starting file backfill for server ${serverId}`);

    // Broadcast progress via WebSocket
    const progressCallback = (progress: {
      status: 'started' | 'progress' | 'completed' | 'error';
      totalFiles: number;
      processedFiles: number;
      totalLines: number;
      processedLines: number;
      entriesIngested: number;
      currentFile?: string;
      error?: string;
    }) => {
      this.logsGateway.broadcastFileBackfillProgress(progress, serverId);
    };

    const result = await this.fileIngestionService.backfillFromFiles(
      serverId,
      this.ingestionService.getProviders(),
      progressCallback
    );

    this.logger.log(
      `File backfill complete for server ${serverId}: ${result.processedFiles} files, ${result.processedLines} lines, ${result.entriesIngested} entries`
    );

    return result;
  }
}
