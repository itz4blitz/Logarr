// qBittorrent provider for Logarr
export { QBittorrentProvider } from './qbittorrent.provider.js';
export { QBittorrentClient } from './qbittorrent.client.js';
export {
  QBITTORRENT_CORRELATION_PATTERNS,
  QBITTORRENT_LOG_FILE_CONFIG,
  isQBittorrentLogContinuation,
  parseQBittorrentLogLine,
  parseQBittorrentLogLineWithContext,
} from './qbittorrent.parser.js';
export { resetQBittorrentState } from './qbittorrent.state.js';

// Types
export type {
  QBittorrentAuthMode,
  QBittorrentLogEntry,
  QBittorrentTorrent,
  QBittorrentTransferInfo,
} from './qbittorrent.types.js';

export { QBITTORRENT_LOG_TYPE } from './qbittorrent.types.js';
