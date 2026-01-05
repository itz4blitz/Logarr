/**
 * Shared types for *arr applications (Sonarr, Radarr, Lidarr, etc.)
 * These applications share a common API structure since they're all forks of the same codebase.
 */

// ============================================================================
// API Response Types
// ============================================================================

/**
 * System status response from /api/v3/system/status
 */
export interface ArrSystemStatus {
  readonly appName: string;
  readonly instanceName: string;
  readonly version: string;
  readonly buildTime: string;
  readonly isDebug: boolean;
  readonly isProduction: boolean;
  readonly isAdmin: boolean;
  readonly isUserInteractive: boolean;
  readonly startupPath: string;
  readonly appData: string;
  readonly osName: string;
  readonly osVersion: string;
  readonly isNetCore: boolean;
  readonly isLinux: boolean;
  readonly isOsx: boolean;
  readonly isWindows: boolean;
  readonly isDocker: boolean;
  readonly mode: string;
  readonly branch: string;
  readonly authentication: string;
  readonly sqliteVersion: string;
  readonly migrationVersion: number;
  readonly urlBase: string;
  readonly runtimeVersion: string;
  readonly runtimeName: string;
  readonly startTime: string;
  readonly packageVersion: string;
  readonly packageAuthor: string;
  readonly packageUpdateMechanism: string;
}

/**
 * Health check response from /api/v3/health
 */
export interface ArrHealthCheck {
  readonly source: string;
  readonly type: 'ok' | 'notice' | 'warning' | 'error';
  readonly message: string;
  readonly wikiUrl?: string;
}

/**
 * Log entry from /api/v3/log
 */
export interface ArrLogEntry {
  readonly id: number;
  readonly time: string;
  readonly level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  readonly logger: string;
  readonly message: string;
  readonly exception?: string;
  readonly exceptionType?: string;
}

/**
 * Paginated response wrapper
 */
export interface ArrPaginatedResponse<T> {
  readonly page: number;
  readonly pageSize: number;
  readonly sortKey: string;
  readonly sortDirection: 'ascending' | 'descending' | 'default';
  readonly totalRecords: number;
  readonly records: readonly T[];
}

/**
 * Quality model used in history/queue
 */
export interface ArrQuality {
  readonly quality: {
    readonly id: number;
    readonly name: string;
    readonly source: string;
    readonly resolution: number;
  };
  readonly revision: {
    readonly version: number;
    readonly real: number;
    readonly isRepack: boolean;
  };
}

/**
 * Base history record - common fields across all *arr apps
 */
export interface ArrHistoryRecordBase {
  readonly id: number;
  readonly date: string;
  readonly eventType: string;
  readonly sourceTitle: string;
  readonly quality: ArrQuality;
  readonly qualityCutoffNotMet: boolean;
  readonly customFormats: readonly { readonly id: number; readonly name: string }[];
  readonly customFormatScore: number;
  readonly downloadId?: string;
  readonly data: Record<string, string | number | boolean | undefined>;
}

/**
 * Queue item - common fields across all *arr apps
 */
export interface ArrQueueItemBase {
  readonly id: number;
  readonly size: number;
  readonly sizeleft: number;
  readonly timeleft?: string;
  readonly estimatedCompletionTime?: string;
  readonly status: string;
  readonly trackedDownloadStatus: string;
  readonly trackedDownloadState: string;
  readonly statusMessages: readonly {
    readonly title: string;
    readonly messages: readonly string[];
  }[];
  readonly errorMessage?: string;
  readonly downloadId: string;
  readonly protocol: string;
  readonly downloadClient: string;
  readonly indexer: string;
  readonly outputPath?: string;
  readonly title: string;
  readonly quality: ArrQuality;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Common history event types across *arr applications
 */
export type ArrCommonEventType =
  | 'unknown'
  | 'grabbed'
  | 'downloadFolderImported'
  | 'downloadFailed'
  | 'deleted'
  | 'renamed'
  | 'importFailed';

/**
 * Sonarr-specific event types
 */
export type SonarrEventType =
  | ArrCommonEventType
  | 'seriesFolderImported'
  | 'episodeFileDeleted'
  | 'episodeFileRenamed';

/**
 * Radarr-specific event types
 */
export type RadarrEventType =
  | ArrCommonEventType
  | 'movieFileDeleted'
  | 'movieFileRenamed'
  | 'movieFolderImported'
  | 'ignored';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Extended provider config for *arr apps
 */
export interface ArrProviderConfig {
  readonly url: string;
  readonly apiKey: string;
  readonly logPath?: string;
  /**
   * Whether to include history events (can be verbose)
   * @default true
   */
  readonly includeHistory?: boolean;
  /**
   * Whether to include queue items
   * @default true
   */
  readonly includeQueue?: boolean;
  /**
   * Whether to include health checks
   * @default true
   */
  readonly includeHealth?: boolean;
}

// ============================================================================
// Normalized Activity Types
// ============================================================================

/**
 * Activity types we generate from *arr events
 */
export type ArrActivityType =
  | 'grab'
  | 'download_complete'
  | 'download_failed'
  | 'import_complete'
  | 'import_failed'
  | 'upgrade'
  | 'deleted'
  | 'renamed'
  | 'health_warning'
  | 'health_error'
  | 'queue_warning';

/**
 * Normalized activity for display
 */
export interface ArrNormalizedActivity {
  readonly id: string;
  readonly type: ArrActivityType;
  readonly timestamp: Date;
  readonly title: string;
  readonly description: string;
  readonly severity: 'info' | 'warn' | 'error';
  readonly mediaTitle?: string;
  readonly mediaType?: 'series' | 'movie' | 'artist' | 'book';
  readonly quality?: string;
  readonly downloadClient?: string;
  readonly indexer?: string;
  readonly metadata?: Record<string, unknown>;
}
