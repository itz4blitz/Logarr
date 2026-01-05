/**
 * Core types and interfaces for Logarr
 *
 * This file contains all shared types used across the application.
 */

// =============================================================================
// Log Levels
// =============================================================================

/**
 * Supported log levels across all providers
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Provider capabilities - what features a media server provider supports
 */
export interface ProviderCapabilities {
  readonly supportsRealTimeLogs: boolean;
  readonly supportsActivityLog: boolean;
  readonly supportsSessions: boolean;
  readonly supportsWebhooks: boolean;
  readonly supportsPlaybackHistory: boolean;
}

/**
 * Configuration required to connect to a media server
 */
export interface ProviderConfig {
  readonly url: string;
  readonly apiKey: string;
  readonly logPath?: string | undefined;
}

/**
 * Connection test result
 */
export interface ConnectionStatus {
  readonly connected: boolean;
  readonly error?: string;
  readonly serverInfo?: ServerInfo;
}

/**
 * Basic server information
 */
export interface ServerInfo {
  readonly name: string;
  readonly version: string;
  readonly id: string;
}

/**
 * A parsed log entry from any provider
 */
export interface ParsedLogEntry {
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly message: string;
  readonly source?: string | undefined;
  readonly threadId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly userId?: string | undefined;
  readonly deviceId?: string | undefined;
  readonly itemId?: string | undefined;
  readonly playSessionId?: string | undefined;
  readonly raw: string;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly exception?: string | undefined;
  readonly stackTrace?: string | undefined;
}

/**
 * Pattern for extracting correlation IDs from log messages
 */
export interface CorrelationPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

// =============================================================================
// File-Based Log Ingestion Types
// =============================================================================

/**
 * Configuration for file-based log ingestion
 * Each provider specifies where to find log files and how to parse them
 */
export interface LogFileConfig {
  /** Default log directory paths by platform */
  readonly defaultPaths: {
    readonly docker: readonly string[];
    readonly linux: readonly string[];
    readonly windows: readonly string[];
    readonly macos: readonly string[];
  };
  /** File name patterns to match (glob patterns) */
  readonly filePatterns: readonly string[];
  /** File encoding (default: utf-8) */
  readonly encoding?: string | undefined;
  /** Whether log files rotate daily */
  readonly rotatesDaily?: boolean | undefined;
  /** Pattern to extract date from rotated filename */
  readonly datePattern?: RegExp | undefined;
}

/**
 * Context passed to log parser for multi-line handling
 */
export interface LogParseContext {
  /** Previous parsed entry (for multi-line assembly) */
  readonly previousEntry?: ParsedLogEntry | undefined;
  /** Accumulated continuation lines */
  readonly continuationLines: readonly string[];
  /** Current file being processed */
  readonly filePath: string;
  /** Line number in file */
  readonly lineNumber: number;
}

/**
 * Result from parsing a log line with context
 */
export interface LogParseResult {
  /** Parsed entry (null if line should be skipped or is a continuation) */
  readonly entry: ParsedLogEntry | null;
  /** Whether this line continues the previous entry (e.g., stack trace) */
  readonly isContinuation: boolean;
  /** Whether the previous entry is now complete and should be emitted */
  readonly previousComplete: boolean;
}

/**
 * State of a log file being tailed
 */
export interface LogFileState {
  readonly id: string;
  readonly serverId: string;
  readonly filePath: string;
  readonly absolutePath: string;
  readonly fileSize: bigint;
  readonly byteOffset: bigint;
  readonly lineNumber: number;
  readonly fileInode: string | null;
  readonly fileModifiedAt: Date | null;
  readonly lastReadAt: Date | null;
  readonly isActive: boolean;
  readonly lastError: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Options for tailing a log file
 */
export interface TailOptions {
  /** Server ID this file belongs to */
  readonly serverId: string;
  /** Path to the log file */
  readonly filePath: string;
  /** Resume from existing state if available */
  readonly resumeFromState?: LogFileState | undefined;
  /** Callback when entries are parsed */
  readonly onEntry: (entry: ParsedLogEntry) => Promise<void>;
  /** Callback on error */
  readonly onError: (error: Error) => void;
  /** Callback when rotation is detected */
  readonly onRotation?: () => void;
}

/**
 * Normalized session data across all providers
 */
export interface NormalizedSession {
  readonly id: string;
  readonly externalId: string;
  readonly userId?: string | undefined;
  readonly userName?: string | undefined;
  readonly deviceId: string;
  readonly deviceName?: string | undefined;
  readonly clientName?: string | undefined;
  readonly clientVersion?: string | undefined;
  readonly ipAddress?: string | undefined;
  readonly startedAt: Date;
  readonly lastActivity: Date;
  readonly isActive: boolean;
  readonly nowPlaying?: NowPlayingInfo | undefined;
}

/**
 * Currently playing media information
 */
export interface NowPlayingInfo {
  readonly itemId: string;
  readonly itemName: string;
  readonly itemType: string;
  readonly positionTicks: number;
  readonly durationTicks: number;
  readonly isPaused: boolean;
  readonly isMuted: boolean;
  readonly isTranscoding: boolean;
  readonly transcodeReasons?: readonly string[] | undefined;
  readonly videoCodec?: string | undefined;
  readonly audioCodec?: string | undefined;
  readonly container?: string | undefined;
  readonly thumbnailUrl?: string | undefined;
  readonly seriesName?: string | undefined;
  readonly seasonName?: string | undefined;
}

/**
 * Normalized user data across all providers
 */
export interface NormalizedUser {
  readonly id: string;
  readonly externalId: string;
  readonly name: string;
  readonly lastSeen?: Date | undefined;
  readonly isAdmin?: boolean | undefined;
}

/**
 * Normalized activity log entry
 */
export interface NormalizedActivity {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly overview?: string | undefined;
  readonly severity: LogLevel;
  readonly userId?: string | undefined;
  readonly itemId?: string | undefined;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown> | undefined;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Media server provider interface
 *
 * All providers (Jellyfin, Plex, Emby, etc.) must implement this interface
 * to provide a consistent API for log ingestion and session tracking.
 */
export interface MediaServerProvider {
  /**
   * Unique identifier for this provider (e.g., 'jellyfin', 'plex', 'emby')
   */
  readonly id: string;

  /**
   * Human-readable display name
   */
  readonly name: string;

  /**
   * Capabilities supported by this provider
   */
  readonly capabilities: ProviderCapabilities;

  /**
   * Initialize connection to the media server
   */
  connect(config: ProviderConfig): Promise<void>;

  /**
   * Disconnect from the media server
   */
  disconnect(): Promise<void>;

  /**
   * Test connection and return status
   */
  testConnection(): Promise<ConnectionStatus>;

  /**
   * Get paths to log files for this provider
   */
  getLogPaths(): Promise<readonly string[]>;

  /**
   * Parse a single log line into a structured entry
   * Returns null if the line cannot be parsed
   */
  parseLogLine(line: string): ParsedLogEntry | null;

  /**
   * Get patterns for extracting correlation IDs from log messages
   */
  getCorrelationPatterns(): readonly CorrelationPattern[];

  /**
   * Get current active sessions
   */
  getSessions(): Promise<readonly NormalizedSession[]>;

  /**
   * Get all users from the media server
   */
  getUsers(): Promise<readonly NormalizedUser[]>;

  /**
   * Get activity log entries since a given date
   */
  getActivity(since?: Date): Promise<readonly NormalizedActivity[]>;

  /**
   * Get server information
   */
  getServerInfo(): Promise<ServerInfo>;

  // ==========================================================================
  // File-Based Log Ingestion (optional - providers can choose to implement)
  // ==========================================================================

  /**
   * Get configuration for file-based log ingestion
   * Includes default paths, file patterns, and parsing options
   */
  getLogFileConfig?(): LogFileConfig;

  /**
   * Parse a log line with context for multi-line handling
   * Returns parsing result with continuation flag
   */
  parseLogLineWithContext?(line: string, context: LogParseContext): LogParseResult;

  /**
   * Check if a line is a continuation of a previous entry
   * (e.g., stack trace lines, wrapped messages)
   */
  isLogContinuation?(line: string): boolean;
}

/**
 * Provider registry for managing available providers
 */
export interface ProviderRegistry {
  /**
   * Register a new provider
   */
  register(provider: MediaServerProvider): void;

  /**
   * Get a provider by ID
   */
  get(id: string): MediaServerProvider | undefined;

  /**
   * Get all registered providers
   */
  getAll(): readonly MediaServerProvider[];

  /**
   * Check if a provider is registered
   */
  has(id: string): boolean;
}

// =============================================================================
// Database Models
// =============================================================================

/**
 * Server entity as stored in the database
 */
export interface Server {
  readonly id: string;
  readonly name: string;
  readonly providerId: string;
  readonly url: string;
  readonly apiKey: string;
  readonly logPath: string | null;
  readonly isEnabled: boolean;
  readonly isConnected: boolean;
  readonly lastSeen: Date | null;
  readonly lastError: string | null;
  readonly version: string | null;
  readonly serverName: string | null;
  readonly lastActivitySync: Date | null;
  // File-based log ingestion fields
  readonly fileIngestionEnabled: boolean;
  readonly logPaths: readonly string[] | null;
  readonly logFilePatterns: readonly string[] | null;
  readonly lastFileSync: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Data required to create a new server
 */
export interface CreateServerInput {
  readonly name: string;
  readonly providerId: string;
  readonly url: string;
  readonly apiKey: string;
  readonly logPath?: string;
}

/**
 * Data for updating an existing server
 */
export interface UpdateServerInput {
  readonly name?: string;
  readonly url?: string;
  readonly apiKey?: string;
  readonly logPath?: string;
  readonly isEnabled?: boolean;
  // File-based log ingestion fields
  readonly fileIngestionEnabled?: boolean;
  readonly logPaths?: readonly string[];
  readonly logFilePatterns?: readonly string[];
}

/**
 * Server with connection status for API responses
 */
export interface ServerWithStatus extends Server {
  readonly connectionStatus: 'connected' | 'disconnected' | 'error';
  readonly activeSessionCount?: number;
  readonly errorRate24h?: number;
}

/**
 * Log source type
 */
export type LogSource = 'api' | 'file';

/**
 * Log entry as stored in the database
 */
export interface LogEntry {
  readonly id: string;
  readonly serverId: string;
  readonly externalActivityId: string | null;
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly message: string;
  readonly source: string | null;
  readonly threadId: string | null;
  readonly raw: string;
  readonly sessionId: string | null;
  readonly userId: string | null;
  readonly deviceId: string | null;
  readonly itemId: string | null;
  readonly playSessionId: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly exception: string | null;
  readonly stackTrace: string | null;
  // File-based log ingestion fields
  readonly logSource: LogSource;
  readonly logFilePath: string | null;
  readonly logFileLine: number | null;
  readonly deduplicationKey: string | null;
  readonly createdAt: Date;
}

/**
 * Data required to create a new log entry
 */
export interface CreateLogEntryInput {
  readonly serverId: string;
  readonly externalActivityId?: string;
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly message: string;
  readonly source?: string;
  readonly threadId?: string;
  readonly raw: string;
  readonly sessionId?: string;
  readonly userId?: string;
  readonly deviceId?: string;
  readonly itemId?: string;
  readonly playSessionId?: string;
  readonly metadata?: Record<string, unknown>;
  readonly exception?: string;
  readonly stackTrace?: string;
  // File-based log ingestion fields
  readonly logSource?: LogSource;
  readonly logFilePath?: string;
  readonly logFileLine?: number;
  readonly deduplicationKey?: string;
}

/**
 * Query parameters for searching logs
 */
export interface LogSearchParams {
  readonly serverId?: string;
  readonly search?: string;
  readonly levels?: readonly LogLevel[];
  readonly sources?: readonly string[];
  readonly sessionId?: string;
  readonly userId?: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Aggregated log statistics
 */
export interface LogStats {
  readonly totalCount: number;
  readonly errorCount: number;
  readonly warnCount: number;
  readonly infoCount: number;
  readonly debugCount: number;
  readonly errorRate: number;
  readonly topSources: readonly SourceCount[];
  readonly topErrors: readonly ErrorSummary[];
}

/**
 * Count of logs per source
 */
export interface SourceCount {
  readonly source: string;
  readonly count: number;
}

/**
 * Summary of recurring errors
 */
export interface ErrorSummary {
  readonly message: string;
  readonly count: number;
  readonly lastOccurrence: Date;
  readonly sampleId: string;
}

/**
 * Session entity as stored in the database
 */
export interface Session {
  readonly id: string;
  readonly serverId: string;
  readonly externalId: string;
  readonly playSessionId: string | null;
  readonly userId: string | null;
  readonly userName: string | null;
  readonly deviceId: string;
  readonly deviceName: string | null;
  readonly clientName: string | null;
  readonly clientVersion: string | null;
  readonly ipAddress: string | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly lastActivity: Date;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Data required to create a new session
 */
export interface CreateSessionInput {
  readonly serverId: string;
  readonly externalId: string;
  readonly playSessionId?: string;
  readonly userId?: string;
  readonly userName?: string;
  readonly deviceId: string;
  readonly deviceName?: string;
  readonly clientName?: string;
  readonly clientVersion?: string;
  readonly ipAddress?: string;
}

/**
 * Playback event types
 */
export type PlaybackEventType = 'start' | 'progress' | 'pause' | 'resume' | 'stop' | 'error';

/**
 * Playback event entity
 */
export interface PlaybackEvent {
  readonly id: string;
  readonly sessionId: string;
  readonly eventType: PlaybackEventType;
  readonly itemId: string | null;
  readonly itemName: string | null;
  readonly itemType: string | null;
  readonly positionTicks: bigint | null;
  readonly durationTicks: bigint | null;
  readonly isPaused: boolean;
  readonly isMuted: boolean;
  readonly isTranscoding: boolean;
  readonly transcodeReasons: readonly string[];
  readonly videoCodec: string | null;
  readonly audioCodec: string | null;
  readonly container: string | null;
  readonly timestamp: Date;
}

/**
 * Session with related playback events for timeline view
 */
export interface SessionTimeline extends Session {
  readonly events: readonly PlaybackEvent[];
  readonly relatedLogCount: number;
}

/**
 * Query parameters for searching sessions
 */
export interface SessionSearchParams {
  readonly serverId?: string;
  readonly userId?: string;
  readonly deviceId?: string;
  readonly isActive?: boolean;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly limit?: number;
  readonly offset?: number;
}
