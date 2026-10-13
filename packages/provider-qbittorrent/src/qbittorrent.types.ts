/**
 * qBittorrent WebUI API v2 types
 */

/** Entry returned by GET /api/v2/log/main */
export interface QBittorrentLogEntry {
  readonly id: number;
  readonly message: string;
  /** Seconds since epoch (milliseconds before qBittorrent 4.5.0) */
  readonly timestamp: number;
  readonly type: number;
}

/** Subset of the torrent object returned by GET /api/v2/torrents/info */
export interface QBittorrentTorrent {
  readonly hash: string;
  readonly name: string;
  readonly state: string;
  readonly category?: string;
  readonly save_path?: string;
  readonly tracker?: string;
  readonly progress?: number;
}

/** Subset of GET /api/v2/transfer/info */
export interface QBittorrentTransferInfo {
  readonly connection_status: 'connected' | 'firewalled' | 'disconnected';
  readonly dht_nodes?: number;
}

/** Log message type bit flags */
export const QBITTORRENT_LOG_TYPE = {
  NORMAL: 1,
  INFO: 2,
  WARNING: 4,
  CRITICAL: 8,
} as const;

/**
 * How the client authenticates, derived from the stored credentials:
 * - login: username + password -> POST /auth/login and session cookie
 * - apiKey: no username, non-empty secret -> Authorization: Bearer (qBittorrent >= 5.2)
 * - none: no credentials (WebUI authentication bypass)
 */
export type QBittorrentAuthMode = 'login' | 'apiKey' | 'none';
