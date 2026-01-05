import type {
  CorrelationPattern,
  LogLevel,
  ParsedLogEntry,
  LogFileConfig,
  LogParseContext,
  LogParseResult,
} from '@logarr/core';

/**
 * Jellyfin log file configuration
 * Defines where to find log files and how to parse them
 */
export const JELLYFIN_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/log'],
    linux: ['/var/lib/jellyfin/log', '~/.local/share/jellyfin/log'],
    windows: ['C:\\ProgramData\\Jellyfin\\Server\\log', '%LOCALAPPDATA%\\jellyfin\\log'],
    macos: ['~/.local/share/jellyfin/log', '~/Library/Application Support/Jellyfin/log'],
  },
  filePatterns: ['log_*.log', 'jellyfin*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /log_(\d{8})\.log$/,
};

/**
 * Serilog log level codes used by Jellyfin
 */
const LEVEL_MAP: Record<string, LogLevel> = {
  VRB: 'trace',
  DBG: 'debug',
  INF: 'info',
  WRN: 'warn',
  ERR: 'error',
  FTL: 'fatal',
};

/**
 * Regex pattern for parsing Jellyfin Serilog format
 * Format: [2024-01-15 10:30:45.123 -05:00] [INF] [12] Jellyfin.Api.Controllers: Message
 */
const LOG_PATTERN = /^\[(.+?)\]\s+\[(\w{3})\]\s+\[(\d+)\]\s+([^:]+):\s*(.*)$/;

/**
 * Multi-line exception pattern
 */
const EXCEPTION_PATTERN = /^(\s{2,}at\s+.+|System\..+Exception:.+)$/;

/**
 * Correlation patterns for extracting IDs from Jellyfin logs
 */
export const JELLYFIN_CORRELATION_PATTERNS: readonly CorrelationPattern[] = [
  { name: 'sessionId', pattern: /Session(?:Id)?[=:\s]+"?([a-f0-9-]{32,36})"?/i },
  { name: 'userId', pattern: /User(?:Id)?[=:\s]+"?([a-f0-9-]{32,36})"?/i },
  { name: 'deviceId', pattern: /Device(?:Id)?[=:\s]+"?([^"\s,]+)"?/i },
  { name: 'playSessionId', pattern: /PlaySessionId[=:\s]+"?([a-f0-9]+)"?/i },
  { name: 'itemId', pattern: /Item(?:Id)?[=:\s]+"?([a-f0-9-]{32,36})"?/i },
];

/**
 * Parse a Jellyfin Serilog log line into structured data
 */
export function parseJellyfinLogLine(line: string): ParsedLogEntry | null {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return null;
  }

  // Check if this is a continuation line (exception stack trace)
  if (EXCEPTION_PATTERN.test(trimmed)) {
    return null; // Will be handled by caller as continuation
  }

  const match = trimmed.match(LOG_PATTERN);

  if (match === null) {
    return null;
  }

  const [, timestampStr, levelCode, threadId, source, message] = match;

  if (
    timestampStr === undefined ||
    levelCode === undefined ||
    threadId === undefined ||
    source === undefined ||
    message === undefined
  ) {
    return null;
  }

  const level = LEVEL_MAP[levelCode] ?? 'info';
  const timestamp = new Date(timestampStr);

  // Validate timestamp
  if (Number.isNaN(timestamp.getTime())) {
    return null;
  }

  const entry: ParsedLogEntry = {
    timestamp,
    level,
    message: message.trim(),
    source: source.trim(),
    threadId,
    raw: line,
  };

  // Extract correlation IDs
  const correlations = extractCorrelationIds(message);

  return {
    ...entry,
    ...correlations,
  };
}

/**
 * Correlation ID extraction result
 */
interface CorrelationIds {
  sessionId?: string | undefined;
  userId?: string | undefined;
  deviceId?: string | undefined;
  playSessionId?: string | undefined;
  itemId?: string | undefined;
}

/**
 * Extract correlation IDs from a log message
 */
function extractCorrelationIds(message: string): CorrelationIds {
  let sessionId: string | undefined;
  let userId: string | undefined;
  let deviceId: string | undefined;
  let playSessionId: string | undefined;
  let itemId: string | undefined;

  for (const pattern of JELLYFIN_CORRELATION_PATTERNS) {
    const match = message.match(pattern.pattern);

    if (match?.[1] !== undefined) {
      switch (pattern.name) {
        case 'sessionId':
          sessionId = match[1];
          break;
        case 'userId':
          userId = match[1];
          break;
        case 'deviceId':
          deviceId = match[1];
          break;
        case 'playSessionId':
          playSessionId = match[1];
          break;
        case 'itemId':
          itemId = match[1];
          break;
      }
    }
  }

  return { sessionId, userId, deviceId, playSessionId, itemId };
}

/**
 * Check if a line is an exception continuation
 */
export function isExceptionContinuation(line: string): boolean {
  return EXCEPTION_PATTERN.test(line.trim());
}

/**
 * Check if a line is a continuation of a previous log entry
 * Detects stack traces, wrapped text, and multi-line messages
 */
export function isJellyfinLogContinuation(line: string): boolean {
  const trimmed = line.trim();

  // Empty lines are not continuations
  if (trimmed.length === 0) {
    return false;
  }

  // Stack trace lines start with "at " (with leading whitespace)
  if (/^\s{2,}at\s+/.test(line)) {
    return true;
  }

  // Exception type lines
  if (/^(System|Microsoft|Jellyfin|NLog)\.\w+Exception:/.test(trimmed)) {
    return true;
  }

  // Inner exception marker
  if (/^--->\s+/.test(trimmed)) {
    return true;
  }

  // End of exception info
  if (/^---\s+End of/.test(trimmed)) {
    return true;
  }

  // Lines without a timestamp are likely continuations
  // Jellyfin timestamps start with [YYYY-MM-DD
  if (!/^\[\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    // If line starts with significant whitespace, it's a continuation
    if (/^\s{2,}/.test(line)) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a log line with context for multi-line handling
 * Returns detailed result for the caller to handle continuations
 */
export function parseJellyfinLogLineWithContext(
  line: string,
  context: LogParseContext
): LogParseResult {
  // Check if this is a continuation
  const isContinuation = isJellyfinLogContinuation(line);

  if (isContinuation) {
    return {
      entry: null,
      isContinuation: true,
      previousComplete: false,
    };
  }

  // Try to parse as a new entry
  const entry = parseJellyfinLogLine(line);

  if (entry) {
    // If we have a previous entry, it's now complete
    return {
      entry,
      isContinuation: false,
      previousComplete: context.previousEntry !== undefined,
    };
  }

  // Line didn't parse - might be malformed or a different format
  return {
    entry: null,
    isContinuation: false,
    previousComplete: false,
  };
}
