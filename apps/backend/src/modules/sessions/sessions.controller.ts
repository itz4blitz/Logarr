import { Controller, Get, Post, Delete, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { LogEntryDto } from '../logs/logs.dto';

import { SessionSearchDto, SessionDto, SessionTimelineDto } from './sessions.dto';
import { SessionsService } from './sessions.service';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  @ApiOperation({ summary: 'Search sessions' })
  @ApiResponse({ status: 200, type: [SessionDto] })
  async search(@Query() query: SessionSearchDto) {
    return this.sessionsService.search(query);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active sessions' })
  @ApiResponse({ status: 200, type: [SessionDto] })
  async getActive(@Query('serverId') serverId?: string) {
    return this.sessionsService.getActiveSessions(serverId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a session by ID' })
  @ApiResponse({ status: 200, type: SessionDto })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get session timeline with events' })
  @ApiResponse({ status: 200, type: SessionTimelineDto })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getTimeline(@Param('id') id: string) {
    return this.sessionsService.getTimeline(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get logs related to a session' })
  @ApiResponse({ status: 200, type: [LogEntryDto] })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getLogs(@Param('id') id: string, @Query('limit') limit?: number) {
    return this.sessionsService.getLogs(id, limit);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a session' })
  @ApiResponse({ status: 200, description: 'Session deleted' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async delete(@Param('id') id: string) {
    return this.sessionsService.delete(id);
  }

  @Post('prune')
  @ApiOperation({ summary: 'Delete sessions with unknown/null userNames or system user IDs' })
  @ApiResponse({ status: 200, description: 'Sessions pruned successfully' })
  async pruneUnknownSessions() {
    return this.sessionsService.pruneUnknownSessions();
  }
}
