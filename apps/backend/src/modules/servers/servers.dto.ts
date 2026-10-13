import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServerDto {
  @ApiProperty({ description: 'Display name for the server' })
  name: string;

  @ApiProperty({ description: 'Provider ID (e.g., jellyfin, plex, emby)' })
  providerId: string;

  @ApiProperty({ description: 'Server URL' })
  url: string;

  @ApiProperty({
    description:
      'API key / token / password for authentication (may be empty for qBittorrent with authentication bypass)',
  })
  apiKey: string;

  @ApiPropertyOptional({
    description: 'Login username (qBittorrent). Leave empty for API-key or no-auth setups.',
  })
  username?: string;

  @ApiPropertyOptional({ description: 'Path to log files' })
  logPath?: string;

  @ApiPropertyOptional({ description: 'Whether file-based log ingestion is enabled' })
  fileIngestionEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Array of log file/directory paths', type: [String] })
  logPaths?: string[];

  @ApiPropertyOptional({
    description: 'File patterns to match (e.g., ["*.log", "*.txt"])',
    type: [String],
  })
  logFilePatterns?: string[];
}

export class UpdateServerDto {
  @ApiPropertyOptional({ description: 'Display name for the server' })
  name?: string;

  @ApiPropertyOptional({ description: 'Server URL' })
  url?: string;

  @ApiPropertyOptional({
    description:
      'API key / token / password for authentication. Omit or leave empty to keep the stored value.',
  })
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'Login username (qBittorrent). An empty string clears it.',
  })
  username?: string;

  @ApiPropertyOptional({ description: 'Path to log files' })
  logPath?: string;

  @ApiPropertyOptional({ description: 'Whether the server is enabled' })
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Whether file-based log ingestion is enabled' })
  fileIngestionEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Array of log file/directory paths', type: [String] })
  logPaths?: string[];

  @ApiPropertyOptional({
    description: 'File patterns to match (e.g., ["*.log", "*.txt"])',
    type: [String],
  })
  logFilePatterns?: string[];
}

export class ServerResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  providerId: string;

  @ApiProperty()
  url: string;

  @ApiPropertyOptional({ description: 'Login username (qBittorrent)' })
  username?: string | null;

  @ApiProperty({
    description:
      'Whether a secret (API key, token or password) is stored. The secret is never returned.',
  })
  hasApiKey: boolean;

  @ApiPropertyOptional()
  logPath?: string | null;

  @ApiProperty()
  isEnabled: boolean;

  @ApiProperty()
  isConnected: boolean;

  @ApiPropertyOptional()
  lastSeen?: Date | null;

  @ApiPropertyOptional()
  lastError?: string | null;

  @ApiPropertyOptional()
  version?: string | null;

  @ApiPropertyOptional()
  serverName?: string | null;

  @ApiProperty({ description: 'Whether file-based log ingestion is enabled' })
  fileIngestionEnabled: boolean;

  @ApiProperty({ description: 'Whether file-based log ingestion is connected and working' })
  fileIngestionConnected: boolean;

  @ApiPropertyOptional({ description: 'Error message if file ingestion failed' })
  fileIngestionError?: string | null;

  @ApiPropertyOptional({ description: 'Array of log file/directory paths', type: [String] })
  logPaths?: string[] | null;

  @ApiPropertyOptional({ description: 'File patterns to match', type: [String] })
  logFilePatterns?: string[] | null;

  @ApiPropertyOptional({ description: 'Last time files were synced' })
  lastFileSync?: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class FilePathValidationDto {
  @ApiProperty()
  path: string;

  @ApiProperty()
  accessible: boolean;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional({ type: [String] })
  files?: string[];
}

export class FileIngestionStatusDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  connected: boolean;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional({ type: [FilePathValidationDto] })
  paths?: FilePathValidationDto[];
}

export class ConnectionStatusDto {
  @ApiProperty()
  connected: boolean;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  serverInfo?: {
    name: string;
    version: string;
    id: string;
  };

  @ApiPropertyOptional({ type: FileIngestionStatusDto })
  fileIngestion?: FileIngestionStatusDto | null;
}

export class ProviderDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  capabilities: {
    supportsRealTimeLogs: boolean;
    supportsActivityLog: boolean;
    supportsSessions: boolean;
    supportsWebhooks: boolean;
    supportsPlaybackHistory: boolean;
  };
}
