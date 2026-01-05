/**
 * Emby Media Server log file parser
 * Parses logs from Emby Server which uses NLog format
 * Format: YYYY-MM-DD HH:MM:SS.mmm Level Source: Message
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
 * Configuration for Emby log file ingestion
 * Supports Docker, Linux, Windows, and macOS installations
 */
export const EMBY_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/logs'],
    linux: [
      '/var/lib/emby/logs',
      '/var/lib/emby-server/logs',
      '~/.local/share/emby/logs',
    ],
    windows: [
      '%PROGRAMDATA%\\Emby-Server\\logs',
      '%APPDATA%\\Emby-Server\\logs',
    ],
    macos: ['~/Library/Application Support/Emby-Server/logs'],
  },
  filePatterns: [
    'embyserver*.txt',
    'embyserver.txt',
    'server*.log',
    'hardware*.txt',
  ],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /embyserver_(\d{8})(_\d+)?\.txt$/,
};

// =============================================================================
// Log Parsing Patterns
// =============================================================================

/**
 * Main log line pattern for Emby NLog format
 * Format: "2024-01-15 10:30:45.123 Info Source: Message"
 *
 * Capture groups:
 * 1: timestamp (2024-01-15 10:30:45.123)
 * 2: level (Debug, Info, Warn, Error, Fatal)
 * 3: source (optional component name)
 * 4: message (everything after the colon)
 */
const EMBY_LOG_PATTERN =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) (Debug|Info|Warn|Error|Fatal) ([^:]+): ?(.*)$/i;

/**
 * Alternative pattern without source component
 * Format: "2024-01-15 10:30:45.123 Info Message without source"
 */
const EMBY_LOG_PATTERN_NO_SOURCE =
  /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) (Debug|Info|Warn|Error|Fatal) (.+)$/i;

/**
 * Log level mapping from Emby levels to normalized levels
 */
const LEVEL_MAP: Record<string, LogLevel> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  fatal: 'fatal',
};

// =============================================================================
// Correlation Patterns
// =============================================================================

/**
 * Patterns to extract correlation IDs from Emby log messages
 */
export const EMBY_CORRELATION_PATTERNS: readonly CorrelationPattern[] = [
  // Session ID: SessionId=abc123 or session "abc123"
  { name: 'sessionId', pattern: /Session(?:Id)?[=:\s]+"?([a-f0-9-]{32,36})"?/i },

  // User ID: UserId=abc123 or User "username"
  { name: 'userId', pattern: /User(?:Id)?[=:\s]+"?([a-f0-9-]{32,36})"?/i },

  // Device ID: DeviceId=xxx
  { name: 'deviceId', pattern: /Device(?:Id)?[=:\s]+"?([^"\s,]+)"?/i },

  // Play Session ID
  { name: 'playSessionId', pattern: /PlaySessionId[=:\s]+"?([a-f0-9]+)"?/i },

  // Item ID: ItemId=abc123 or /Items/abc123
  { name: 'itemId', pattern: /(?:ItemId[=:\s]+|\/Items\/)([a-f0-9-]{32,36})/i },

  // Media source ID
  { name: 'mediaSourceId', pattern: /MediaSourceId[=:\s]+"?([a-f0-9-]+)"?/i },

  // Client IP: IP address patterns
  { name: 'clientIp', pattern: /(?:RemoteEndPoint|ClientIP|from)\s*[=:\s]*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/i },
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
const EXCEPTION_PATTERN = /^(?:System|Microsoft|Emby|MediaBrowser)\..+Exception:/;

/**
 * Pattern for inner exception markers
 */
const INNER_EXCEPTION_PATTERN = /^-{3}>\s+/;

// =============================================================================
// Timestamp Parsing
// =============================================================================

/**
 * Parse Emby timestamp format
 * "2024-01-15 10:30:45.123" -> Date
 */
function parseTimestamp(timestamp: string): Date | null {
  // Format: "2024-01-15 10:30:45.123"
  // JavaScript can parse this directly with a minor adjustment
  const isoString = timestamp.replace(' ', 'T');
  const date = new Date(isoString);

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

  for (const { name, pattern } of EMBY_CORRELATION_PATTERNS) {
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
 * Parse a single Emby log line
 * Returns null if the line cannot be parsed (invalid format or continuation)
 */
export function parseEmbyLogLine(line: string): ParsedLogEntry | null {
  const trimmedLine = line.trim();

  if (trimmedLine === '') {
    return null;
  }

  // Check if this is a continuation line (stack trace, etc.)
  if (isEmbyLogContinuation(trimmedLine)) {
    return null;
  }

  // Try main pattern with source component
  let match = trimmedLine.match(EMBY_LOG_PATTERN);
  let source: string | undefined;
  let message: string;
  let timestampStr: string | undefined;
  let levelStr: string | undefined;

  if (match !== null) {
    timestampStr = match[1];
    levelStr = match[2];
    source = match[3]?.trim();
    message = match[4] ?? '';
  } else {
    // Try pattern without source
    match = trimmedLine.match(EMBY_LOG_PATTERN_NO_SOURCE);
    if (match === null) {
      return null;
    }
    timestampStr = match[1];
    levelStr = match[2];
    message = match[3] ?? '';
  }

  if (timestampStr === undefined || levelStr === undefined) {
    return null;
  }

  // Parse timestamp
  const timestamp = parseTimestamp(timestampStr);
  if (timestamp === null) {
    return null;
  }

  // Map log level
  const level = LEVEL_MAP[levelStr.toLowerCase()] ?? 'info';

  // Extract correlation IDs from the message
  const correlations = extractCorrelationIds(message);

  return {
    timestamp,
    level,
    message,
    source,
    raw: line,
    sessionId: correlations['sessionId'],
    userId: correlations['userId'],
    deviceId: correlations['deviceId'],
    itemId: correlations['itemId'],
    metadata: Object.keys(correlations).length > 0 ? correlations : undefined,
  };
}

/**
 * Check if a line is a continuation of a previous log entry
 * (stack traces, multi-line output, etc.)
 */
export function isEmbyLogContinuation(line: string): boolean {
  const trimmed = line.trim();

  // Empty lines are not continuations by themselves
  if (trimmed.length === 0) {
    return false;
  }

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

  // End of exception info
  if (/^---\s+End of/.test(trimmed)) {
    return true;
  }

  // Lines that don't start with a timestamp but have leading whitespace
  // (indicates continuation)
  if (line.startsWith(' ') || line.startsWith('\t')) {
    // Make sure it's not just a line that happens to start with timestamp
    if (!EMBY_LOG_PATTERN.test(trimmed) && !EMBY_LOG_PATTERN_NO_SOURCE.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a log line with context for multi-line handling
 */
export function parseEmbyLogLineWithContext(
  line: string,
  context: LogParseContext
): LogParseResult {
  const isContinuation = isEmbyLogContinuation(line);

  if (isContinuation) {
    return {
      entry: null,
      isContinuation: true,
      previousComplete: false,
    };
  }

  const entry = parseEmbyLogLine(line);

  if (entry) {
    // If we have a previous entry, it's now complete
    return {
      entry,
      isContinuation: false,
      previousComplete: context.previousEntry !== undefined,
    };
  }

  // Line didn't parse - might be malformed or different format
  return {
    entry: null,
    isContinuation: false,
    previousComplete: false,
  };
}

/**
 * Check if a line looks like an exception/stack trace continuation
 */
export function isExceptionContinuation(line: string): boolean {
  const trimmed = line.trim();
  return STACK_TRACE_PATTERN.test(trimmed) || EXCEPTION_PATTERN.test(trimmed);
}
