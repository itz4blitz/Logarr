import { JellyfinClient } from './jellyfin.client.js';
import {
  JELLYFIN_CORRELATION_PATTERNS,
  JELLYFIN_LOG_FILE_CONFIG,
  isJellyfinLogContinuation,
  parseJellyfinLogLine,
  parseJellyfinLogLineWithContext,
} from './jellyfin.parser.js';

import type { JellyfinActivityLogEntry, JellyfinSession, JellyfinUser } from './jellyfin.types.js';
import type {
  ConnectionStatus,
  CorrelationPattern,
  LogFileConfig,
  LogLevel,
  LogParseContext,
  LogParseResult,
  MediaServerProvider,
  NormalizedActivity,
  NormalizedSession,
  NormalizedUser,
  ParsedLogEntry,
  ProviderCapabilities,
  ProviderConfig,
  ServerInfo,
} from '@logarr/core';

/**
 * Jellyfin media server provider
 */
export class JellyfinProvider implements MediaServerProvider {
  readonly id = 'jellyfin';
  readonly name = 'Jellyfin';

  readonly capabilities: ProviderCapabilities = {
    supportsRealTimeLogs: true,
    supportsActivityLog: true,
    supportsSessions: true,
    supportsWebhooks: true,
    supportsPlaybackHistory: true,
  };

  private client: JellyfinClient | null = null;
  private config: ProviderConfig | null = null;

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.client = new JellyfinClient(config.url, config.apiKey);
    await this.client.connect();
  }

  disconnect(): Promise<void> {
    this.client = null;
    this.config = null;
    return Promise.resolve();
  }

  async testConnection(): Promise<ConnectionStatus> {
    if (this.client === null) {
      return { connected: false, error: 'Not initialized' };
    }

    try {
      const info = await this.client.getSystemInfo();

      return {
        connected: true,
        serverInfo: {
          name: info.ServerName,
          version: info.Version,
          id: info.Id,
        },
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }

    // Default Jellyfin log paths for different platforms
    return Promise.resolve([
      '/config/log', // Docker
      '/var/lib/jellyfin/log', // Linux
      'C:\\ProgramData\\Jellyfin\\Server\\log', // Windows
    ]);
  }

  parseLogLine(line: string): ParsedLogEntry | null {
    return parseJellyfinLogLine(line);
  }

  getCorrelationPatterns(): readonly CorrelationPattern[] {
    return JELLYFIN_CORRELATION_PATTERNS;
  }

  // ==========================================================================
  // File-Based Log Ingestion
  // ==========================================================================

  /**
   * Get configuration for file-based log ingestion
   */
  getLogFileConfig(): LogFileConfig {
    return JELLYFIN_LOG_FILE_CONFIG;
  }

  /**
   * Parse a log line with context for multi-line handling
   */
  parseLogLineWithContext(line: string, context: LogParseContext): LogParseResult {
    return parseJellyfinLogLineWithContext(line, context);
  }

  /**
   * Check if a line is a continuation of a previous entry
   */
  isLogContinuation(line: string): boolean {
    return isJellyfinLogContinuation(line);
  }

  async getSessions(): Promise<readonly NormalizedSession[]> {
    const client = this.getClient();
    const sessions = await client.getSessions();

    return sessions.map((session) => this.normalizeSession(session));
  }

  async getUsers(): Promise<readonly NormalizedUser[]> {
    const client = this.getClient();
    const users = await client.getUsers();

    return users.map((user) => this.normalizeUser(user));
  }

  async getActivity(since?: Date): Promise<readonly NormalizedActivity[]> {
    const client = this.getClient();
    const result = await client.getActivityLog(0, 100, since);

    return result.Items.map((item) => this.normalizeActivity(item));
  }

  async getServerInfo(): Promise<ServerInfo> {
    const client = this.getClient();
    const info = await client.getSystemInfo();

    return {
      name: info.ServerName,
      version: info.Version,
      id: info.Id,
    };
  }

  private getClient(): JellyfinClient {
    if (this.client === null) {
      throw new Error('Not connected to Jellyfin server');
    }
    return this.client;
  }

  private normalizeSession(session: JellyfinSession): NormalizedSession {
    const nowPlayingItem = session.NowPlayingItem;
    const playState = session.PlayState;
    const hasNowPlaying = nowPlayingItem !== undefined && playState !== undefined;

    return {
      id: session.Id,
      externalId: session.Id,
      userId: session.UserId,
      userName: session.UserName,
      deviceId: session.DeviceId,
      deviceName: session.DeviceName,
      clientName: session.Client,
      clientVersion: session.ApplicationVersion,
      ipAddress: session.RemoteEndPoint,
      startedAt: new Date(session.LastActivityDate),
      lastActivity: new Date(session.LastActivityDate),
      isActive: session.IsActive,
      nowPlaying: hasNowPlaying
        ? {
            itemId: nowPlayingItem.Id,
            itemName: nowPlayingItem.Name,
            itemType: nowPlayingItem.Type,
            positionTicks: playState.PositionTicks,
            durationTicks: nowPlayingItem.RunTimeTicks,
            isPaused: playState.IsPaused,
            isMuted: playState.IsMuted,
            isTranscoding: session.TranscodingInfo !== undefined,
            transcodeReasons: session.TranscodingInfo?.TranscodeReasons,
            videoCodec: session.TranscodingInfo?.VideoCodec,
            audioCodec: session.TranscodingInfo?.AudioCodec,
            container: session.TranscodingInfo?.Container,
          }
        : undefined,
    };
  }

  private normalizeUser(user: JellyfinUser): NormalizedUser {
    return {
      id: user.Id,
      externalId: user.Id,
      name: user.Name,
      lastSeen: user.LastActivityDate !== undefined ? new Date(user.LastActivityDate) : undefined,
      isAdmin: user.Policy.IsAdministrator,
    };
  }

  private normalizeActivity(item: JellyfinActivityLogEntry): NormalizedActivity {
    return {
      id: item.Id.toString(),
      type: item.Type,
      name: item.Name,
      overview: item.Overview ?? item.ShortOverview,
      severity: this.mapActivitySeverity(item.Severity),
      userId: item.UserId,
      itemId: item.ItemId,
      timestamp: new Date(item.Date),
    };
  }

  private mapActivitySeverity(severity: string): LogLevel {
    switch (severity.toLowerCase()) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warn';
      case 'debug':
        return 'debug';
      default:
        return 'info';
    }
  }
}
