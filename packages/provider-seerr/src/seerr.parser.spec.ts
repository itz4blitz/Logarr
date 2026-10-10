import { describe, it, expect } from 'vitest';

import {
  SEERR_CORRELATION_PATTERNS,
  SEERR_LOG_FILE_CONFIG,
  isSeerrLogContinuation,
  parseSeerrLogLine,
  parseSeerrLogLineWithContext,
} from './seerr.parser.js';

import type { LogParseContext } from '@logarr/core';

const ctx = (overrides: Partial<LogParseContext> = {}): LogParseContext => ({
  continuationLines: [],
  filePath: '/seerr-logs/seerr-2026-10-10.log',
  lineNumber: 1,
  ...overrides,
});

/** Mirrors file-discovery glob conversion: `*` -> `.*`, anchored, case-insensitive */
function globToRegex(glob: string): RegExp {
  return new RegExp(`^${glob.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`, 'i');
}

function matchesAnyPattern(name: string): boolean {
  return SEERR_LOG_FILE_CONFIG.filePatterns.some((p) => globToRegex(p).test(name));
}

describe('parseSeerrLogLine', () => {
  it('parses a label-less line with trailing space', () => {
    const line = '2026-10-10T12:00:01.123Z [info]: Server ready on port 5055 ';
    const entry = parseSeerrLogLine(line);
    expect(entry).not.toBeNull();
    expect(entry?.timestamp.toISOString()).toBe('2026-10-10T12:00:01.123Z');
    expect(entry?.level).toBe('info');
    expect(entry?.message).toBe('Server ready on port 5055');
    expect(entry?.source).toBeUndefined();
    expect(entry?.metadata).toBeUndefined();
    expect(entry?.raw).toBe(line);
  });

  it('parses label and JSON metadata', () => {
    const entry = parseSeerrLogLine(
      '2026-10-10T12:00:05.456Z [debug][Jobs]: Starting scheduled job {"job":"Plex Recently Added Scan"}'
    );
    expect(entry?.level).toBe('debug');
    expect(entry?.source).toBe('Jobs');
    expect(entry?.message).toBe('Starting scheduled job');
    expect(entry?.metadata).toEqual({ job: 'Plex Recently Added Scan' });
  });

  it('supports labels containing spaces and error metadata', () => {
    const entry = parseSeerrLogLine(
      '2026-10-10T12:05:10.789Z [error][Radarr API]: Something went wrong {"errorMessage":"connect ECONNREFUSED 192.168.1.20:7878","radarrUrl":"http://192.168.1.20:7878/api/v3"}'
    );
    expect(entry?.level).toBe('error');
    expect(entry?.source).toBe('Radarr API');
    expect(entry?.message).toBe('Something went wrong');
    expect(entry?.metadata?.['errorMessage']).toContain('ECONNREFUSED');
  });

  it('keeps braces that are not valid JSON in the message', () => {
    const entry = parseSeerrLogLine(
      '2026-10-10T12:06:00.000Z [warn][Settings]: Value {not json} here '
    );
    expect(entry?.level).toBe('warn');
    expect(entry?.message).toBe('Value {not json} here');
    expect(entry?.metadata).toBeUndefined();
  });

  it('does not treat a trailing brace group in the message as metadata', () => {
    const entry = parseSeerrLogLine('2026-10-10T12:06:00.000Z [warn][Settings]: Value {not json}');
    expect(entry?.message).toBe('Value {not json}');
    expect(entry?.metadata).toBeUndefined();
  });

  it('parses nested JSON metadata', () => {
    const entry = parseSeerrLogLine(
      '2026-10-10T12:06:01.000Z [info][API]: Nested {"a":{"b":[1,2]},"c":"x y {z}"}'
    );
    expect(entry?.message).toBe('Nested');
    expect(entry?.metadata).toEqual({ a: { b: [1, 2] }, c: 'x y {z}' });
  });

  it('ignores JSON arrays as metadata', () => {
    const entry = parseSeerrLogLine('2026-10-10T12:06:01.000Z [info][API]: List [1,2] {"a":1}');
    expect(entry?.message).toBe('List [1,2]');
    expect(entry?.metadata).toEqual({ a: 1 });
  });

  it('treats an empty label as no source', () => {
    const entry = parseSeerrLogLine('2026-10-10T12:06:02.000Z [info][]: empty label');
    expect(entry?.source).toBeUndefined();
    expect(entry?.message).toBe('empty label');
  });

  it('accepts timestamps without milliseconds and upper-case levels', () => {
    const entry = parseSeerrLogLine('2026-10-10T12:06:03Z [INFO]: no millis upper');
    expect(entry?.level).toBe('info');
    expect(entry?.message).toBe('no millis upper');
  });

  it('strips ANSI colour codes before parsing', () => {
    const entry = parseSeerrLogLine(
      '\u001b[32m2026-10-10T12:00:00.000Z [info]\u001b[39m: coloured'
    );
    expect(entry?.level).toBe('info');
    expect(entry?.message).toBe('coloured');
  });

  it('keeps the original line (with ANSI codes) as raw and ignores a trailing CR', () => {
    const line = '2026-10-10T12:00:00.000Z [warn][Jobs]: windows eol {"a":1}\r';
    const entry = parseSeerrLogLine(line);
    expect(entry?.raw).toBe(line);
    expect(entry?.message).toBe('windows eol');
    expect(entry?.metadata).toEqual({ a: 1 });
  });

  it('parses a record with an empty message', () => {
    const entry = parseSeerrLogLine('2026-10-10T12:00:00.000Z [info]: ');
    expect(entry?.message).toBe('');
    expect(entry?.metadata).toBeUndefined();
  });

  it('splits at the right brace group when the message itself contains JSON', () => {
    const entry = parseSeerrLogLine(
      '2026-10-10T12:00:00.000Z [error][Plex API]: got {"x":1} from upstream {"status":502}'
    );
    expect(entry?.message).toBe('got {"x":1} from upstream');
    expect(entry?.metadata).toEqual({ status: 502 });
  });

  it('parses the realistic sample lines from the upstream logger', () => {
    const lines = [
      '2026-10-10T12:00:01.123Z [info]: Server ready on port 5055 ',
      '2026-10-10T12:00:05.456Z [debug][Jobs]: Starting scheduled job {"job":"Plex Recently Added Scan"}',
      '2026-10-10T12:05:10.789Z [error][Radarr API]: Something went wrong {"errorMessage":"connect ECONNREFUSED 192.168.1.20:7878","radarrUrl":"http://192.168.1.20:7878/api/v3"}',
    ];
    const parsed = lines.map((l) => parseSeerrLogLine(l));
    expect(parsed.map((e) => e?.level)).toEqual(['info', 'debug', 'error']);
    expect(parsed.map((e) => e?.source)).toEqual([undefined, 'Jobs', 'Radarr API']);
    expect(parsed[2]?.metadata?.['errorMessage']).toBe('connect ECONNREFUSED 192.168.1.20:7878');
    expect(parsed[1]?.timestamp.toISOString()).toBe('2026-10-10T12:00:05.456Z');
  });

  it('returns null for a syntactically matching but invalid timestamp', () => {
    expect(parseSeerrLogLine('2026-13-45T25:61:61Z [info]: bad date')).toBeNull();
  });

  it.each([
    [''],
    ['   '],
    ['not a log line'],
    ['2026-10-10 12:00:00 [info]: wrong ts format'],
    ['2026-10-10T12:00:00.000Z [verbose]: unknown level'],
  ])('returns null for %j', (line) => {
    expect(parseSeerrLogLine(line)).toBeNull();
  });
});

describe('isSeerrLogContinuation', () => {
  it.each([
    ['    at Object.<anonymous> (/app/dist/x.js:1:1)', true],
    ['Error: boom', true],
    ['}', true],
    ['', false],
    ['   ', false],
    ['2026-10-10T12:00:00.000Z [info]: x', false],
    ['2026-10-10T12:00:00.000Z [verbose]: x', false],
    ['2026-10-10T12:00:00Z [info]: no millis', false],
    ['\u001b[31m    at coloured stack frame\u001b[39m', true],
    ['\tat tab indented frame', true],
  ])('%j -> %s', (line, expected) => {
    expect(isSeerrLogContinuation(line)).toBe(expected);
  });
});

describe('parseSeerrLogLineWithContext', () => {
  const sample = [
    '2026-10-10T12:10:00.000Z [error][Jellyfin API]: Request failed {"status":500}',
    'Error: Request failed with status code 500',
    '    at settle (/app/node_modules/axios/lib/core/settle.js:19:12)',
    '    at IncomingMessage.handleStreamEnd (/app/node_modules/axios/lib/adapters/http.js:572:11)',
    '2026-10-10T12:10:01.000Z [info]: Next record ',
  ];

  it('classifies a multi-line sample correctly', () => {
    const results = sample.map((l) => parseSeerrLogLineWithContext(l, ctx()));
    expect(results.map((r) => r.isContinuation)).toEqual([false, true, true, true, false]);
    expect(results[0]?.entry?.source).toBe('Jellyfin API');
    expect(results[4]?.entry?.message).toBe('Next record');
  });

  it('returns continuation results without an entry', () => {
    expect(parseSeerrLogLineWithContext('    at x', ctx())).toEqual({
      entry: null,
      isContinuation: true,
      previousComplete: false,
    });
  });

  it('marks previous entry complete only when one exists', () => {
    const line = '2026-10-10T12:10:01.000Z [info]: Next';
    const previousEntry = parseSeerrLogLine(sample[0] as string) ?? undefined;
    const withPrev = parseSeerrLogLineWithContext(line, ctx({ previousEntry }));
    expect(withPrev.entry?.message).toBe('Next');
    expect(withPrev.previousComplete).toBe(true);
    expect(parseSeerrLogLineWithContext(line, ctx()).previousComplete).toBe(false);
  });

  it('returns a null entry for unparseable ISO-start lines', () => {
    expect(parseSeerrLogLineWithContext('2026-10-10T12:00:00.000Z [verbose]: x', ctx())).toEqual({
      entry: null,
      isContinuation: false,
      previousComplete: false,
    });
  });
});

describe('SEERR_LOG_FILE_CONFIG', () => {
  it('has docker default paths', () => {
    expect(SEERR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/seerr-logs');
    expect(SEERR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/app/config/logs');
  });

  it('declares the three dated patterns, utf-8 and daily rotation', () => {
    expect(SEERR_LOG_FILE_CONFIG.filePatterns).toEqual([
      'seerr-*.log',
      'overseerr-*.log',
      'jellyseerr-*.log',
    ]);
    expect(SEERR_LOG_FILE_CONFIG.encoding).toBe('utf-8');
    expect(SEERR_LOG_FILE_CONFIG.rotatesDaily).toBe(true);
  });

  it('datePattern matches dated files only', () => {
    const re = SEERR_LOG_FILE_CONFIG.datePattern as RegExp;
    expect(re.test('seerr-2026-10-10.log')).toBe(true);
    expect(re.test('overseerr-2026-10-10.log')).toBe(true);
    expect(re.test('jellyseerr-2026-10-10.log')).toBe(true);
    expect(re.test('seerr-2026-10-10.log.gz')).toBe(false);
    expect(re.test('seerr.log')).toBe(false);
  });

  it.each(['seerr-2026-10-10.log', 'overseerr-2026-10-09.log', 'jellyseerr-2026-10-08.log'])(
    'file discovery globs match %s',
    (name) => {
      expect(matchesAnyPattern(name)).toBe(true);
    }
  );

  it.each(['seerr.log', '.machinelogs-2026-10-10.json', 'seerr-2026-10-10.log.gz'])(
    'file discovery globs do not match %s',
    (name) => {
      expect(matchesAnyPattern(name)).toBe(false);
    }
  );
});

describe('SEERR_CORRELATION_PATTERNS', () => {
  it('names requestId, tmdbId and userId', () => {
    expect(SEERR_CORRELATION_PATTERNS.map((p) => p.name)).toEqual([
      'requestId',
      'tmdbId',
      'userId',
    ]);
  });

  it('extracts ids', () => {
    const find = (name: string, text: string) =>
      text.match(SEERR_CORRELATION_PATTERNS.find((p) => p.name === name)?.pattern as RegExp)?.[1];
    expect(find('requestId', 'Request #12 approved')).toBe('12');
    expect(find('tmdbId', 'lookup tmdbId=603 failed')).toBe('603');
    expect(find('userId', 'userId: 7')).toBe('7');
  });

  it('extracts ids from JSON-style metadata', () => {
    const find = (name: string, text: string) =>
      text.match(SEERR_CORRELATION_PATTERNS.find((p) => p.name === name)?.pattern as RegExp)?.[1];
    expect(find('tmdbId', '{"tmdbId":1396,"mediaType":"tv"}')).toBe('1396');
    expect(find('userId', '{"userId":42}')).toBe('42');
    expect(find('requestId', 'request=15 failed')).toBe('15');
  });

  it('does not match unrelated text', () => {
    for (const { pattern } of SEERR_CORRELATION_PATTERNS) {
      expect('Server ready on port 5055'.match(pattern)).toBeNull();
    }
  });
});
