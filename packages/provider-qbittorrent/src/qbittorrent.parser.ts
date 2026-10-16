import { redactSecrets } from './qbittorrent.redact.js';

import type {
  CorrelationPattern,
  LogFileConfig,
  LogLevel,
  LogParseContext,
  LogParseResult,
  ParsedLogEntry,
} from '@logarr/core';

/**
 * qBittorrent file log format (qbittorrent.log):
 *   (N) 2026-10-10T12:00:01 - message
 * N = normal, I = info, W = warning, C = critical. Timestamps are local time without timezone.
 */
const LOG_LINE_REGEX = /^\((N|I|W|C)\) (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}) - (.*)$/;

const LEVEL_MAP: Record<string, LogLevel> = {
  N: 'info',
  I: 'info',
  W: 'warn',
  C: 'error',
};

const TORRENT_REGEX = /Torrent: "(.+?)"/;

export const QBITTORRENT_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/qbittorrent-logs', '/config/qBittorrent/logs'],
    linux: [
      '~/.local/share/qBittorrent/logs',
      '/var/lib/qbittorrent/.local/share/qBittorrent/logs',
    ],
    windows: ['%LOCALAPPDATA%\\qBittorrent\\logs'],
    macos: ['~/Library/Application Support/qBittorrent/logs'],
  },
  // Rotated backups (qbittorrent.log.bak*) are intentionally not matched to avoid duplicates
  filePatterns: ['qbittorrent.log'],
  encoding: 'utf-8',
  rotatesDaily: false,
};

export const QBITTORRENT_CORRELATION_PATTERNS: readonly CorrelationPattern[] = [
  { name: 'ip', pattern: /IP:\s*([0-9a-f:.]+)/i },
];

/**
 * Parse a single qbittorrent.log line. Returns null for non-matching lines.
 */
export function parseQBittorrentLogLine(line: string): ParsedLogEntry | null {
  const trimmed = line.replace(/\r$/, '');
  const match = LOG_LINE_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, letter = '', time = '', rawMessage = ''] = match;
  const timestamp = new Date(time);
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }
  const message = redactSecrets(rawMessage);
  const torrent = TORRENT_REGEX.exec(message)?.[1];

  return {
    timestamp,
    level: LEVEL_MAP[letter] ?? 'info',
    message,
    source: 'qBittorrent',
    raw: redactSecrets(trimmed),
    metadata: {
      qbLevel: letter,
      ...(torrent !== undefined && { torrent }),
    },
  };
}

/**
 * qBittorrent log entries are single-line, so there is never a continuation.
 */
export function parseQBittorrentLogLineWithContext(
  line: string,
  _context: LogParseContext
): LogParseResult {
  return {
    entry: parseQBittorrentLogLine(line),
    isContinuation: false,
    previousComplete: false,
  };
}

export function isQBittorrentLogContinuation(_line: string): boolean {
  return false;
}
