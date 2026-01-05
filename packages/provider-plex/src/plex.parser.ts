/**
 * Plex Media Server log file parser
 * Parses logs from Plex Media Server in the format:
 * "Jan 04, 2026 16:39:54.405 [226048] INFO - Message here"
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
 * Configuration for Plex log file ingestion
 * Supports Docker, Linux, Windows, and macOS installations
 */
export const PLEX_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/Library/Application Support/Plex Media Server/Logs'],
    linux: [
      '/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Logs',
      '~/.local/share/plexmediaserver/Library/Application Support/Plex Media Server/Logs',
    ],
    windows: ['%LOCALAPPDATA%\\Plex Media Server\\Logs'],
    macos: ['~/Library/Application Support/Plex Media Server/Logs'],
  },
  filePatterns: [
    'Plex Media Server.log',
    'Plex Media Server.*.log',
    'Plex Media Scanner*.log',
    'Plex Tuner Service.log',
  ],
  encoding: 'utf-8',
  rotatesDaily: false, // Plex uses numbered rotation (.1, .2, etc.)
};

// =============================================================================
// Log Parsing Patterns
// =============================================================================

/**
 * Main log line pattern
 * Format: "Jan 04, 2026 16:39:54.405 [226048] INFO - Message here"
 *
 * Capture groups:
 * 1: timestamp (Jan 04, 2026 16:39:54.405)
 * 2: thread ID (226048)
 * 3: level (DEBUG, INFO, WARN, ERROR)
 * 4: message (everything after " - ")
 */
const PLEX_LOG_PATTERN =
  /^(\w{3}\s+\d{1,2},\s+\d{4}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+\[(\d+)\]\s+(\w+)\s+-\s+(.*)$/;

/**
 * Month name to number mapping for timestamp parsing
 */
const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/**
 * Log level mapping from Plex levels to normalized levels
 */
const LEVEL_MAP: Record<string, LogLevel> = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  WARNING: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
};

// =============================================================================
// Correlation Patterns
// =============================================================================

/**
 * Patterns to extract correlation IDs from Plex log messages
 */
export const PLEX_CORRELATION_PATTERNS: readonly CorrelationPattern[] = [
  // Request ID: [Req#e8ef] or [Req#e8ef/PhotoTranscoder]
  { name: 'requestId', pattern: /\[Req#([a-f0-9]+)/i },

  // Rating key (media item ID): ratingKey=1234 or /metadata/1234/
  { name: 'ratingKey', pattern: /(?:ratingKey[=/]|\/metadata\/)(\d+)/i },

  // Metadata item ID: metadataItemID=7486
  { name: 'metadataItemID', pattern: /metadataItemID=(\d+)/i },

  // Library section ID: librarySectionID=2
  { name: 'librarySectionID', pattern: /librarySectionID=(\d+)/i },

  // Session key
  { name: 'sessionKey', pattern: /sessionKey[=:\s]+"?([^"\s,]+)/i },

  // Machine identifier
  { name: 'machineIdentifier', pattern: /machineIdentifier[=:\s]+([a-zA-Z0-9]+)/i },

  // User account: Signed-in Token (username)
  { name: 'username', pattern: /Signed-in Token \(([^)]+)\)/i },

  // Client IP: [127.0.0.1:55952]
  { name: 'clientIp', pattern: /\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}):\d+\]/i },
];

// =============================================================================
// Continuation Detection Patterns
// =============================================================================

/**
 * Pattern for detecting stack trace lines
 */
const STACK_TRACE_PATTERN = /^\s{2,}at\s+/;

/**
 * Pattern for detecting exception declarations
 */
const EXCEPTION_PATTERN = /^(?:System|Microsoft|Plex)\..+Exception:/;

/**
 * Pattern for inner exception markers
 */
const INNER_EXCEPTION_PATTERN = /^-{3}>\s+/;

// =============================================================================
// Timestamp Parsing
// =============================================================================

/**
 * Parse Plex timestamp format
 * "Jan 04, 2026 16:39:54.405" -> Date
 */
function parseTimestamp(timestamp: string): Date | null {
  // Format: "Jan 04, 2026 16:39:54.405"
  const match = timestamp.match(
    /^(\w{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/
  );

  if (match === null) {
    return null;
  }

  const monthStr = match[1];
  const day = match[2];
  const year = match[3];
  const hour = match[4];
  const minute = match[5];
  const second = match[6];
  const ms = match[7];

  if (
    monthStr === undefined ||
    day === undefined ||
    year === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    ms === undefined
  ) {
    return null;
  }

  const month = MONTH_MAP[monthStr];

  if (month === undefined) {
    return null;
  }

  const date = new Date(
    parseInt(year, 10),
    month,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10),
    parseInt(ms, 10)
  );

  // Validate the date is valid
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

// =============================================================================
// Correlation ID Extraction
// =============================================================================

/**
 * Extract correlation IDs from a log message
 */
function extractCorrelationIds(message: string): Record<string, string> {
  const correlations: Record<string, string> = {};

  for (const { name, pattern } of PLEX_CORRELATION_PATTERNS) {
    const match = message.match(pattern);
    const captured = match?.[1];
    if (captured !== undefined) {
      correlations[name] = captured;
    }
  }

  return correlations;
}

// =============================================================================
// Main Parsing Functions
// =============================================================================

/**
 * Parse a single Plex log line
 * Returns null if the line cannot be parsed (invalid format or continuation)
 */
export function parsePlexLogLine(line: string): ParsedLogEntry | null {
  const trimmedLine = line.trim();

  if (trimmedLine === '') {
    return null;
  }

  // Check if this is a continuation line (stack trace, etc.)
  if (isPlexLogContinuation(trimmedLine)) {
    return null;
  }

  const match = trimmedLine.match(PLEX_LOG_PATTERN);
  if (match === null) {
    return null;
  }

  const timestampStr = match[1];
  const threadId = match[2];
  const levelStr = match[3];
  const message = match[4];

  if (
    timestampStr === undefined ||
    threadId === undefined ||
    levelStr === undefined ||
    message === undefined
  ) {
    return null;
  }

  // Parse timestamp
  const timestamp = parseTimestamp(timestampStr);
  if (timestamp === null) {
    return null;
  }

  // Map log level
  const level = LEVEL_MAP[levelStr.toUpperCase()] ?? 'info';

  // Extract source from message if available
  // Some messages have format "[Req#xxx] Component: actual message"
  // or "Component: message"
  let source: string | undefined;
  let cleanMessage = message;

  // Extract component from patterns like "[Req#xxx/Component]" or "Component:"
  const componentMatch = message.match(/^\[Req#[a-f0-9]+(?:\/([^\]]+))?\]\s*/i);
  if (componentMatch !== null) {
    source = componentMatch[1] ?? 'Request';
    cleanMessage = message.slice(componentMatch[0].length);
  }

  // Extract correlation IDs from the message
  const correlations = extractCorrelationIds(message);

  return {
    timestamp,
    level,
    message: cleanMessage,
    source,
    threadId,
    raw: line,
    sessionId: correlations['sessionKey'],
    userId: correlations['username'],
    deviceId: correlations['machineIdentifier'],
    itemId: correlations['ratingKey'] ?? correlations['metadataItemID'],
    metadata: Object.keys(correlations).length > 0 ? correlations : undefined,
  };
}

/**
 * Check if a line is a continuation of a previous log entry
 * (stack traces, multi-line output, etc.)
 */
export function isPlexLogContinuation(line: string): boolean {
  const trimmed = line.trim();

  // Stack trace lines
  if (STACK_TRACE_PATTERN.test(trimmed)) {
    return true;
  }

  // Exception type declarations
  if (EXCEPTION_PATTERN.test(trimmed)) {
    return true;
  }

  // Inner exception markers
  if (INNER_EXCEPTION_PATTERN.test(trimmed)) {
    return true;
  }

  // Lines that don't start with a timestamp but have leading whitespace
  // (indicates continuation)
  if (line.startsWith(' ') || line.startsWith('\t')) {
    // Make sure it's not just a line that happens to start with timestamp month
    if (!PLEX_LOG_PATTERN.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a log line with context for multi-line handling
 */
export function parsePlexLogLineWithContext(
  line: string,
  _context: LogParseContext
): LogParseResult {
  const isContinuation = isPlexLogContinuation(line);

  if (isContinuation) {
    return {
      entry: null,
      isContinuation: true,
      previousComplete: false,
    };
  }

  const entry = parsePlexLogLine(line);

  return {
    entry,
    isContinuation: false,
    previousComplete: entry !== null,
  };
}

/**
 * Check if a line looks like an exception/stack trace continuation
 */
export function isExceptionContinuation(line: string): boolean {
  const trimmed = line.trim();
  return STACK_TRACE_PATTERN.test(trimmed) || EXCEPTION_PATTERN.test(trimmed);
}
