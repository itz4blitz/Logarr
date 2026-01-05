/**
 * @logarr/provider-emby
 * Emby Media Server provider for Logarr
 */

// Provider
export { EmbyProvider } from './emby.provider.js';

// Client
export { EmbyClient } from './emby.client.js';

// Parser functions and config
export {
  parseEmbyLogLine,
  parseEmbyLogLineWithContext,
  isEmbyLogContinuation,
  isExceptionContinuation,
  EMBY_LOG_FILE_CONFIG,
  EMBY_CORRELATION_PATTERNS,
} from './emby.parser.js';

// Types
export type {
  // Server info
  EmbySystemInfo,
  // Sessions
  EmbySession,
  EmbyNowPlayingItem,
  EmbyPlayState,
  EmbyTranscodingInfo,
  // Users
  EmbyUser,
  EmbyUserPolicy,
  // Activity
  EmbyActivityLogEntry,
  EmbyQueryResult,
  // Log files
  EmbyLogFile,
  // WebSocket
  EmbyWebSocketMessage,
  EmbyWebSocketEvents,
  EmbyWebSocketMessageType,
  EmbySessionsData,
  EmbyPlaybackProgressData,
  EmbyPlaybackEventData,
} from './emby.types.js';
