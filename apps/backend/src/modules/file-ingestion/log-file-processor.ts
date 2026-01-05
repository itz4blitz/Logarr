import type { MediaServerProvider, ParsedLogEntry } from '@logarr/core';

// Local interface until core package is rebuilt
interface LogParseContext {
  previousEntry?: ParsedLogEntry;
  continuationLines: readonly string[];
  filePath: string;
  lineNumber: number;
}

interface LogParseResult {
  entry: ParsedLogEntry | null;
  isContinuation: boolean;
  previousComplete: boolean;
}

// Type guard for providers with context-aware parsing
interface ContextAwareProvider extends MediaServerProvider {
  parseLogLineWithContext(line: string, context: LogParseContext): LogParseResult;
  isLogContinuation?(line: string): boolean;
}

function hasContextParsing(provider: MediaServerProvider): provider is ContextAwareProvider {
  return typeof (provider as ContextAwareProvider).parseLogLineWithContext === 'function';
}

function hasLogContinuation(provider: MediaServerProvider): provider is ContextAwareProvider {
  return typeof (provider as ContextAwareProvider).isLogContinuation === 'function';
}

/**
 * LogFileProcessor - Handles multi-line log entry assembly
 *
 * Log entries can span multiple lines (e.g., stack traces).
 * This processor buffers continuation lines and emits complete entries.
 */
export class LogFileProcessor {
  private readonly provider: MediaServerProvider;
  private pendingEntry: ParsedLogEntry | null = null;
  private continuationLines: string[] = [];
  private currentFilePath: string = '';

  constructor(provider: MediaServerProvider) {
    this.provider = provider;
  }

  /**
   * Process a single line, returning a complete entry if one is ready
   */
  processLine(line: string, lineNumber: number): ParsedLogEntry | null {
    // Skip empty lines
    if (!line.trim()) {
      return null;
    }

    // Check if this line continues the previous entry
    const isContinuation = this.isLogContinuation(line);

    if (isContinuation) {
      // Add to continuation buffer if we have a pending entry
      if (this.pendingEntry) {
        this.continuationLines.push(line);
      }
      return null;
    }

    // This is a new entry - finalize any pending entry first
    const completedEntry = this.finalizePendingEntry();

    // Parse the new line
    const parsed = this.parseLogLine(line, lineNumber);
    if (parsed) {
      this.pendingEntry = parsed;
      this.continuationLines = [];
    }

    return completedEntry;
  }

  /**
   * Flush any pending entry (call when done processing)
   */
  flush(): ParsedLogEntry | null {
    const entry = this.finalizePendingEntry();
    this.pendingEntry = null;
    this.continuationLines = [];
    return entry;
  }

  /**
   * Check if a line is a continuation of the previous entry
   */
  private isLogContinuation(line: string): boolean {
    // If provider implements custom continuation detection, use it
    if (hasLogContinuation(this.provider)) {
      return this.provider.isLogContinuation!(line);
    }

    // Default continuation detection patterns
    const trimmed = line.trim();

    // Stack trace lines typically start with "at " or whitespace + "at "
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

    // Lines that don't start with a timestamp pattern are likely continuations
    // Common timestamp patterns:
    // [2024-01-15 10:30:45] - Serilog
    // 2024-01-15 10:30:45 - NLog
    // Jan 15, 2024 - Plex
    const hasTimestamp = /^(\[?\d{4}-\d{2}-\d{2}|\w{3}\s+\d{1,2},\s+\d{4})/.test(trimmed);

    // If line starts with significant whitespace and no timestamp, it's likely a continuation
    if (!hasTimestamp && /^\s{2,}/.test(line)) {
      return true;
    }

    return false;
  }

  /**
   * Parse a log line using the provider's parser
   */
  private parseLogLine(line: string, lineNumber: number): ParsedLogEntry | null {
    // If provider implements context-aware parsing, use it
    if (hasContextParsing(this.provider)) {
      const context: LogParseContext = {
        continuationLines: this.continuationLines,
        filePath: this.currentFilePath,
        lineNumber,
      };
      if (this.pendingEntry) {
        context.previousEntry = this.pendingEntry;
      }

      const result = this.provider.parseLogLineWithContext(line, context);

      // If the result indicates this is a continuation, add to buffer
      if (result.isContinuation && this.pendingEntry) {
        this.continuationLines.push(line);
        return null;
      }

      // If previous entry is complete, we should emit it
      if (result.previousComplete && this.pendingEntry) {
        const completed = this.finalizePendingEntry();
        this.pendingEntry = result.entry;
        this.continuationLines = [];
        return completed;
      }

      return result.entry;
    }

    // Fallback to simple line parsing
    return this.provider.parseLogLine(line);
  }

  /**
   * Finalize a pending entry by attaching any continuation lines
   */
  private finalizePendingEntry(): ParsedLogEntry | null {
    if (!this.pendingEntry) {
      return null;
    }

    const entry = this.pendingEntry;
    // Clear pending entry after finalizing
    this.pendingEntry = null;

    // If we have continuation lines, attach them as stack trace
    if (this.continuationLines.length > 0) {
      const stackTrace = this.continuationLines.join('\n');

      return {
        ...entry,
        stackTrace: entry.stackTrace ? `${entry.stackTrace}\n${stackTrace}` : stackTrace,
        raw: entry.raw + '\n' + this.continuationLines.join('\n'),
      };
    }

    return entry;
  }

  /**
   * Set the current file path for context
   */
  setFilePath(filePath: string): void {
    this.currentFilePath = filePath;
  }
}
