/**
 * Emby Media Server provider for Logarr
 * Implements the MediaServerProvider interface for Emby integration
 */

import { EmbyClient } from './emby.client.js';
import {
  EMBY_CORRELATION_PATTERNS,
  EMBY_LOG_FILE_CONFIG,
  isEmbyLogContinuation,
  parseEmbyLogLine,
  parseEmbyLogLineWithContext,
} from './emby.parser.js';

import type { EmbyActivityLogEntry, EmbySession, EmbyUser } from './emby.types.js';
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
 * Emby Media Server provider
 */
export class EmbyProvider implements MediaServerProvider {
  readonly id = 'emby';
  readonly name = 'Emby';

  readonly capabilities: ProviderCapabilities = {
    supportsRealTimeLogs: true, // WebSocket notifications
    supportsActivityLog: true, // Activity log API
    supportsSessions: true, // Sessions API
    supportsWebhooks: true, // Emby webhooks (via plugins)
    supportsPlaybackHistory: true, // Activity log API
  };

  private client: EmbyClient | null = null;
  private config: ProviderConfig | null = null;

  // ===========================================================================
  // Connection Lifecycle
  // ===========================================================================

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.client = new EmbyClient(config.url, config.apiKey);
    await this.client.connect();
  }

  disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnectWebSocket();
    }
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

  // ===========================================================================
  // Log File Ingestion
  // ===========================================================================

  getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }

    // Default Emby log paths for different platforms
    return Promise.resolve([
      '/config/logs', // Docker
      '/var/lib/emby/logs', // Linux
      '/var/lib/emby-server/logs', // Linux alternative
      'C:\\ProgramData\\Emby-Server\\logs', // Windows
    ]);
  }

  parseLogLine(line: string): ParsedLogEntry | null {
    return parseEmbyLogLine(line);
  }

  getCorrelationPatterns(): readonly CorrelationPattern[] {
    return EMBY_CORRELATION_PATTERNS;
  }

  /**
   * Get configuration for file-based log ingestion
   */
  getLogFileConfig(): LogFileConfig {
    return EMBY_LOG_FILE_CONFIG;
  }

  /**
   * Parse a log line with context for multi-line handling
   */
  parseLogLineWithContext(line: string, context: LogParseContext): LogParseResult {
    return parseEmbyLogLineWithContext(line, context);
  }

  /**
   * Check if a line is a continuation of a previous entry
   */
  isLogContinuation(line: string): boolean {
    return isEmbyLogContinuation(line);
  }

  // ===========================================================================
  // API Data Retrieval
  // ===========================================================================

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
    const options: { limit: number; minDate?: Date } = { limit: 100 };
    if (since !== undefined) {
      options.minDate = since;
    }
    const result = await client.getActivityLog(options);

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

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getClient(): EmbyClient {
    if (this.client === null) {
      throw new Error('Not connected to Emby server');
    }
    return this.client;
  }

  /**
   * Normalize Emby session to core NormalizedSession type
   */
  private normalizeSession(session: EmbySession): NormalizedSession {
    const nowPlayingItem = session.NowPlayingItem;
    const playState = session.PlayState;
    const hasNowPlaying = nowPlayingItem !== undefined && playState !== undefined;

    // Build thumbnail URL for now playing item
    let thumbnailUrl: string | undefined;
    if (hasNowPlaying && this.config !== null && nowPlayingItem.ImageTags?.['Primary']) {
      const baseUrl = this.config.url.replace(/\/$/, '');
      thumbnailUrl = `${baseUrl}/Items/${nowPlayingItem.Id}/Images/Primary?maxWidth=300&tag=${nowPlayingItem.ImageTags['Primary']}&api_key=${this.config.apiKey}`;
    }

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
            itemName: this.buildItemName(nowPlayingItem),
            itemType: nowPlayingItem.Type,
            seriesName: nowPlayingItem.SeriesName,
            seasonName: nowPlayingItem.SeasonName,
            positionTicks: playState.PositionTicks,
            durationTicks: nowPlayingItem.RunTimeTicks,
            isPaused: playState.IsPaused,
            isMuted: playState.IsMuted,
            isTranscoding: session.TranscodingInfo !== undefined && !session.TranscodingInfo.IsVideoDirect,
            transcodeReasons: session.TranscodingInfo?.TranscodeReasons as string[] | undefined,
            videoCodec: session.TranscodingInfo?.VideoCodec,
            audioCodec: session.TranscodingInfo?.AudioCodec,
            container: session.TranscodingInfo?.Container,
            thumbnailUrl,
          }
        : undefined,
    };
  }

  /**
   * Build display name for a now playing item
   */
  private buildItemName(item: { Name: string; SeriesName?: string; Type: string }): string {
    if (item.Type === 'Episode' && item.SeriesName) {
      return `${item.SeriesName} - ${item.Name}`;
    }
    return item.Name;
  }

  /**
   * Normalize Emby user to core NormalizedUser type
   */
  private normalizeUser(user: EmbyUser): NormalizedUser {
    return {
      id: user.Id,
      externalId: user.Id,
      name: user.Name,
      lastSeen: user.LastActivityDate !== undefined ? new Date(user.LastActivityDate) : undefined,
      isAdmin: user.Policy.IsAdministrator,
    };
  }

  /**
   * Normalize Emby activity log entry to core NormalizedActivity type
   */
  private normalizeActivity(item: EmbyActivityLogEntry): NormalizedActivity {
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

  /**
   * Map Emby activity severity to normalized log level
   */
  private mapActivitySeverity(severity: string): LogLevel {
    switch (severity.toLowerCase()) {
      case 'error':
        return 'error';
      case 'warn':
      case 'warning':
        return 'warn';
      case 'debug':
        return 'debug';
      default:
        return 'info';
    }
  }
}
