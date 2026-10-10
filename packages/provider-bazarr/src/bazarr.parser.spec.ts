import { describe, expect, it } from 'vitest';

import {
  BAZARR_CORRELATION_PATTERNS,
  BAZARR_LOG_FILE_CONFIG,
  isBazarrLogContinuation,
  mapBazarrLevel,
  parseBazarrLogLine,
  parseBazarrLogLineWithContext,
} from './bazarr.parser.js';

import type { ParsedLogEntry } from '@logarr/core';

const LINE_INFO =
  '2026-10-10 12:00:01|INFO    |root                            |BAZARR is started and waiting for requests on: http://0.0.0.0:6767|';
const LINE_WARN =
  '2026-10-10 12:06:00|WARNING |root                            |BAZARR cannot get providers: 1 provider throttled|';
const LINE_EXCEPTION = String.raw`2026-10-10 12:05:11|ERROR   |sonarr.sync.episodes            |BAZARR Error trying to get episodes from Sonarr.|'Traceback (most recent call last):\n  File "/app/bin/bazarr/sonarr/sync/episodes.py", line 40, in update_episodes\nrequests.exceptions.ConnectionError: HTTPConnectionPool(host=\'sonarr\', port=8989): Max retries exceeded'|`;
const LINE_PIPES =
  '2026-10-10 13:00:00|INFO    |subliminal_patch.providers.opensubtitlescom|Result: a|b|c status=ok|';
const LINE_PIPES_EXCEPTION = String.raw`2026-10-10 13:01:00|ERROR   |root                            |Failed: x|y|'Traceback (most recent call last):\n  File "a.py"\nValueError: bad|value'|`;
const LINE_NO_TRAILING_PIPE =
  '2026-10-10 13:02:00|INFO    |root                            |first line of message';

describe('parseBazarrLogLine', () => {
  it('parses a plain INFO record', () => {
    const entry = parseBazarrLogLine(LINE_INFO);

    expect(entry).not.toBeNull();
    expect(entry?.level).toBe('info');
    expect(entry?.source).toBe('root');
    expect(entry?.message).toBe(
      'BAZARR is started and waiting for requests on: http://0.0.0.0:6767'
    );
    expect(entry?.timestamp).toEqual(new Date('2026-10-10T12:00:01'));
    expect(entry?.raw).toBe(LINE_INFO);
    expect(entry?.exception).toBeUndefined();
    expect(entry?.stackTrace).toBeUndefined();
  });

  it('maps WARNING to warn', () => {
    const entry = parseBazarrLogLine(LINE_WARN);

    expect(entry?.level).toBe('warn');
    expect(entry?.message).toBe('BAZARR cannot get providers: 1 provider throttled');
  });

  it('extracts an inline python traceback as exception and stackTrace', () => {
    const entry = parseBazarrLogLine(LINE_EXCEPTION);

    expect(entry?.level).toBe('error');
    expect(entry?.source).toBe('sonarr.sync.episodes');
    expect(entry?.message).toBe('BAZARR Error trying to get episodes from Sonarr.');
    expect(
      entry?.stackTrace?.startsWith('Traceback (most recent call last):\n  File "/app/bin/bazarr/')
    ).toBe(true);
    expect(entry?.stackTrace).toContain("host='sonarr'");
    expect(entry?.stackTrace).not.toContain('\\n');
    expect(entry?.exception).toBe(
      "requests.exceptions.ConnectionError: HTTPConnectionPool(host='sonarr', port=8989): Max retries exceeded"
    );
  });

  it('preserves pipes inside the message', () => {
    const entry = parseBazarrLogLine(LINE_PIPES);

    expect(entry?.message).toBe('Result: a|b|c status=ok');
    expect(entry?.source).toBe('subliminal_patch.providers.opensubtitlescom');
    expect(entry?.exception).toBeUndefined();
  });

  it('preserves pipes in both message and exception', () => {
    const entry = parseBazarrLogLine(LINE_PIPES_EXCEPTION);

    expect(entry?.message).toBe('Failed: x|y');
    expect(entry?.exception).toBe('ValueError: bad|value');
  });

  it('tolerates a missing trailing pipe', () => {
    const entry = parseBazarrLogLine(LINE_NO_TRAILING_PIPE);

    expect(entry?.message).toBe('first line of message');
  });

  it('tolerates a trailing carriage return', () => {
    const entry = parseBazarrLogLine(`${LINE_INFO}\r`);

    expect(entry?.message).toBe(
      'BAZARR is started and waiting for requests on: http://0.0.0.0:6767'
    );
  });

  it('leaves source undefined when the logger name is empty', () => {
    const entry = parseBazarrLogLine(
      '2026-10-10 13:02:00|INFO    |                                |hello|'
    );

    expect(entry?.source).toBeUndefined();
    expect(entry?.message).toBe('hello');
  });

  it.each(['', 'garbage', '  File "x.py", line 1', '2026-10-10 12:00:01 INFO something'])(
    'returns null for non-matching line %j',
    (line) => {
      expect(parseBazarrLogLine(line)).toBeNull();
    }
  );

  it('returns null for an impossible date', () => {
    expect(parseBazarrLogLine('2026-13-45 99:99:99|INFO    |root|x|')).toBeNull();
  });
});

describe('mapBazarrLevel', () => {
  it.each([
    ['DEBUG', 'debug'],
    ['INFO', 'info'],
    ['WARNING', 'warn'],
    ['WARN', 'warn'],
    ['ERROR', 'error'],
    ['CRITICAL', 'fatal'],
    ['FATAL', 'fatal'],
    ['TRACE', 'trace'],
    ['warning', 'warn'],
    ['  error  ', 'error'],
    ['NOTICE', 'info'],
  ])('maps %j to %s', (raw, expected) => {
    expect(mapBazarrLevel(raw)).toBe(expected);
  });
});

describe('isBazarrLogContinuation', () => {
  it('treats an exception on a following line as a continuation', () => {
    expect(isBazarrLogContinuation(`'Traceback (most recent call last):\\n...'|`)).toBe(true);
  });

  it('treats the next line of a multi-line message as a continuation', () => {
    expect(isBazarrLogContinuation('second line of a multi-line message|')).toBe(true);
  });

  it('does not treat a record start as a continuation', () => {
    expect(isBazarrLogContinuation(LINE_INFO)).toBe(false);
  });

  it('does not treat blank lines as a continuation', () => {
    expect(isBazarrLogContinuation('')).toBe(false);
    expect(isBazarrLogContinuation('   ')).toBe(false);
  });
});

describe('parseBazarrLogLineWithContext', () => {
  const baseContext = { continuationLines: [], filePath: 'bazarr.log', lineNumber: 1 };

  it('flags continuation lines', () => {
    expect(parseBazarrLogLineWithContext('second line|', { ...baseContext })).toEqual({
      entry: null,
      isContinuation: true,
      previousComplete: false,
    });
  });

  it('marks the previous entry complete when one exists', () => {
    const previousEntry = parseBazarrLogLine(LINE_INFO) as ParsedLogEntry;
    const result = parseBazarrLogLineWithContext(LINE_WARN, { ...baseContext, previousEntry });

    expect(result.entry?.level).toBe('warn');
    expect(result.isContinuation).toBe(false);
    expect(result.previousComplete).toBe(true);
  });

  it('does not mark previous complete without one', () => {
    const result = parseBazarrLogLineWithContext(LINE_WARN, { ...baseContext });

    expect(result.entry).not.toBeNull();
    expect(result.previousComplete).toBe(false);
  });

  it('returns an empty result for garbage', () => {
    expect(parseBazarrLogLineWithContext('', { ...baseContext })).toEqual({
      entry: null,
      isContinuation: false,
      previousComplete: false,
    });
  });

  it('groups continuation lines the way the file processor does', () => {
    const groups: { head: string; continuations: string[] }[] = [];
    for (const line of [LINE_INFO, 'continued text|', LINE_WARN]) {
      const result = parseBazarrLogLineWithContext(line, { ...baseContext });
      if (result.isContinuation) {
        groups[groups.length - 1]?.continuations.push(line);
      } else if (result.entry !== null) {
        groups.push({ head: result.entry.message, continuations: [] });
      }
    }

    expect(groups).toHaveLength(2);
    expect(groups[0]?.continuations).toEqual(['continued text|']);
    expect(groups[1]?.continuations).toEqual([]);
  });
});

describe('BAZARR_LOG_FILE_CONFIG', () => {
  it('defines docker path, patterns and encoding', () => {
    expect(BAZARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/log');
    expect(BAZARR_LOG_FILE_CONFIG.filePatterns).toContain('bazarr.log');
    expect(BAZARR_LOG_FILE_CONFIG.filePatterns).toContain('bazarr.log.*');
    expect(BAZARR_LOG_FILE_CONFIG.encoding).toBe('utf-8');
    expect(BAZARR_LOG_FILE_CONFIG.rotatesDaily).toBe(true);
  });

  it('extracts the date from rotated files only', () => {
    const pattern = BAZARR_LOG_FILE_CONFIG.datePattern as RegExp;

    expect(pattern.exec('bazarr.log.2026-10-09')?.[1]).toBe('2026-10-09');
    expect(pattern.test('bazarr.log')).toBe(false);
  });
});

describe('BAZARR_CORRELATION_PATTERNS', () => {
  it('is an array', () => {
    expect(Array.isArray(BAZARR_CORRELATION_PATTERNS)).toBe(true);
  });
});

describe('parseBazarrLogLine edge cases', () => {
  it('unwraps a double-quoted traceback repr (Python uses " when the text contains \')', () => {
    const line = String.raw`2026-10-10 12:05:11|ERROR   |root                            |boom|"Traceback (most recent call last):\n  File \"a.py\", line 1\nKeyError: 'x'"|`;
    const entry = parseBazarrLogLine(line);

    // Python would not escape the inner quotes in this form; the parser must still find the end
    expect(entry?.message).toBe('boom');
    expect(entry?.stackTrace).toContain('Traceback (most recent call last):\n');
    expect(entry?.exception).toBe("KeyError: 'x'");
  });

  it('unescapes tabs, backslashes and escaped quotes in the traceback', () => {
    const line = String.raw`2026-10-10 12:05:11|ERROR   |root                            |boom|'Traceback (most recent call last):\n\tFile \'C:\\bazarr\\a.py\'\nOSError: nope'|`;
    const entry = parseBazarrLogLine(line);

    expect(entry?.stackTrace).toBe(
      "Traceback (most recent call last):\n\tFile 'C:\\bazarr\\a.py'\nOSError: nope"
    );
    expect(entry?.exception).toBe('OSError: nope');
  });

  it('does not treat a literal "|Traceback" without quotes as an exception', () => {
    const line =
      '2026-10-10 12:05:11|ERROR   |root                            |see|Traceback (most recent call last): x|';
    const entry = parseBazarrLogLine(line);

    expect(entry?.message).toBe('see|Traceback (most recent call last): x');
    expect(entry?.stackTrace).toBeUndefined();
  });

  it('does not match a traceback whose closing quote differs from the opening quote', () => {
    const line = String.raw`2026-10-10 12:05:11|ERROR   |root                            |m|'Traceback (most recent call last):\nValueError: x"|`;
    const entry = parseBazarrLogLine(line);

    expect(entry?.stackTrace).toBeUndefined();
    expect(entry?.message).toContain('Traceback');
  });

  it('accepts a lowercase level and tight padding', () => {
    const entry = parseBazarrLogLine('2026-10-10 12:00:00|debug|root|hello|');

    expect(entry?.level).toBe('debug');
    expect(entry?.source).toBe('root');
    expect(entry?.message).toBe('hello');
  });

  it('keeps an empty message empty', () => {
    const entry = parseBazarrLogLine(
      '2026-10-10 12:00:00|INFO    |root                            ||'
    );

    expect(entry?.message).toBe('');
  });

  it('strips only one trailing pipe', () => {
    const entry = parseBazarrLogLine('2026-10-10 12:00:00|INFO    |root|a||');

    expect(entry?.message).toBe('a|');
  });

  it('parses the timestamp as naive local time', () => {
    const entry = parseBazarrLogLine(LINE_INFO);

    expect(entry?.timestamp.getFullYear()).toBe(2026);
    expect(entry?.timestamp.getHours()).toBe(12);
    expect(entry?.timestamp.getSeconds()).toBe(1);
  });

  it('keeps the original line (including CR) as raw', () => {
    const entry = parseBazarrLogLine(`${LINE_INFO}\r`);

    expect(entry?.raw).toBe(`${LINE_INFO}\r`);
  });
});

describe('isBazarrLogContinuation edge cases', () => {
  it('treats whitespace-only lines as not a continuation', () => {
    expect(isBazarrLogContinuation('   \t')).toBe(false);
  });

  it('treats a CRLF record start as a record, not a continuation', () => {
    expect(isBazarrLogContinuation(`${LINE_INFO}\r`)).toBe(false);
  });

  it('treats a record with a malformed timestamp prefix as a continuation', () => {
    expect(isBazarrLogContinuation('2026-10-10T12:00:01|INFO    |root|x|')).toBe(true);
  });
});

describe('parseBazarrLogLineWithContext edge cases', () => {
  it('returns an empty result for a record-shaped line with an impossible date', () => {
    const result = parseBazarrLogLineWithContext('2026-13-45 99:99:99|INFO    |root|x|', {
      continuationLines: [],
      filePath: 'bazarr.log',
      lineNumber: 1,
    });

    expect(result.entry).toBeNull();
    expect(result.previousComplete).toBe(false);
  });
});
