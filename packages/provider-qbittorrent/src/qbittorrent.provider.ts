import { QBittorrentClient } from './qbittorrent.client.js';
import {
  QBITTORRENT_CORRELATION_PATTERNS,
  QBITTORRENT_LOG_FILE_CONFIG,
  isQBittorrentLogContinuation,
  parseQBittorrentLogLine,
  parseQBittorrentLogLineWithContext,
} from './qbittorrent.parser.js';
import { redactSecrets, trackerHost } from './qbittorrent.redact.js';
import { QBITTORRENT_LOG_TYPE } from './qbittorrent.types.js';

import type { QBittorrentLogEntry } from './qbittorrent.types.js';
import type {
  ConnectionStatus,
  CorrelationPattern,
  LogFileConfig,
  LogLevel,
  LogParseContext,
  LogParseResult,
  MediaServerProvider,
  NormalizedActivity,
  NormalizedSession,
  NormalizedUser,
  ParsedLogEntry,
  ProviderCapabilities,
  ProviderConfig,
  ServerInfo,
} from '@logarr/core';

/** Newest log messages ingested on the very first poll when no "since" is known */
const INITIAL_LOG_LIMIT = 500;
/** How often an empty log response triggers a full resync (detects qBittorrent restarts) */
const LOG_RESYNC_INTERVAL_MS = 10 * 60_000;

interface LogCursor {
  lastId: number;
  lastTs: number;
  fullSyncAt: number;
}

/**
 * Log cursors per qBittorrent instance. Module-level because the provider is a singleton that
 * is disconnected after every poll.
 */
const logCursors = new Map<string, LogCursor>();

/**
 * Last seen connection status and the day it was last reported, per qBittorrent instance.
 * Used to only emit connection activities on change (plus once per day while unhealthy).
 */
const connectionStates = new Map<string, { status: string; reportedDay: string | null }>();

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** qBittorrent < 4.5.0 reports milliseconds, newer versions seconds */
function toMillis(timestamp: number): number {
  return timestamp > 1e11 ? timestamp : timestamp * 1000;
}

function severityOf(type: number): LogLevel {
  return type === QBITTORRENT_LOG_TYPE.CRITICAL ? 'error' : 'warn';
}

/**
 * qBittorrent download client provider.
 *
 * Supports username/password (cookie session), API keys (qBittorrent >= 5.3) and
 * authentication bypass. Credentials: `apiKey` holds the password (or the API key when no
 * username is configured).
 */
export class QBittorrentProvider implements MediaServerProvider {
  readonly id = 'qbittorrent';
  readonly name = 'qBittorrent';

  readonly capabilities: ProviderCapabilities = {
    supportsRealTimeLogs: false,
    supportsActivityLog: true,
    supportsSessions: false,
    supportsWebhooks: false,
    supportsPlaybackHistory: false,
  };

  private config: ProviderConfig | null = null;
  private client: QBittorrentClient | null = null;

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.client = new QBittorrentClient(config.url, {
      username: config.username,
      secret: config.apiKey,
    });

    const status = await this.testConnection();
    if (!status.connected) {
      throw new Error(status.error ?? 'Connection failed');
    }
  }

  disconnect(): Promise<void> {
    // Sessions and cursors live in module-level maps on purpose
    this.client = null;
    this.config = null;
    return Promise.resolve();
  }

  async testConnection(): Promise<ConnectionStatus> {
    try {
      return { connected: true, serverInfo: await this.getServerInfo() };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getServerInfo(): Promise<ServerInfo> {
    const client = this.requireClient();
    const version = (await client.getVersion()).trim();
    const webApi = (await client.getWebApiVersion()).trim();
    return {
      name: 'qBittorrent',
      version: version.replace(/^v/i, ''),
      id: `qbittorrent-webapi-${webApi}`,
    };
  }

  getLogPaths(): Promise<readonly string[]> {
    const logPath = this.config?.logPath?.trim();
    if (logPath !== undefined && logPath !== '') {
      return Promise.resolve([logPath]);
    }
    return Promise.resolve([
      '/qbittorrent-logs',
      // linuxserver/qbittorrent (profile under /config) - best guess, verify in your container
      '/config/qBittorrent/logs',
      // hotio/qbittorrent - best guess, verify in your container
      '/config/logs',
      '~/.local/share/qBittorrent/logs',
      'C:\\Users\\<user>\\AppData\\Local\\qBittorrent\\logs',
    ]);
  }

  parseLogLine(line: string): ParsedLogEntry | null {
    return parseQBittorrentLogLine(line);
  }

  getCorrelationPatterns(): readonly CorrelationPattern[] {
    return QBITTORRENT_CORRELATION_PATTERNS;
  }

  getSessions(): Promise<readonly NormalizedSession[]> {
    return Promise.resolve([]);
  }

  getUsers(): Promise<readonly NormalizedUser[]> {
    return Promise.resolve([]);
  }

  getLogFileConfig(): LogFileConfig {
    return QBITTORRENT_LOG_FILE_CONFIG;
  }

  parseLogLineWithContext(line: string, context: LogParseContext): LogParseResult {
    return parseQBittorrentLogLineWithContext(line, context);
  }

  isLogContinuation(line: string): boolean {
    return isQBittorrentLogContinuation(line);
  }

  async getActivity(since?: Date): Promise<readonly NormalizedActivity[]> {
    const client = this.requireClient();
    const activities: NormalizedActivity[] = [];

    // (a) Warning/critical log messages. Skipped when the log file is tailed instead.
    if ((this.config?.logPath?.trim() ?? '') === '') {
      try {
        activities.push(...(await this.fetchLogActivities(client, since)));
      } catch (error) {
        console.error('[qbittorrent] Failed to fetch log messages:', this.describe(error));
      }
    }

    // (b) Errored torrents
    try {
      activities.push(...(await this.fetchTorrentErrors(client)));
    } catch (error) {
      console.error('[qbittorrent] Failed to fetch errored torrents:', this.describe(error));
    }

    // (c) Connection status
    try {
      activities.push(...(await this.fetchConnectionStatus(client)));
    } catch (error) {
      console.error('[qbittorrent] Failed to fetch transfer info:', this.describe(error));
    }

    return activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // ---------------------------------------------------------------------------
  // Activity sources
  // ---------------------------------------------------------------------------

  private async fetchLogActivities(
    client: QBittorrentClient,
    since: Date | undefined
  ): Promise<NormalizedActivity[]> {
    const now = Date.now();
    const cursor = logCursors.get(client.baseUrl);
    let entries = await client.getLog(cursor?.lastId ?? -1);
    let keepAfter: number | undefined;
    let capNewest = false;
    let resynced = false;

    if (cursor === undefined) {
      keepAfter = since?.getTime() ?? 0;
      capNewest = since === undefined;
    } else if (cursor.lastId >= 0 && entries.some((entry) => entry.id <= cursor.lastId)) {
      // ids went backwards (qBittorrent restarted): everything returned is new, filter by time
      keepAfter = cursor.lastTs;
      resynced = true;
    } else if (
      entries.length === 0 &&
      cursor.lastId >= 0 &&
      now - cursor.fullSyncAt > LOG_RESYNC_INTERVAL_MS
    ) {
      // ids restart at 0 after a qBittorrent restart; re-read the whole buffer
      entries = await client.getLog(-1);
      keepAfter = cursor.lastTs;
      resynced = true;
    }

    const relevant = entries.filter(
      (entry) =>
        (entry.type === QBITTORRENT_LOG_TYPE.WARNING ||
          entry.type === QBITTORRENT_LOG_TYPE.CRITICAL) &&
        (keepAfter === undefined || toMillis(entry.timestamp) > keepAfter)
    );

    const maxId = entries.reduce((max, entry) => Math.max(max, entry.id), -1);
    const maxTs = entries.reduce((max, entry) => Math.max(max, toMillis(entry.timestamp)), 0);
    const previousId = cursor?.lastId ?? -1;
    let lastId = Math.max(maxId, previousId);
    if (resynced && entries.length > 0) {
      // ids restarted: trust the new (possibly lower) maximum
      lastId = maxId;
    }
    logCursors.set(client.baseUrl, {
      lastId,
      lastTs: Math.max(maxTs, cursor?.lastTs ?? 0),
      fullSyncAt: cursor === undefined || resynced ? now : cursor.fullSyncAt,
    });

    const selected = capNewest
      ? [...relevant].sort((a, b) => a.timestamp - b.timestamp).slice(-INITIAL_LOG_LIMIT)
      : relevant;

    return selected.map((entry) => this.toLogActivity(entry));
  }

  private toLogActivity(entry: QBittorrentLogEntry): NormalizedActivity {
    const timestampMs = toMillis(entry.timestamp);
    const message = redactSecrets(entry.message);
    return {
      id: `qbittorrent-log-${Math.floor(timestampMs / 1000)}-${entry.id}`,
      type: 'Log',
      name: truncate(message, 120),
      overview: message,
      severity: severityOf(entry.type),
      timestamp: new Date(timestampMs),
      metadata: { qbId: entry.id, qbType: entry.type },
    };
  }

  private async fetchTorrentErrors(client: QBittorrentClient): Promise<NormalizedActivity[]> {
    const torrents = await client.getErroredTorrents();
    // Synthetic detection time. Note: it also advances lastActivitySync (accepted trade-off:
    // the log feed re-reads from its own id cursor, so no log messages are lost).
    const timestamp = new Date();
    const day = timestamp.toISOString().slice(0, 10);
    return torrents.map((torrent) => ({
      // Day bucket: a persisting/recurring error is re-announced at most once per day
      id: `qbittorrent-torrent-error-${torrent.hash}-${torrent.state}-${day}`,
      type: 'TorrentError',
      name: `Torrent error: ${torrent.name}`,
      overview:
        `${torrent.name} is in state "${torrent.state}"` +
        (torrent.category !== undefined && torrent.category !== ''
          ? ` (category: ${torrent.category})`
          : ''),
      severity: 'error' as const,
      itemId: torrent.hash,
      timestamp,
      metadata: {
        hash: torrent.hash,
        state: torrent.state,
        category: torrent.category,
        // Host only: private tracker URLs embed the account passkey
        tracker: trackerHost(torrent.tracker),
        progress: torrent.progress,
      },
    }));
  }

  private async fetchConnectionStatus(client: QBittorrentClient): Promise<NormalizedActivity[]> {
    const info = await client.getTransferInfo();
    const status = info.connection_status;
    const previous = connectionStates.get(client.baseUrl);

    if (status !== 'firewalled' && status !== 'disconnected') {
      connectionStates.set(client.baseUrl, { status, reportedDay: null });
      return [];
    }

    // Synthetic detection time (see fetchTorrentErrors)
    const timestamp = new Date();
    const day = timestamp.toISOString().slice(0, 10);
    if (previous?.status === status && previous.reportedDay === day) {
      return [];
    }
    connectionStates.set(client.baseUrl, { status, reportedDay: day });

    return [
      {
        id: `qbittorrent-connection-${status}-${day}`,
        type: 'ConnectionStatus',
        name: `qBittorrent connection status: ${status}`,
        overview: `qBittorrent reports it is ${status} (check port forwarding / network binding)`,
        severity: status === 'disconnected' ? 'error' : 'warn',
        timestamp,
        metadata: {
          connectionStatus: status,
          dhtNodes: info.dht_nodes,
        },
      },
    ];
  }

  private requireClient(): QBittorrentClient {
    if (!this.client) {
      throw new Error('qBittorrent provider is not connected');
    }
    return this.client;
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
