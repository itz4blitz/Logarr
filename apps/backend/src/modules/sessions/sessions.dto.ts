import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionSearchDto {
  @ApiPropertyOptional({ description: 'Filter by server ID' })
  serverId?: string;

  @ApiPropertyOptional({ description: 'Filter by user ID' })
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by device ID' })
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Start date filter' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date filter' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Maximum results to return', default: 50 })
  limit?: number;

  @ApiPropertyOptional({ description: 'Offset for pagination', default: 0 })
  offset?: number;
}

export class NowPlayingDto {
  @ApiPropertyOptional()
  itemId?: string | null;

  @ApiPropertyOptional()
  itemName?: string | null;

  @ApiPropertyOptional()
  itemType?: string | null;

  @ApiPropertyOptional()
  seriesName?: string | null;

  @ApiPropertyOptional()
  seasonName?: string | null;

  @ApiPropertyOptional()
  positionTicks?: string | null;

  @ApiPropertyOptional()
  runTimeTicks?: string | null;

  @ApiProperty()
  isPaused: boolean;

  @ApiProperty()
  isMuted: boolean;

  @ApiProperty()
  isTranscoding: boolean;

  @ApiPropertyOptional()
  transcodeReasons?: string[] | null;

  @ApiPropertyOptional()
  videoCodec?: string | null;

  @ApiPropertyOptional()
  audioCodec?: string | null;

  @ApiPropertyOptional()
  container?: string | null;

  @ApiPropertyOptional()
  playMethod?: string | null;

  @ApiPropertyOptional({ description: 'Full URL to the media thumbnail (provider-specific)' })
  thumbnailUrl?: string | null;
}

export class SessionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  serverId: string;

  @ApiProperty()
  externalId: string;

  @ApiPropertyOptional()
  playSessionId?: string | null;

  @ApiPropertyOptional()
  userId?: string | null;

  @ApiPropertyOptional()
  userName?: string | null;

  @ApiProperty()
  deviceId: string;

  @ApiPropertyOptional()
  deviceName?: string | null;

  @ApiPropertyOptional()
  clientName?: string | null;

  @ApiPropertyOptional()
  clientVersion?: string | null;

  @ApiPropertyOptional()
  ipAddress?: string | null;

  @ApiPropertyOptional()
  nowPlayingItemId?: string | null;

  @ApiPropertyOptional()
  nowPlayingItemName?: string | null;

  @ApiPropertyOptional()
  nowPlayingItemType?: string | null;

  @ApiPropertyOptional({ type: NowPlayingDto })
  nowPlaying?: NowPlayingDto | null;

  @ApiProperty()
  startedAt: Date;

  @ApiPropertyOptional()
  endedAt?: Date | null;

  @ApiProperty()
  lastActivity: Date;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class PlaybackEventDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  sessionId: string;

  @ApiProperty()
  eventType: string;

  @ApiPropertyOptional()
  itemId?: string | null;

  @ApiPropertyOptional()
  itemName?: string | null;

  @ApiPropertyOptional()
  itemType?: string | null;

  @ApiPropertyOptional()
  positionTicks?: bigint | null;

  @ApiPropertyOptional()
  durationTicks?: bigint | null;

  @ApiProperty()
  isPaused: boolean;

  @ApiProperty()
  isMuted: boolean;

  @ApiProperty()
  isTranscoding: boolean;

  @ApiPropertyOptional()
  transcodeReasons?: string[] | null;

  @ApiPropertyOptional()
  videoCodec?: string | null;

  @ApiPropertyOptional()
  audioCodec?: string | null;

  @ApiPropertyOptional()
  container?: string | null;

  @ApiProperty()
  timestamp: Date;
}

export class SessionTimelineDto extends SessionDto {
  @ApiProperty({ type: [PlaybackEventDto] })
  events: PlaybackEventDto[];

  @ApiProperty()
  relatedLogCount: number;
}
