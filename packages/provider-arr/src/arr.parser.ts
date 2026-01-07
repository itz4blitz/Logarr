/**
 * Parser utilities for *arr application log files
 *
 * *arr applications (Sonarr, Radarr, Lidarr, Readarr, Prowlarr) use NLog format:
 * Format: 2024-01-15 10:30:45.123|Info|ComponentName|Message here
 *
 * Stack traces appear on continuation lines without the standard format prefix.
 */

import type { ParsedLogEntry, LogLevel } from '@logarr/core';

// Local interface until core package is rebuilt
interface LogFileConfig {
  defaultPaths: {
    docker: readonly string[];
    linux: readonly string[];
    windows: readonly string[];
    macos: readonly string[];
  };
  filePatterns: readonly string[];
  encoding?: string;
  rotatesDaily?: boolean;
  datePattern?: RegExp;
}

interface LogParseContext {
  previousEntry?: ParsedLogEntry;
  continuationLines: string[];
  filePath: string;
  lineNumber: number;
}

interface LogParseResult {
  entry: ParsedLogEntry | null;
  isContinuation: boolean;
  previousComplete: boolean;
}

/**
 * Log file configuration for Sonarr
 */
export const SONARR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/logs'],
    linux: ['~/.config/Sonarr/logs', '/var/lib/sonarr/logs', '~/.local/share/Sonarr/logs'],
    windows: [
      '%APPDATA%\\Sonarr\\logs',
      '%LOCALAPPDATA%\\Sonarr\\logs',
      'C:\\ProgramData\\Sonarr\\logs',
    ],
    macos: ['~/.config/Sonarr/logs', '~/Library/Application Support/Sonarr/logs'],
  },
  filePatterns: ['sonarr.txt', 'sonarr.*.txt', '*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /sonarr\.(\d{4}-\d{2}-\d{2})\.txt$/,
};

/**
 * Log file configuration for Radarr
 */
export const RADARR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/logs'],
    linux: ['~/.config/Radarr/logs', '/var/lib/radarr/logs', '~/.local/share/Radarr/logs'],
    windows: [
      '%APPDATA%\\Radarr\\logs',
      '%LOCALAPPDATA%\\Radarr\\logs',
      'C:\\ProgramData\\Radarr\\logs',
    ],
    macos: ['~/.config/Radarr/logs', '~/Library/Application Support/Radarr/logs'],
  },
  filePatterns: ['radarr.txt', 'radarr.*.txt', '*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /radarr\.(\d{4}-\d{2}-\d{2})\.txt$/,
};

/**
 * Log file configuration for Lidarr
 */
export const LIDARR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/logs'],
    linux: ['~/.config/Lidarr/logs', '/var/lib/lidarr/logs', '~/.local/share/Lidarr/logs'],
    windows: [
      '%APPDATA%\\Lidarr\\logs',
      '%LOCALAPPDATA%\\Lidarr\\logs',
      'C:\\ProgramData\\Lidarr\\logs',
    ],
    macos: ['~/.config/Lidarr/logs', '~/Library/Application Support/Lidarr/logs'],
  },
  filePatterns: ['lidarr.txt', 'lidarr.*.txt', '*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /lidarr\.(\d{4}-\d{2}-\d{2})\.txt$/,
};

/**
 * Log file configuration for Readarr
 */
export const READARR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/logs'],
    linux: ['~/.config/Readarr/logs', '/var/lib/readarr/logs', '~/.local/share/Readarr/logs'],
    windows: [
      '%APPDATA%\\Readarr\\logs',
      '%LOCALAPPDATA%\\Readarr\\logs',
      'C:\\ProgramData\\Readarr\\logs',
    ],
    macos: ['~/.config/Readarr/logs', '~/Library/Application Support/Readarr/logs'],
  },
  filePatterns: ['readarr.txt', 'readarr.*.txt', '*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /readarr\.(\d{4}-\d{2}-\d{2})\.txt$/,
};

/**
 * Log file configuration for Prowlarr
 */
export const PROWLARR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/logs'],
    linux: ['~/.config/Prowlarr/logs', '/var/lib/prowlarr/logs', '~/.local/share/Prowlarr/logs'],
    windows: [
      '%APPDATA%\\Prowlarr\\logs',
      '%LOCALAPPDATA%\\Prowlarr\\logs',
      'C:\\ProgramData\\Prowlarr\\logs',
    ],
    macos: ['~/.config/Prowlarr/logs', '~/Library/Application Support/Prowlarr/logs'],
  },
  filePatterns: ['prowlarr.txt', 'prowlarr.*.txt', '*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /prowlarr\.(\d{4}-\d{2}-\d{2})\.txt$/,
};

/**
 * Log file configuration for Whisparr
 */
export const WHISPARR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/logs'],
    linux: ['~/.config/Whisparr/logs', '/var/lib/whisparr/logs', '~/.local/share/Whisparr/logs'],
    windows: [
      '%APPDATA%\\Whisparr\\logs',
      '%LOCALAPPDATA%\\Whisparr\\logs',
      'C:\\ProgramData\\Whisparr\\logs',
    ],
    macos: ['~/.config/Whisparr/logs', '~/Library/Application Support/Whisparr/logs'],
  },
  filePatterns: ['whisparr.txt', 'whisparr.*.txt', '*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
  datePattern: /whisparr\.(\d{4}-\d{2}-\d{2})\.txt$/,
};

/**
 * Generic arr log file configuration (fallback)
 */
export const ARR_LOG_FILE_CONFIG: LogFileConfig = {
  defaultPaths: {
    docker: ['/config/logs'],
    linux: ['~/.config/*/logs'],
    windows: ['%APPDATA%\\*arr\\logs'],
    macos: ['~/.config/*/logs'],
  },
  filePatterns: ['*.txt', '*.log'],
  encoding: 'utf-8',
  rotatesDaily: true,
};

/**
 * NLog timestamp + metadata regex
 * Matches: 2024-01-15 10:30:45.123|Level|Component|Message
 */
const NLOG_LINE_REGEX =
  /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\|(\w+)\|([^|]+)\|(.*)$/;

/**
 * Log level mapping from NLog format
 */
const LEVEL_MAP: Record<string, LogLevel> = {
  Trace: 'trace',
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Warning: 'warn',
  Error: 'error',
  Fatal: 'fatal',
};

/**
 * Parse a single NLog format log line
 */
export function parseArrLogLine(line: string): ParsedLogEntry | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  const match = trimmed.match(NLOG_LINE_REGEX);
  if (!match) return null;

  const timestampStr = match[1];
  const levelStr = match[2];
  const source = match[3];
  const message = match[4];

  if (
    timestampStr === undefined ||
    levelStr === undefined ||
    source === undefined ||
    message === undefined
  ) {
    return null;
  }

  return {
    timestamp: new Date(timestampStr),
    level: LEVEL_MAP[levelStr] ?? 'info',
    message,
    source,
    raw: line,
  };
}

/**
 * Check if a line is a continuation of a previous log entry
 *
 * Continuation lines in .NET applications include:
 * - Stack trace lines (starting with "   at ")
 * - Exception type lines (like "System.Exception: message")
 * - Inner exception markers ("---> ")
 * - Lines that don't match the NLog timestamp|level|source|message format
 */
export function isArrLogContinuation(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;

  // Stack trace lines (C#/.NET format)
  if (/^\s{2,}at\s+/.test(line)) return true;

  // .NET exception types
  if (/^(System|Microsoft|NLog|NzbDrone)\.\w+(\.\w+)*Exception:/i.test(trimmed)) return true;

  // Inner exception marker
  if (/^--->\s+/.test(trimmed)) return true;

  // End of exception info
  if (/^---\s+End of/.test(trimmed)) return true;

  // If it doesn't start with a timestamp, it's likely a continuation
  if (!NLOG_LINE_REGEX.test(trimmed)) {
    // But exclude empty lines and certain special formats
    if (trimmed.length > 0) {
      return true;
    }
  }

  return false;
}

/**
 * Parse a log line with context for multi-line entry support
 *
 * Handles:
 * - Regular single-line entries
 * - Multi-line entries with stack traces
 * - Exception details spanning multiple lines
 */
export function parseArrLogLineWithContext(line: string, context: LogParseContext): LogParseResult {
  const trimmed = line.trim();

  // Check if this is a continuation line
  if (isArrLogContinuation(line)) {
    // Add to continuation buffer
    context.continuationLines.push(line);

    return {
      entry: null,
      isContinuation: true,
      previousComplete: false,
    };
  }

  // This is a new log entry - first, check if we need to complete the previous entry
  let completedEntry: ParsedLogEntry | null = null;

  if (context.previousEntry && context.continuationLines.length > 0) {
    // Check if it's an exception
    const exceptionMatch = context.continuationLines[0]?.match(
      /^((?:System|Microsoft|NLog|NzbDrone)\.\w+(?:\.\w+)*Exception):\s*(.*)$/i
    );

    let message = context.previousEntry.message;
    let exception: string | undefined;

    if (exceptionMatch) {
      exception = exceptionMatch[1];
      // Append exception message to the main message if it's different
      const exceptionMessage = exceptionMatch[2];
      if (
        exceptionMessage !== undefined &&
        exceptionMessage !== '' &&
        !message.includes(exceptionMessage)
      ) {
        message = `${message} - ${exceptionMatch[2]}`;
      }
    }

    // Build the complete entry with continuation lines
    completedEntry = {
      ...context.previousEntry,
      message,
      exception,
      stackTrace: context.continuationLines.join('\n'),
      raw: context.previousEntry.raw + '\n' + context.continuationLines.join('\n'),
    };
  } else if (context.previousEntry) {
    // Previous entry is complete with no continuation
    completedEntry = context.previousEntry;
  }

  // Clear continuation buffer
  context.continuationLines = [];

  // Parse the new line
  const parsed = parseArrLogLine(trimmed);

  if (parsed) {
    // Store as new previous entry
    context.previousEntry = parsed;

    return {
      entry: completedEntry,
      isContinuation: false,
      previousComplete: completedEntry !== null,
    };
  }

  // Line didn't match expected format - treat as standalone
  delete context.previousEntry;

  return {
    entry: completedEntry,
    isContinuation: false,
    previousComplete: completedEntry !== null,
  };
}

/**
 * Extract metadata from arr log messages
 *
 * Common patterns in *arr logs:
 * - Download IDs: DownloadId=abc123
 * - Indexer names: [Indexer] or Indexer=name
 * - Media titles in various formats
 */
export function extractArrMetadata(message: string): Record<string, string> {
  const metadata: Record<string, string> = {};

  // Download ID
  const downloadIdMatch = message.match(/DownloadId[=:\s]+"?([a-zA-Z0-9]+)"?/i);
  if (downloadIdMatch?.[1] !== undefined) {
    metadata['downloadId'] = downloadIdMatch[1];
  }

  // Indexer
  const indexerMatch = message.match(/\[([^\]]+)\]|Indexer[=:\s]+"?([^"\s,]+)"?/i);
  if (indexerMatch !== null) {
    const indexerValue = indexerMatch[1] ?? indexerMatch[2];
    if (indexerValue !== undefined) {
      metadata['indexer'] = indexerValue;
    }
  }

  // Release/Title patterns
  const releaseMatch = message.match(/(?:Release|Title)[=:\s]+"?([^"]+)"?/i);
  if (releaseMatch?.[1] !== undefined) {
    metadata['release'] = releaseMatch[1];
  }

  // Quality
  const qualityMatch = message.match(/Quality[=:\s]+"?([^"\s,]+)"?/i);
  if (qualityMatch?.[1] !== undefined) {
    metadata['quality'] = qualityMatch[1];
  }

  return metadata;
}

/**
 * Determine severity boost for specific *arr error patterns
 *
 * Some warnings should be treated as errors for monitoring purposes
 */
export function getArrSeverityBoost(message: string, level: LogLevel): LogLevel {
  // These warning patterns are actually critical issues
  const criticalPatterns = [
    /disk\s+space/i,
    /permission\s+denied/i,
    /access\s+denied/i,
    /database\s+locked/i,
    /connection\s+refused/i,
    /timeout/i,
    /failed\s+to\s+import/i,
  ];

  if (level === 'warn') {
    for (const pattern of criticalPatterns) {
      if (pattern.test(message)) {
        return 'error';
      }
    }
  }

  return level;
}
