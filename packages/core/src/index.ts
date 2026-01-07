// Re-export HTTP utilities
export {
  httpRequest,
  HttpError,
  formatHttpError,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRIES,
  RETRY_DELAY_MS,
} from './http.js';
export type { HttpErrorType, HttpRequestOptions } from './http.js';

// Re-export all types
export type {
  // Log levels
  LogLevel,
  LogSource,
  // Provider types
  ProviderCapabilities,
  ProviderConfig,
  ConnectionStatus,
  ServerInfo,
  ParsedLogEntry,
  CorrelationPattern,
  NormalizedSession,
  NowPlayingInfo,
  NormalizedUser,
  NormalizedActivity,
  // File-based log ingestion types
  LogFileConfig,
  LogParseContext,
  LogParseResult,
  LogFileState,
  TailOptions,
  // Provider interface
  MediaServerProvider,
  ProviderRegistry,
  // Server models
  Server,
  CreateServerInput,
  UpdateServerInput,
  ServerWithStatus,
  // Log entry models
  LogEntry,
  CreateLogEntryInput,
  LogSearchParams,
  LogStats,
  SourceCount,
  ErrorSummary,
  // Session models
  Session,
  CreateSessionInput,
  PlaybackEventType,
  PlaybackEvent,
  SessionTimeline,
  SessionSearchParams,
} from './types.js';
