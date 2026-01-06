/**
 * Plex Media Server provider for Logarr
 * Implements the MediaServerProvider interface for Plex integration
 */

import { PlexClient } from './plex.client.js';
import {
  PLEX_CORRELATION_PATTERNS,
  PLEX_LOG_FILE_CONFIG,
  isPlexLogContinuation,
  parsePlexLogLine,
  parsePlexLogLineWithContext,
} from './plex.parser.js';

import type { PlexHistoryEntry, PlexSession, PlexUser } from './plex.types.js';
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
 * Plex Media Server provider
 */
export class PlexProvider implements MediaServerProvider {
  readonly id = 'plex';
  readonly name = 'Plex';

  readonly capabilities: ProviderCapabilities = {
    supportsRealTimeLogs: true, // WebSocket notifications
    supportsActivityLog: true, // History API
    supportsSessions: true, // Sessions API
    supportsWebhooks: true, // Plex webhooks (external configuration)
    supportsPlaybackHistory: true, // History API
  };

  private client: PlexClient | null = null;
  private config: ProviderConfig | null = null;

  // ===========================================================================
  // Connection Lifecycle
  // ===========================================================================

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.client = new PlexClient(config.url, config.apiKey);
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
      const info = await this.client.getServerInfo();
      const container = info.MediaContainer;

      return {
        connected: true,
        serverInfo: {
          name: container.friendlyName,
          version: container.version,
          id: container.machineIdentifier,
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

    // Default Plex log paths for different platforms
    return Promise.resolve([
      '/plex-logs', // Docker with Logarr (mount via PLEX_LOGS_PATH env var)
      '/config/Library/Application Support/Plex Media Server/Logs', // Docker (Plex container)
      '/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Logs', // Linux
      'C:\\Users\\*\\AppData\\Local\\Plex Media Server\\Logs', // Windows
      '~/Library/Application Support/Plex Media Server/Logs', // macOS
    ]);
  }

  parseLogLine(line: string): ParsedLogEntry | null {
    return parsePlexLogLine(line);
  }

  getCorrelationPatterns(): readonly CorrelationPattern[] {
    return PLEX_CORRELATION_PATTERNS;
  }

  /**
   * Get configuration for file-based log ingestion
   */
  getLogFileConfig(): LogFileConfig {
    return PLEX_LOG_FILE_CONFIG;
  }

  /**
   * Parse a log line with context for multi-line handling
   */
  parseLogLineWithContext(line: string, context: LogParseContext): LogParseResult {
    return parsePlexLogLineWithContext(line, context);
  }

  /**
   * Check if a line is a continuation of a previous entry
   */
  isLogContinuation(line: string): boolean {
    return isPlexLogContinuation(line);
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
    const users = await client.getAccounts();

    return users.map((user) => this.normalizeUser(user));
  }

  async getActivity(since?: Date): Promise<readonly NormalizedActivity[]> {
    const client = this.getClient();
    const history = await client.getHistory({ limit: 100 });

    // Filter by date if provided
    const filteredHistory = since
      ? history.filter((entry) => entry.viewedAt * 1000 >= since.getTime())
      : history;

    return filteredHistory.map((entry) => this.normalizeActivity(entry));
  }

  async getServerInfo(): Promise<ServerInfo> {
    const client = this.getClient();
    const info = await client.getServerInfo();
    const container = info.MediaContainer;

    return {
      name: container.friendlyName,
      version: container.version,
      id: container.machineIdentifier,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getClient(): PlexClient {
    if (this.client === null) {
      throw new Error('Not connected to Plex server');
    }
    return this.client;
  }

  /**
   * Normalize Plex session to core NormalizedSession type
   */
  private normalizeSession(session: PlexSession): NormalizedSession {
    const player = session.Player;
    const transcodeSession = session.TranscodeSession;

    // Build title with series/show info for episodes
    let itemName = session.title;
    let seriesName: string | undefined;
    let seasonName: string | undefined;

    if (session.type === 'episode') {
      // For episodes, use grandparentTitle as series name
      seriesName = session.grandparentTitle;
      seasonName = session.parentTitle;
      // Episode title should just be the episode name
      itemName = session.title;
      // But for display, include the series
      if (session.grandparentTitle !== undefined && session.grandparentTitle !== '') {
        itemName = `${session.grandparentTitle} - ${session.title}`;
      }
    } else if (session.grandparentTitle !== undefined && session.grandparentTitle !== '') {
      itemName = `${session.grandparentTitle} - ${session.title}`;
    }

    // Build thumbnail URL - prefer episode/movie thumb, fallback to show/parent thumb
    let thumbnailUrl: string | undefined;
    if (this.config !== null) {
      const thumbPath = session.thumb ?? session.parentThumb ?? session.grandparentThumb;
      if (thumbPath !== undefined) {
        const baseUrl = this.config.url.replace(/\/$/, '');
        thumbnailUrl = `${baseUrl}/photo/:/transcode?url=${encodeURIComponent(thumbPath)}&width=300&height=450&X-Plex-Token=${this.config.apiKey}`;
      }
    }

    return {
      id: session.sessionKey,
      externalId: session.sessionKey,
      userId: session.User.id.toString(),
      userName: session.User.title,
      deviceId: player.machineIdentifier,
      deviceName: player.title !== '' ? player.title : player.device,
      clientName: player.product ?? player.platform,
      clientVersion: player.platformVersion,
      ipAddress: player.address,
      startedAt: new Date(), // Plex doesn't provide session start time
      lastActivity: new Date(),
      isActive: player.state === 'playing' || player.state === 'paused',
      nowPlaying: {
        itemId: session.ratingKey,
        itemName,
        itemType: session.type,
        seriesName,
        seasonName,
        positionTicks: session.viewOffset * 10000, // Convert ms to ticks
        durationTicks: session.duration * 10000,
        isPaused: player.state === 'paused',
        isMuted: false, // Plex doesn't expose this
        isTranscoding: transcodeSession !== undefined,
        transcodeReasons: transcodeSession
          ? [transcodeSession.videoDecision, transcodeSession.audioDecision].filter(
              (r) => r === 'transcode'
            )
          : undefined,
        videoCodec: transcodeSession?.videoCodec,
        audioCodec: transcodeSession?.audioCodec,
        container: transcodeSession?.container,
        thumbnailUrl,
      },
    };
  }

  /**
   * Normalize Plex user to core NormalizedUser type
   */
  private normalizeUser(user: PlexUser): NormalizedUser {
    return {
      id: user.id.toString(),
      externalId: user.id.toString(),
      name: (user.title !== '' ? user.title : user.username) ?? 'Unknown User',
      lastSeen: undefined, // Plex accounts endpoint doesn't provide last seen
      isAdmin: user.admin,
    };
  }

  /**
   * Normalize Plex history entry to core NormalizedActivity type
   */
  private normalizeActivity(entry: PlexHistoryEntry): NormalizedActivity {
    // Build full title for episodes
    let title = entry.title;
    if (entry.grandparentTitle !== undefined && entry.grandparentTitle !== '') {
      title = `${entry.grandparentTitle} - ${entry.title}`;
    }

    return {
      id: entry.historyKey.toString(),
      type: 'playback',
      name: `Watched ${title}`,
      overview:
        entry.parentTitle !== undefined && entry.parentTitle !== ''
          ? `${entry.grandparentTitle ?? ''} - ${entry.parentTitle}`
          : undefined,
      severity: 'info' as LogLevel,
      userId: entry.accountID.toString(),
      itemId: entry.ratingKey,
      timestamp: new Date(entry.viewedAt * 1000), // Convert Unix timestamp to Date
      metadata: {
        deviceID: entry.deviceID,
        librarySectionID: entry.librarySectionID,
        mediaType: entry.type,
      },
    };
  }
}
