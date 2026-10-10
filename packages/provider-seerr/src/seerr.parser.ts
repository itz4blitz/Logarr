/**
 * Seerr (and Overseerr / Jellyseerr) log file parser
 *
 * The apps write winston text logs to `<config>/logs/seerr-YYYY-MM-DD.log`:
 *   `${timestamp} [${level}]${label ? `[${label}]` : ''}: ${message} ${JSON(metadata)}`
 * with an ISO 8601 UTC timestamp and a trailing space even when there is no metadata.
 */

import type {
  CorrelationPattern,
  LogFileConfig,
  LogLevel,
  LogParseContext,
  LogParseResult,
  ParsedLogEntry,
} from '@logarr/core';

// =============================================================================
// Log File Configuration
// =============================================================================

/**
 * Configuration for Seerr log file ingestion.
 *
 * Only dated files are matched: `seerr.log` is a symlink to the current dated
 * file (would be ingested twice), `.machinelogs*.json` is a different format and
 * rotated `.gz` archives are not tailable.
 */
export const SEERR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/seerr-logs', '/app/config/logs'],
    linux: ['/opt/seerr/config/logs', '~/.config/seerr/logs', '/var/lib/seerr/config/logs'],
    windows: ['%APPDATA%\\seerr\\logs', 'C:\\ProgramData\\seerr\\logs'],
    macos: ['~/Library/Application Support/seerr/logs'],
  },
  filePatterns: ['seerr-*.log', 'overseerr-*.log', 'jellyseerr-*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /(?:over|jelly)?seerr-(\d{4}-\d{2}-\d{2})\.log$/,
};

// =============================================================================
// Patterns
// =============================================================================

/**
 * Main log line pattern
 *
 * Capture groups: 1 timestamp, 2 level, 3 label (optional), 4 message + metadata
 */
const SEERR_LOG_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z) \[(debug|info|warn|error)\](?:\[([^\]]*)\])?: ?([\s\S]*)$/i;

/** ANSI colour escape sequences (console style output) */
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = new RegExp('\\u001b\\[[0-9;]*m', 'g');

/** Marks the start of a new record */
const RECORD_START_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Patterns to extract correlation IDs from Seerr log messages
 */
export const SEERR_CORRELATION_PATTERNS: readonly CorrelationPattern[] = [
  { name: 'requestId', pattern: /\brequest(?:\s+#|[=:\s]+)(\d+)/i },
  { name: 'tmdbId', pattern: /\btmdb(?:Id)?["=:\s]+(\d+)/i },
  { name: 'userId', pattern: /\buser(?:Id)?["=:\s]+(\d+)/i },
];

// =============================================================================
// Helpers
// =============================================================================

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // not JSON
  }
  return null;
}

/**
 * Upper bounds for metadata detection. Every attempt copies and parses the tail of
 * the line, so unbounded attempts on a line full of ` {` would be quadratic.
 */
const MAX_METADATA_ATTEMPTS = 16;
const MAX_METADATA_LENGTH = 64 * 1024;

/**
 * Split `message {json}` into message and metadata. Candidate split points are
 * the first few ` {` from the left (so braces inside the message are tolerated);
 * the number of attempts and the size of the JSON tail are bounded to keep
 * parsing linear for adversarial lines.
 */
function splitMetadata(rest: string): {
  message: string;
  metadata: Record<string, unknown> | undefined;
} {
  if (rest.endsWith('}')) {
    let attempts = 0;
    for (
      let i = rest.indexOf(' {');
      i !== -1 && attempts < MAX_METADATA_ATTEMPTS;
      i = rest.indexOf(' {', i + 1)
    ) {
      if (rest.length - i - 1 > MAX_METADATA_LENGTH) {
        continue;
      }
      attempts++;
      const metadata = parseJsonObject(rest.slice(i + 1));
      if (metadata !== null) {
        return { message: rest.slice(0, i).trimEnd(), metadata };
      }
    }
  }
  return { message: rest, metadata: undefined };
}

// =============================================================================
// Main Parsing Functions
// =============================================================================

/**
 * Parse a single Seerr log line.
 * Returns null for blank, unparseable or continuation lines.
 */
export function parseSeerrLogLine(line: string): ParsedLogEntry | null {
  const stripped = stripAnsi(line).trimEnd();
  if (stripped.trim() === '') {
    return null;
  }

  const match = stripped.match(SEERR_LOG_PATTERN);
  if (match === null) {
    return null;
  }

  const timestamp = new Date(match[1] ?? '');
  if (isNaN(timestamp.getTime())) {
    return null;
  }

  const level = (match[2] ?? 'info').toLowerCase() as LogLevel;
  const label = match[3];
  const { message, metadata } = splitMetadata((match[4] ?? '').trimEnd());

  return {
    timestamp,
    level,
    message,
    source: label !== undefined && label !== '' ? label : undefined,
    raw: line,
    metadata,
  };
}

/**
 * Check whether a line continues the previous record (stack traces, multi-line
 * messages). Indented lines count as continuations; a record never starts with
 * whitespace.
 */
export function isSeerrLogContinuation(line: string): boolean {
  const stripped = stripAnsi(line);
  return stripped.trim() !== '' && !RECORD_START_PATTERN.test(stripped);
}

/**
 * Parse a log line with context for multi-line handling.
 * Returns the newly parsed entry (not the previous one), matching the contract
 * of the backend LogFileProcessor.
 */
export function parseSeerrLogLineWithContext(
  line: string,
  context: LogParseContext
): LogParseResult {
  if (isSeerrLogContinuation(line)) {
    return { entry: null, isContinuation: true, previousComplete: false };
  }

  const entry = parseSeerrLogLine(line);
  return {
    entry,
    isContinuation: false,
    previousComplete: entry !== null && context.previousEntry !== undefined,
  };
}
