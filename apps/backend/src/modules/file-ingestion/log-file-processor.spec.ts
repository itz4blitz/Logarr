import { EmbyProvider } from '@logarr/provider-emby';
import { SonarrProvider } from '@logarr/provider-sonarr';
import { describe, expect, it } from 'vitest';

import { LogFileProcessor } from './log-file-processor';

import type { MediaServerProvider, ParsedLogEntry } from '@logarr/core';

function feed(
  lines: string[],
  provider: MediaServerProvider = new SonarrProvider()
): ParsedLogEntry[] {
  const processor = new LogFileProcessor(provider);
  const out: ParsedLogEntry[] = [];
  lines.forEach((line, i) => {
    const entry = processor.processLine(line, i + 1);
    if (entry) out.push(entry);
  });
  const last = processor.flush();
  if (last) out.push(last);
  return out;
}

describe('LogFileProcessor with *arr multi-line errors', () => {
  it('assembles two entries and a blank-line separated exception with stack trace', () => {
    const entries = feed([
      '2026-10-10 12:00:05.4|Error|DownloadClientProvider|Error connecting to qBittorrent',
      '',
      '[v4.0.10.2544] System.Net.Http.HttpRequestException: Connection refused',
      '   at System.Net.Http.HttpConnectionPool.ConnectToTcpHostAsync()',
      '',
      '2026-10-10 12:00:06.1|Info|RssSyncService|RSS Sync Completed',
    ]);

    expect(entries).toHaveLength(2);
    const [error, info] = entries;
    expect(error?.level).toBe('error');
    expect(error?.source).toBe('DownloadClientProvider');
    expect(error?.message).toBe('Error connecting to qBittorrent - Connection refused');
    expect(error?.exception).toBe('System.Net.Http.HttpRequestException');
    expect(error?.stackTrace).toContain('HttpRequestException: Connection refused');
    expect(error?.stackTrace).toContain('ConnectToTcpHostAsync');
    expect(error?.stackTrace).not.toContain('RSS Sync');
    expect(info?.message).toBe('RSS Sync Completed');
    expect(info?.stackTrace).toBeUndefined();
  });

  it('emits plain single-line entries', () => {
    const entries = feed([
      '2026-10-10 12:00:05.4|Info|A|one',
      '',
      '2026-10-10 12:00:06.1|Info|B|two',
    ]);

    expect(entries.map((e) => e.message)).toEqual(['one', 'two']);
  });

  it('flushes a trailing error entry at EOF with its exception', () => {
    const processor = new LogFileProcessor(new SonarrProvider());
    const lines = [
      '2026-10-10 12:00:05.4|Error|Src|Boom',
      '',
      '[v4.0.10.2544] System.IO.IOException: disk full',
      '   at Foo.Bar()',
      '',
    ];
    lines.forEach((l, i) => expect(processor.processLine(l, i + 1)).toBeNull());

    const entry = processor.flush();
    expect(entry?.message).toBe('Boom - disk full');
    expect(entry?.exception).toBe('System.IO.IOException');
    expect(entry?.stackTrace).toContain('at Foo.Bar()');
    expect(processor.flush()).toBeNull();
  });

  it('drops a stray continuation line at the start of the file', () => {
    const entries = feed(['   at Orphan.Frame()', '2026-10-10 12:00:05.4|Info|A|one']);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toBe('one');
    expect(entries[0]?.stackTrace).toBeUndefined();
  });

  it('keeps an unparseable line (8-digit fraction) as a continuation of the pending entry, not as its own entry', () => {
    // An 8-digit fraction does not match the NLog format (known limitation), so the line is
    // folded into the pending entry's stack trace; the surrounding entries are emitted intact.
    const entries = feed([
      '2026-10-10 12:00:05.4|Info|A|one',
      '2026-10-10 12:00:05.12345678|Info|B|weird',
      '2026-10-10 12:00:06.1|Info|C|three',
    ]);

    expect(entries.map((e) => e.message)).toEqual(['one', 'three']);
    expect(entries[0]?.stackTrace).toContain('weird');
  });

  it('still works for a provider without finalizeLogEntry (Emby)', () => {
    const emby = new EmbyProvider();
    expect((emby as unknown as { finalizeLogEntry?: unknown }).finalizeLogEntry).toBeUndefined();

    const entries = feed(
      [
        '2024-01-15 10:30:45.123 Error App: Something failed',
        '   at Foo.Bar()',
        '2024-01-15 10:30:46.123 Info App: Next',
      ],
      emby
    );

    expect(entries).toHaveLength(2);
    expect(entries[0]?.stackTrace).toContain('at Foo.Bar()');
    expect(entries[1]?.stackTrace).toBeUndefined();
  });
});
