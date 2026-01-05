import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LogSearchDto {
  @ApiPropertyOptional({ description: 'Filter by server ID' })
  serverId?: string;

  @ApiPropertyOptional({ description: 'Full-text search query' })
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by log levels', type: [String] })
  levels?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by log sources (e.g., MediaBrowser.Controller)',
    type: [String],
  })
  sources?: string | string[];

  @ApiPropertyOptional({ description: 'Filter by log source type (api or file)', type: [String] })
  logSources?: string | string[];

  @ApiPropertyOptional({ description: 'Filter by session ID' })
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  userId?: string;

  @ApiPropertyOptional({ description: 'Start date filter' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Maximum results to return', default: 100 })
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  offset?: number;
}

export class LogEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  serverId: string;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  level: string;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  source?: string | null;

  @ApiPropertyOptional()
  threadId?: string | null;

  @ApiProperty()
  raw: string;

  @ApiPropertyOptional()
  sessionId?: string | null;

  @ApiPropertyOptional()
  userId?: string | null;

  @ApiPropertyOptional()
  deviceId?: string | null;

  @ApiPropertyOptional()
  itemId?: string | null;

  @ApiPropertyOptional()
  playSessionId?: string | null;

  @ApiPropertyOptional()
  exception?: string | null;

  @ApiPropertyOptional()
  stackTrace?: string | null;

  @ApiPropertyOptional()
  logSource?: string | null;

  @ApiPropertyOptional()
  logFilePath?: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class LogStatsDto {
  @ApiProperty()
  totalCount: number;

  @ApiProperty()
  errorCount: number;

  @ApiProperty()
  warnCount: number;

  @ApiProperty()
  infoCount: number;

  @ApiProperty()
  debugCount: number;

  @ApiProperty()
  errorRate: number;

  @ApiProperty({ type: [Object] })
  topSources: { source: string; count: number }[];

  @ApiProperty({ type: [Object] })
  topErrors: { message: string; count: number; lastOccurrence: Date }[];
}
