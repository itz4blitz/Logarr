// Base provider and client for *arr applications
export { ArrBaseProvider } from './arr.provider.js';
export { ArrClient } from './arr.client.js';

// Parser utilities for file-based log ingestion
export {
  parseArrLogLine,
  parseArrLogLineWithContext,
  isArrLogContinuation,
  extractArrMetadata,
  getArrSeverityBoost,
  ARR_LOG_FILE_CONFIG,
  SONARR_LOG_FILE_CONFIG,
  RADARR_LOG_FILE_CONFIG,
  LIDARR_LOG_FILE_CONFIG,
  READARR_LOG_FILE_CONFIG,
  PROWLARR_LOG_FILE_CONFIG,
  WHISPARR_LOG_FILE_CONFIG,
} from './arr.parser.js';

// Types
export type {
  ArrSystemStatus,
  ArrHealthCheck,
  ArrLogEntry,
  ArrPaginatedResponse,
  ArrQuality,
  ArrHistoryRecordBase,
  ArrQueueItemBase,
  ArrCommonEventType,
  SonarrEventType,
  RadarrEventType,
  ArrProviderConfig,
  ArrActivityType,
  ArrNormalizedActivity,
} from './arr.types.js';
