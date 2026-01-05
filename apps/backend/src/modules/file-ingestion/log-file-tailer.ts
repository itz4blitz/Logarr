import { createReadStream, statSync, unwatchFile } from 'fs';
import { createInterface } from 'readline';

import type { LogFileProcessor } from './log-file-processor';
import type { MediaServerProvider, ParsedLogEntry } from '@logarr/core';
import type { Stats } from 'fs';
import type { Interface } from 'readline';

// Local interfaces until core package is rebuilt
interface LogFileState {
  id: string;
  serverId: string;
  filePath: string;
  absolutePath: string;
  fileSize: bigint;
  byteOffset: bigint;
  lineNumber: number;
  fileInode: string | null;
  fileModifiedAt: Date | null;
  lastReadAt: Date | null;
  isActive: boolean;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TailOptions {
  serverId: string;
  filePath: string;
  resumeFromState?: LogFileState;
  onEntry: (entry: ParsedLogEntry) => Promise<void>;
  onError: (error: Error) => void;
  onRotation?: () => void;
  onStateChange?: (state: Partial<LogFileState>) => Promise<void>;
}

/**
 * LogFileTailer - Tails a log file and emits parsed entries
 *
 * Features:
 * - Resumes from last known position
 * - Detects file rotation
 * - Handles multi-line entries via LogFileProcessor
 * - Uses polling-based file watching for cross-platform compatibility
 */
export class LogFileTailer {
  private readonly serverId: string;
  private readonly filePath: string;
  private readonly onEntry: (entry: ParsedLogEntry) => Promise<void>;
  private readonly onError: (error: Error) => void;
  private readonly onRotation?: () => void;
  private readonly onStateChange?: (state: Partial<LogFileState>) => Promise<void>;
  private readonly processor: LogFileProcessor;
  private readonly provider: MediaServerProvider;

  private currentOffset: bigint = 0n;
  private lineNumber: number = 0;
  private lastInode: string | null = null;
  private lastSize: bigint = 0n;
  private isRunning: boolean = false;
  private readLineInterface: Interface | null = null;
  private watchInterval: NodeJS.Timeout | null = null;

  constructor(options: TailOptions, processor: LogFileProcessor, provider: MediaServerProvider) {
    this.serverId = options.serverId;
    this.filePath = options.filePath;
    this.onEntry = options.onEntry;
    this.onError = options.onError;
    if (options.onRotation) {
      this.onRotation = options.onRotation;
    }
    if (options.onStateChange) {
      this.onStateChange = options.onStateChange;
    }
    this.processor = processor;
    this.provider = provider;

    // Resume from state if available
    if (options.resumeFromState) {
      this.currentOffset = options.resumeFromState.byteOffset;
      this.lineNumber = options.resumeFromState.lineNumber;
      this.lastInode = options.resumeFromState.fileInode;
      this.lastSize = options.resumeFromState.fileSize;
    }
  }

  /**
   * Start tailing the file
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    try {
      // Get initial file stats
      const stats = statSync(this.filePath);
      const currentInode = this.getInode(stats);
      const currentSize = BigInt(stats.size);

      // Check for rotation
      if (this.detectRotation(currentInode, currentSize)) {
        // File was rotated, start from beginning
        this.currentOffset = 0n;
        this.lineNumber = 0;
        this.onRotation?.();
      }

      this.lastInode = currentInode;
      this.lastSize = currentSize;

      // Read existing content from offset
      await this.readFromOffset();

      // Start watching for changes
      this.startWatching();
    } catch (error) {
      this.isRunning = false;
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * Stop tailing the file
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.readLineInterface) {
      this.readLineInterface.close();
      this.readLineInterface = null;
    }

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    unwatchFile(this.filePath);

    // Emit any pending entry from processor
    const pending = this.processor.flush();
    if (pending) {
      try {
        await this.onEntry(pending);
      } catch (error) {
        this.onError(error as Error);
      }
    }
  }

  /**
   * Get current state for persistence
   */
  getState(): Partial<LogFileState> {
    return {
      serverId: this.serverId,
      filePath: this.filePath,
      absolutePath: this.filePath, // Same for now, could be resolved
      fileSize: this.lastSize,
      byteOffset: this.currentOffset,
      lineNumber: this.lineNumber,
      fileInode: this.lastInode,
      lastReadAt: new Date(),
      isActive: this.isRunning,
    };
  }

  /**
   * Read file content from the current offset
   */
  private async readFromOffset(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startOffset = Number(this.currentOffset);

      const stream = createReadStream(this.filePath, {
        start: startOffset,
        encoding: 'utf-8',
      });

      this.readLineInterface = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      let bytesRead = 0;

      this.readLineInterface.on('line', async (line) => {
        // Account for line content + newline character
        bytesRead += Buffer.byteLength(line, 'utf-8') + 1;
        this.lineNumber++;

        await this.processLine(line);
      });

      this.readLineInterface.on('close', async () => {
        this.currentOffset += BigInt(bytesRead);

        // Persist state after reading
        if (this.onStateChange && bytesRead > 0) {
          try {
            await this.onStateChange(this.getState());
          } catch (error) {
            this.onError(error as Error);
          }
        }

        resolve();
      });

      this.readLineInterface.on('error', (error) => {
        this.onError(error);
        reject(error);
      });
    });
  }

  /**
   * Process a single line through the processor
   */
  private async processLine(line: string): Promise<void> {
    const result = this.processor.processLine(line, this.lineNumber);

    // Emit completed entry
    if (result) {
      try {
        await this.onEntry(result);
      } catch (error) {
        this.onError(error as Error);
      }
    }
  }

  /**
   * Start watching the file for changes
   */
  private startWatching(): void {
    // Use polling-based watching for cross-platform compatibility
    // Check every 1 second for changes
    this.watchInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        const stats = statSync(this.filePath);
        const currentInode = this.getInode(stats);
        const currentSize = BigInt(stats.size);

        // Check for rotation
        if (this.detectRotation(currentInode, currentSize)) {
          this.currentOffset = 0n;
          this.lineNumber = 0;
          this.lastInode = currentInode;
          this.lastSize = currentSize;
          this.onRotation?.();
          await this.readFromOffset();
          return;
        }

        // Check for new content
        if (currentSize > this.lastSize) {
          this.lastSize = currentSize;
          await this.readFromOffset();
        }
      } catch (error) {
        // File might be temporarily unavailable during rotation
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          this.onError(error as Error);
        }
      }
    }, 1000);
  }

  /**
   * Detect if the file was rotated
   */
  private detectRotation(currentInode: string | null, currentSize: bigint): boolean {
    // File was truncated (size decreased)
    if (currentSize < this.currentOffset) {
      return true;
    }

    // Inode changed (file was replaced)
    if (this.lastInode && currentInode && this.lastInode !== currentInode) {
      return true;
    }

    return false;
  }

  /**
   * Get file inode as string (platform-specific)
   */
  private getInode(stats: Stats): string | null {
    // On Unix systems, use inode number
    // On Windows, ino is always 0, so we use a combination of other stats
    if (stats.ino !== 0) {
      return stats.ino.toString();
    }

    // Windows fallback: use birth time + dev as pseudo-inode
    return `${stats.birthtimeMs}-${stats.dev}`;
  }
}
