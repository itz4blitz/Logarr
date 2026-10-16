/**
 * @logarr/provider-seerr
 * Seerr (Overseerr / Jellyseerr compatible) provider for Logarr
 */

// Provider
export { SeerrProvider } from './seerr.provider.js';

// Client
export { SeerrClient } from './seerr.client.js';
export type { SeerrPageOptions } from './seerr.client.js';

// Parser functions and config
export {
  parseSeerrLogLine,
  parseSeerrLogLineWithContext,
  isSeerrLogContinuation,
  SEERR_LOG_FILE_CONFIG,
  SEERR_CORRELATION_PATTERNS,
} from './seerr.parser.js';

// Types
export type {
  SeerrPageInfo,
  SeerrPaged,
  SeerrAbout,
  SeerrUser,
  SeerrMediaInfo,
  SeerrRequestSeason,
  SeerrRequest,
  SeerrIssueComment,
  SeerrIssue,
} from './seerr.types.js';

export { SeerrRequestStatus, SeerrIssueType, SeerrIssueStatus } from './seerr.types.js';
