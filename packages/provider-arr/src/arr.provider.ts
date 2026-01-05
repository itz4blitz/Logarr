/**
 * Base provider class for *arr applications
 * Implements common functionality shared by Sonarr, Radarr, etc.
 */

import { ArrClient } from './arr.client.js';
import {
  parseArrLogLine,
  parseArrLogLineWithContext,
  isArrLogContinuation,
  ARR_LOG_FILE_CONFIG,
} from './arr.parser.js';

import type {
  ArrHealthCheck,
  ArrHistoryRecordBase,
  ArrQueueItemBase,
  ArrActivityType,
} from './arr.types.js';
import type {
  MediaServerProvider,
  ProviderCapabilities,
  ProviderConfig,
  ConnectionStatus,
  ParsedLogEntry,
  CorrelationPattern,
  NormalizedSession,
  NormalizedUser,
  NormalizedActivity,
  ServerInfo,
} from '@logarr/core';

// Local interfaces until core package is rebuilt
interface LogFileConfig {
  defaultPaths: {
    docker: readonly string[];
    linux: readonly string[];
    windows: readonly string[];
    macos: readonly string[];
  };
  filePatterns: readonly string[];
  encoding?: string;
  rotatesDaily?: boolean;
  datePattern?: RegExp;
}

interface LogParseContext {
  previousEntry?: ParsedLogEntry;
  continuationLines: string[];
  filePath: string;
  lineNumber: number;
}

interface LogParseResult {
  entry: ParsedLogEntry | null;
  isContinuation: boolean;
  previousComplete: boolean;
}

/**
 * Abstract base provider for *arr applications
 * Subclasses must implement app-specific methods
 */
export abstract class ArrBaseProvider implements MediaServerProvider {
  abstract readonly id: string;
  abstract readonly name: string;

  readonly capabilities: ProviderCapabilities = {
    supportsRealTimeLogs: false, // *arr apps don't support real-time log tailing easily
    supportsActivityLog: true, // They have history API
    supportsSessions: false, // They don't have playback sessions
    supportsWebhooks: true, // They support outbound webhooks
    supportsPlaybackHistory: false, // Not media players
  };

  protected client: ArrClient | null = null;
  protected config: ProviderConfig | null = null;

  /**
   * Last sync timestamp for incremental polling
   */
  protected lastHistorySync: Date | null = null;

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.client = this.createClient(config.url, config.apiKey);
    await this.client.testConnection();
  }

  disconnect(): Promise<void> {
    this.client = null;
    this.config = null;
    return Promise.resolve();
  }

  async testConnection(): Promise<ConnectionStatus> {
    if (!this.client) {
      return { connected: false, error: 'Not initialized' };
    }

    try {
      const status = await this.client.getSystemStatus();
      return {
        connected: true,
        serverInfo: {
          name:
            status.instanceName !== undefined && status.instanceName !== ''
              ? status.instanceName
              : status.appName,
          version: status.version,
          id: `${status.appName}-${status.branch}`,
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
    // *arr apps store logs in their app data folder
    // The exact path varies by installation
    return Promise.resolve([]);
  }

  /**
   * Parse a single log line (NLog format)
   */
  parseLogLine(line: string): ParsedLogEntry | null {
    return parseArrLogLine(line);
  }

  /**
   * Get log file configuration for this provider
   * Subclasses should override this to provide app-specific paths
   */
  getLogFileConfig(): LogFileConfig {
    return ARR_LOG_FILE_CONFIG;
  }

  /**
   * Parse a log line with context for multi-line support
   */
  parseLogLineWithContext(line: string, context: LogParseContext): LogParseResult {
    return parseArrLogLineWithContext(line, context);
  }

  /**
   * Check if a line is a continuation of the previous entry
   */
  isLogContinuation(line: string): boolean {
    return isArrLogContinuation(line);
  }

  getCorrelationPatterns(): readonly CorrelationPattern[] {
    // *arr apps don't have the same correlation IDs as media players
    return [
      { name: 'downloadId', pattern: /DownloadId[=:\s]+"?([a-zA-Z0-9]+)"?/i },
      { name: 'indexer', pattern: /Indexer[=:\s]+"?([^"\s,]+)"?/i },
    ];
  }

  getSessions(): Promise<readonly NormalizedSession[]> {
    // *arr apps don't have playback sessions
    return Promise.resolve([]);
  }

  getUsers(): Promise<readonly NormalizedUser[]> {
    // *arr apps don't expose user management through API
    return Promise.resolve([]);
  }

  async getActivity(since?: Date): Promise<readonly NormalizedActivity[]> {
    const client = this.getClient();
    const activities: NormalizedActivity[] = [];

    // Get health checks and convert to activities
    try {
      const healthChecks = await client.getHealth();
      const healthActivities = this.normalizeHealthChecks(healthChecks);
      activities.push(...healthActivities);
    } catch (error) {
      console.error(`[${this.id}] Failed to get health checks:`, error);
    }

    // Get history and convert to activities
    try {
      const historyResponse = await this.getHistoryRecords(since);
      const historyActivities = historyResponse.map((record) =>
        this.normalizeHistoryRecord(record)
      );
      activities.push(...historyActivities);
    } catch (error) {
      console.error(`[${this.id}] Failed to get history:`, error);
    }

    // Get queue warnings
    try {
      const queueResponse = await client.getQueue({ pageSize: 100 });
      const queueActivities = this.normalizeQueueItems(queueResponse.records);
      activities.push(...queueActivities);
    } catch (error) {
      console.error(`[${this.id}] Failed to get queue:`, error);
    }

    return activities;
  }

  async getServerInfo(): Promise<ServerInfo> {
    const client = this.getClient();
    const status = await client.getSystemStatus();
    return {
      name:
        status.instanceName !== undefined && status.instanceName !== ''
          ? status.instanceName
          : status.appName,
      version: status.version,
      id: `${status.appName}-${status.branch}`,
    };
  }

  // ============================================================================
  // Protected helpers
  // ============================================================================

  protected getClient(): ArrClient {
    if (!this.client) {
      throw new Error('Not connected');
    }
    return this.client;
  }

  /**
   * Create the appropriate client for this provider
   * Can be overridden by subclasses for custom client behavior
   */
  protected createClient(url: string, apiKey: string): ArrClient {
    return new ArrClient(url, apiKey);
  }

  /**
   * Get history records - to be implemented by subclasses for proper typing
   */
  protected abstract getHistoryRecords(since?: Date): Promise<readonly ArrHistoryRecordBase[]>;

  /**
   * Normalize a history record to activity - to be implemented by subclasses
   */
  protected abstract normalizeHistoryRecord(record: ArrHistoryRecordBase): NormalizedActivity;

  /**
   * Get the media type for this provider
   */
  protected abstract getMediaType(): 'series' | 'movie' | 'artist' | 'book';

  /**
   * Normalize health checks to activities
   */
  protected normalizeHealthChecks(checks: readonly ArrHealthCheck[]): NormalizedActivity[] {
    return checks
      .filter((check) => check.type === 'warning' || check.type === 'error')
      .map((check) => ({
        id: `health-${check.source}-${Date.now()}`,
        type: check.type === 'error' ? 'health_error' : 'health_warning',
        name: `Health ${check.type}: ${check.source}`,
        overview: check.message,
        severity: check.type === 'error' ? 'error' : ('warn' as const),
        timestamp: new Date(),
      }));
  }

  /**
   * Normalize queue items with issues to activities
   */
  protected normalizeQueueItems(items: readonly ArrQueueItemBase[]): NormalizedActivity[] {
    return items
      .filter((item) => item.trackedDownloadStatus === 'warning' || item.errorMessage !== undefined)
      .map((item) => ({
        id: `queue-${item.downloadId}-${Date.now()}`,
        type: 'queue_warning' as const,
        name: `Queue issue: ${item.title}`,
        overview:
          item.errorMessage ?? item.statusMessages.map((m) => m.messages.join(', ')).join('; '),
        severity: 'warn' as const,
        timestamp: new Date(),
      }));
  }

  /**
   * Map event type string to activity type
   */
  protected mapEventTypeToActivityType(eventType: string): ArrActivityType {
    const eventMap: Record<string, ArrActivityType> = {
      grabbed: 'grab',
      downloadFolderImported: 'import_complete',
      seriesFolderImported: 'import_complete',
      movieFolderImported: 'import_complete',
      downloadFailed: 'download_failed',
      importFailed: 'import_failed',
      deleted: 'deleted',
      episodeFileDeleted: 'deleted',
      movieFileDeleted: 'deleted',
      renamed: 'renamed',
      episodeFileRenamed: 'renamed',
      movieFileRenamed: 'renamed',
    };
    return eventMap[eventType] ?? 'grab';
  }

  /**
   * Map activity type to severity
   */
  protected mapActivityTypeToSeverity(type: ArrActivityType): 'info' | 'warn' | 'error' {
    switch (type) {
      case 'download_failed':
      case 'import_failed':
      case 'health_error':
        return 'error';
      case 'health_warning':
      case 'queue_warning':
        return 'warn';
      default:
        return 'info';
    }
  }
}
