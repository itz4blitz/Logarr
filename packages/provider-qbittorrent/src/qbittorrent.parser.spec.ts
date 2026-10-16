import { performance } from 'node:perf_hooks';

import { describe, it, expect } from 'vitest';

import {
  QBITTORRENT_LOG_FILE_CONFIG,
  isQBittorrentLogContinuation,
  parseQBittorrentLogLine,
  parseQBittorrentLogLineWithContext,
} from './qbittorrent.parser.js';

describe('parseQBittorrentLogLine', () => {
  it('parses a normal line as info', () => {
    const entry = parseQBittorrentLogLine('(N) 2026-10-10T12:00:01 - qBittorrent v5.2.4 started');
    expect(entry).not.toBeNull();
    expect(entry?.level).toBe('info');
    expect(entry?.message).toBe('qBittorrent v5.2.4 started');
    expect(entry?.timestamp).toEqual(new Date('2026-10-10T12:00:01'));
    expect(entry?.source).toBe('qBittorrent');
    expect(entry?.metadata?.['qbLevel']).toBe('N');
  });

  it('parses an info line as info', () => {
    const entry = parseQBittorrentLogLine(
      '(I) 2026-10-10T12:00:02 - Trying to listen on the following list of IP addresses: "0.0.0.0:6881,[::]:6881"'
    );
    expect(entry?.level).toBe('info');
    expect(entry?.message).toContain('0.0.0.0:6881');
  });

  it('parses a warning line as warn and extracts the torrent name', () => {
    const entry = parseQBittorrentLogLine(
      '(W) 2026-10-10T12:01:15 - File error alert. Torrent: "Some.Torrent.Name". File: "/downloads/x.mkv". Reason: "x.mkv file_open (/downloads/x.mkv) error: Permission denied"'
    );
    expect(entry?.level).toBe('warn');
    expect(entry?.metadata?.['torrent']).toBe('Some.Torrent.Name');
  });

  it('parses a critical line as error', () => {
    const entry = parseQBittorrentLogLine(
      '(C) 2026-10-10T12:02:30 - I/O error. Torrent: "Foo". Reason: "No space left on device"'
    );
    expect(entry?.level).toBe('error');
    expect(entry?.metadata?.['torrent']).toBe('Foo');
  });

  it('parses WebUI login failures', () => {
    const entry = parseQBittorrentLogLine(
      '(W) 2026-10-10T12:03:00 - WebUI login failure. IP: 172.18.0.5, username: admin'
    );
    expect(entry?.level).toBe('warn');
    expect(entry?.message).toBe('WebUI login failure. IP: 172.18.0.5, username: admin');
    expect(entry?.metadata).not.toHaveProperty('torrent');
  });

  it('keeps separators inside the message', () => {
    const entry = parseQBittorrentLogLine('(I) 2026-10-10T12:00:02 - a - b - c');
    expect(entry?.message).toBe('a - b - c');
  });

  it('tolerates a trailing carriage return', () => {
    const entry = parseQBittorrentLogLine('(I) 2026-10-10T12:00:02 - hello\r');
    expect(entry?.message).toBe('hello');
    expect(entry?.raw).toBe('(I) 2026-10-10T12:00:02 - hello');
  });

  it.each(['', '   ', 'random text', '(X) 2026-10-10T12:00:02 - bad level', '(I) 2026-10-10 - x'])(
    'returns null for %j',
    (line) => {
      expect(parseQBittorrentLogLine(line)).toBeNull();
    }
  );
});

describe('parseQBittorrentLogLineWithContext', () => {
  const context = { continuationLines: [], filePath: '/x/qbittorrent.log', lineNumber: 1 };

  it('returns the entry without continuation flags', () => {
    const result = parseQBittorrentLogLineWithContext('(C) 2026-10-10T12:02:30 - boom', context);
    expect(result.entry?.level).toBe('error');
    expect(result.isContinuation).toBe(false);
    expect(result.previousComplete).toBe(false);
  });

  it('returns a null entry for unparseable lines', () => {
    const result = parseQBittorrentLogLineWithContext('garbage', context);
    expect(result).toEqual({ entry: null, isContinuation: false, previousComplete: false });
  });

  it('never reports continuation lines', () => {
    expect(isQBittorrentLogContinuation('    at something')).toBe(false);
  });
});

describe('QBITTORRENT_LOG_FILE_CONFIG', () => {
  it('has docker paths including /qbittorrent-logs', () => {
    expect(QBITTORRENT_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/qbittorrent-logs');
  });

  it('matches only the live log file', () => {
    expect(QBITTORRENT_LOG_FILE_CONFIG.filePatterns).toEqual(['qbittorrent.log']);
    expect(QBITTORRENT_LOG_FILE_CONFIG.rotatesDaily).toBe(false);
    expect(QBITTORRENT_LOG_FILE_CONFIG.encoding).toBe('utf-8');
  });
});

describe('parseQBittorrentLogLine - adversarial input', () => {
  const header = '(W) 2026-10-10T12:00:02 - ';

  it('handles a 100k character message quickly', () => {
    const line = header + 'x'.repeat(100_000);
    const start = performance.now();
    const entry = parseQBittorrentLogLine(line);
    expect(performance.now() - start).toBeLessThan(50);
    expect(entry?.message).toHaveLength(100_000);
  });

  it('rejects a 100k character garbage line quickly', () => {
    const start = performance.now();
    expect(parseQBittorrentLogLine('(' + 'N'.repeat(100_000))).toBeNull();
    expect(parseQBittorrentLogLine(' '.repeat(100_000))).toBeNull();
    expect(parseQBittorrentLogLine('(W) 2026-10-10T12:00:02-' + ' - '.repeat(30_000))).toBeNull();
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('does not backtrack catastrophically on an unterminated torrent name', () => {
    const line = header + 'Torrent: "' + 'a'.repeat(100_000);
    const start = performance.now();
    const entry = parseQBittorrentLogLine(line);
    expect(performance.now() - start).toBeLessThan(50);
    expect(entry?.metadata).not.toHaveProperty('torrent');
  });

  it('handles many torrent markers without a closing quote quickly', () => {
    const line = header + 'Torrent: "x '.repeat(8_000);
    const start = performance.now();
    parseQBittorrentLogLine(line);
    expect(performance.now() - start).toBeLessThan(50);
  });

  it('only extracts the first quoted torrent name', () => {
    const entry = parseQBittorrentLogLine(header + 'Torrent: "A", Torrent: "B"');
    expect(entry?.metadata?.['torrent']).toBe('A');
  });

  it('accepts an empty message', () => {
    expect(parseQBittorrentLogLine('(I) 2026-10-10T12:00:02 - ')?.message).toBe('');
  });

  it('rejects lines with embedded newlines in the middle (no multi-line matching)', () => {
    expect(parseQBittorrentLogLine(header + 'first\n(I) 2026-10-10T12:00:03 - second')).toBeNull();
  });

  it('treats a line with a leading BOM or whitespace as unparseable', () => {
    expect(parseQBittorrentLogLine('﻿' + header + 'x')).toBeNull();
    expect(parseQBittorrentLogLine(' ' + header + 'x')).toBeNull();
  });

  it('keeps html/script and control characters verbatim in the message', () => {
    const entry = parseQBittorrentLogLine(header + '<script>alert(1)</script>\u0000\u001b[31m');
    expect(entry?.message).toBe('<script>alert(1)</script>\u0000\u001b[31m');
  });

  it('returns null (not an Invalid Date entry) for an impossible timestamp', () => {
    expect(parseQBittorrentLogLine('(I) 2026-13-45T99:99:99 - x')).toBeNull();
  });

  it('masks passkeys and authkeys in messages and the raw line', () => {
    const entry = parseQBittorrentLogLine(
      '(W) 2026-10-10T12:00:00 - Tracker error. URL: "https://t.example/announce?passkey=abc123&x=1" authkey=zzz'
    );
    expect(entry?.message).not.toContain('abc123');
    expect(entry?.message).not.toContain('zzz');
    expect(entry?.message).toContain('passkey=***');
    expect(entry?.raw).not.toContain('abc123');
  });
});
