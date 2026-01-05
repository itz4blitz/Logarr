/**
 * @logarr/provider-plex
 * Plex Media Server provider for Logarr
 */

// Provider
export { PlexProvider } from './plex.provider.js';

// Client
export { PlexClient } from './plex.client.js';

// Parser functions and config
export {
  parsePlexLogLine,
  parsePlexLogLineWithContext,
  isPlexLogContinuation,
  isExceptionContinuation,
  PLEX_LOG_FILE_CONFIG,
  PLEX_CORRELATION_PATTERNS,
} from './plex.parser.js';

// Types
export type {
  // Server info
  PlexServerInfo,
  // Sessions
  PlexSession,
  PlexSessionsResponse,
  PlexPlayer,
  PlexSessionInfo,
  PlexSessionUser,
  PlexTranscodeSession,
  // History
  PlexHistoryEntry,
  PlexHistoryResponse,
  // Users
  PlexUser,
  PlexAccountsResponse,
  PlexServer,
  // WebSocket
  PlexWebSocketMessage,
  PlexWebSocketEvents,
  PlexNotificationType,
  PlexPlaySessionNotification,
  PlexActivityNotification,
  PlexStatusNotification,
  PlexTimelineEntry,
  PlexTimelineNotification,
} from './plex.types.js';
