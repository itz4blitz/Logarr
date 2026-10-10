import { QBittorrentProvider } from '@logarr/provider-qbittorrent';
import { describe, expect, it } from 'vitest';

import { LogFileProcessor } from './log-file-processor';

import type { ParsedLogEntry } from '@logarr/core';

const SAMPLE = [
  '(N) 2026-10-10T12:00:01 - qBittorrent v5.2.4 started',
  '(I) 2026-10-10T12:00:02 - Trying to listen on the following list of IP addresses: "0.0.0.0:6881,[::]:6881"',
  '(W) 2026-10-10T12:01:15 - File error alert. Torrent: "Some.Torrent.Name". File: "/downloads/x.mkv". Reason: "Permission denied"',
  'some unparseable garbage line',
  '(C) 2026-10-10T12:02:30 - I/O error. Torrent: "Foo". Reason: "No space left on device"',
  '(W) 2026-10-10T12:03:00 - WebUI login failure. IP: 172.18.0.5, username: admin',
];

describe('LogFileProcessor with the qBittorrent provider', () => {
  it('emits every parseable qbittorrent.log line exactly once, with correct levels', () => {
    const processor = new LogFileProcessor(new QBittorrentProvider());
    const entries: ParsedLogEntry[] = [];

    SAMPLE.forEach((line, index) => {
      const entry = processor.processLine(line, index + 1);
      if (entry) entries.push(entry);
    });
    const last = processor.flush();
    if (last) entries.push(last);

    expect(entries.map((e) => e.level)).toEqual(['info', 'info', 'warn', 'error', 'warn']);
    expect(entries.map((e) => e.message)).toEqual([
      'qBittorrent v5.2.4 started',
      'Trying to listen on the following list of IP addresses: "0.0.0.0:6881,[::]:6881"',
      'File error alert. Torrent: "Some.Torrent.Name". File: "/downloads/x.mkv". Reason: "Permission denied"',
      'I/O error. Torrent: "Foo". Reason: "No space left on device"',
      'WebUI login failure. IP: 172.18.0.5, username: admin',
    ]);
    expect(entries.every((e) => e.stackTrace === undefined)).toBe(true);
  });
});
