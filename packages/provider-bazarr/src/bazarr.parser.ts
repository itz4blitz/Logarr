import type {
  CorrelationPattern,
  LogFileConfig,
  LogLevel,
  LogParseContext,
  LogParseResult,
  ParsedLogEntry,
} from '@logarr/core';

/**
 * Bazarr log file configuration.
 * Bazarr writes `<config>/log/bazarr.log` (singular `log`) and rotates it
 * daily to `bazarr.log.YYYY-MM-DD`.
 */
export const BAZARR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/log'],
    linux: ['~/.config/bazarr/log', '/opt/bazarr/data/log', '/var/lib/bazarr/log'],
    windows: ['C:\\ProgramData\\Bazarr\\log', '%PROGRAMDATA%\\Bazarr\\log'],
    macos: ['~/Library/Application Support/Bazarr/log'],
  },
  filePatterns: ['bazarr.log', 'bazarr.log.*'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /bazarr\.log\.(\d{4}-\d{2}-\d{2})$/,
};

/** Bazarr does not emit stable correlation identifiers in its log messages */
export const BAZARR_CORRELATION_PATTERNS: readonly CorrelationPattern[] = [];

/**
 * Record start: `%(asctime)s|%(levelname)-8s|%(name)-32s|` (message follows)
 */
const RECORD_START = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\|([A-Za-z]+)\s*\|([^|]*)\|/;

/**
 * Inline exception: `message|'Traceback (most recent call last):\n ...'`
 * Python's repr() of the traceback is appended after the message.
 */
const INLINE_EXCEPTION = /^([\s\S]*?)\|(['"])(Traceback \(most recent call last\):[\s\S]*)\2$/;

const LEVEL_MAP: Record<string, LogLevel> = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warn',
  WARN: 'warn',
  ERROR: 'error',
  CRITICAL: 'fatal',
  FATAL: 'fatal',
};

/** Map a Python logging level name to a Logarr level */
export function mapBazarrLevel(raw: string): LogLevel {
  return LEVEL_MAP[raw.trim().toUpperCase()] ?? 'info';
}

/** Undo Python repr() escaping of the traceback string */
function unescapePythonRepr(value: string): string {
  return value.replace(/\\(n|t|'|"|\\)/g, (_match, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      default:
        return ch;
    }
  });
}

/**
 * A continuation is any non-empty line that does not start a new record. This covers
 * multi-line messages and exceptions emitted on a following physical line.
 */
export function isBazarrLogContinuation(line: string): boolean {
  return line.trim() !== '' && !RECORD_START.test(line);
}

/**
 * Parse a single Bazarr log record.
 * Timestamps are naive local time of the Bazarr host and are interpreted in the
 * local timezone of the Logarr backend.
 */
export function parseBazarrLogLine(line: string): ParsedLogEntry | null {
  const match = RECORD_START.exec(line);
  if (match === null) {
    return null;
  }

  const [full, stamp, rawLevel, rawSource] = match;
  const timestamp = new Date((stamp ?? '').replace(' ', 'T'));
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  const source = (rawSource ?? '').trim();

  let rest = line.slice((full ?? '').length).trimEnd();
  if (rest.endsWith('|')) {
    rest = rest.slice(0, -1);
  }

  let message = rest;
  let exception: string | undefined;
  let stackTrace: string | undefined;

  const withException = INLINE_EXCEPTION.exec(rest);
  if (withException !== null) {
    message = withException[1] ?? '';
    stackTrace = unescapePythonRepr(withException[3] ?? '');
    const lines = stackTrace.split('\n').filter((l) => l.trim() !== '');
    exception = lines[lines.length - 1]?.trim();
  }

  return {
    timestamp,
    level: mapBazarrLevel(rawLevel ?? ''),
    message,
    source: source === '' ? undefined : source,
    raw: line,
    exception,
    stackTrace,
  };
}

/** Parse a line with context so the file processor can attach continuation lines */
export function parseBazarrLogLineWithContext(
  line: string,
  context: LogParseContext
): LogParseResult {
  if (isBazarrLogContinuation(line)) {
    return { entry: null, isContinuation: true, previousComplete: false };
  }

  const entry = parseBazarrLogLine(line);
  if (entry !== null) {
    return {
      entry,
      isContinuation: false,
      previousComplete: context.previousEntry !== undefined,
    };
  }

  return { entry: null, isContinuation: false, previousComplete: false };
}
