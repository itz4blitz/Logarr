import { createHash } from 'crypto';

import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';
import { IssuesGateway } from '../issues/issues.gateway';
import { IssuesService } from '../issues/issues.service';
import { LogsGateway } from '../logs/logs.gateway';

import { FileDiscoveryService } from './file-discovery.service';
import { FileStateService } from './file-state.service';
import { LogFileProcessor } from './log-file-processor';
import { LogFileTailer } from './log-file-tailer';

import type { MediaServerProvider, ParsedLogEntry } from '@logarr/core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Type guard for providers with file ingestion support
interface FileIngestionProvider extends MediaServerProvider {
  getLogFileConfig(): LogFileConfig;
  isLogContinuation?(line: string): boolean;
}

function hasFileIngestionSupport(provider: MediaServerProvider): provider is FileIngestionProvider {
  return typeof (provider as FileIngestionProvider).getLogFileConfig === 'function';
}

// LogFileConfig interface
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

/**
 * FileIngestionService - Responsible for file-based log ingestion
 *
 * ## How Log File Access Works
 *
 * Since Logarr and the media servers typically run in separate Docker containers,
 * log files must be made accessible through one of these methods:
 *
 * 1. **Volume Mounts (Recommended)**:
 *    Mount the log directories from your media server containers to Logarr's container.
 *    Example docker-compose:
 *    ```yaml
 *    logarr:
 *      volumes:
 *        - /path/to/jellyfin/log:/logs/jellyfin:ro
 *        - /path/to/sonarr/logs:/logs/sonarr:ro
 *    ```
 *    Then configure the server with logPaths: ['/logs/jellyfin']
 *
 * 2. **Shared Volume**:
 *    Use a shared named volume between containers.
 *
 * 3. **Direct Host Path**:
 *    If running Logarr on the host (not in Docker), directly access the log directories.
 */
@Injectable()
export class FileIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileIngestionService.name);
  private tailers: Map<string, LogFileTailer> = new Map();
  private isStarted = false;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly fileStateService: FileStateService,
    private readonly fileDiscoveryService: FileDiscoveryService,
    private readonly logsGateway: LogsGateway,
    private readonly issuesService: IssuesService,
    private readonly issuesGateway: IssuesGateway
  ) {}

  async onModuleInit() {
    this.logger.log('File ingestion service initialized');
  }

  async onModuleDestroy() {
    await this.stopAllTailers();
  }

  /**
   * Start file ingestion for all enabled servers
   */
  async startFileIngestion(providers: Map<string, MediaServerProvider>) {
    if (this.isStarted) {
      this.logger.warn('File ingestion already started');
      return;
    }

    this.logger.log('Starting file ingestion...');

    const servers = await this.db
      .select()
      .from(schema.servers)
      .where(
        and(eq(schema.servers.isEnabled, true), eq(schema.servers.fileIngestionEnabled, true))
      );

    this.logger.log(`Found ${servers.length} servers with file ingestion enabled`);

    for (const server of servers) {
      try {
        await this.startServerFileIngestion(server, providers);
      } catch (error) {
        this.logger.error(`Failed to start file ingestion for server ${server.name}:`, error);
      }
    }

    this.isStarted = true;
  }

  /**
   * Start file ingestion for a single server
   */
  async startServerFileIngestion(
    server: typeof schema.servers.$inferSelect,
    providers: Map<string, MediaServerProvider>
  ) {
    const provider = providers.get(server.providerId);
    if (!provider) {
      this.logger.warn(`No provider found for ${server.providerId}`);
      return;
    }

    // Check if provider supports file-based log ingestion
    if (!hasFileIngestionSupport(provider)) {
      this.logger.debug(`Provider ${server.providerId} does not support file-based log ingestion`);
      return;
    }

    const logFileConfig = provider.getLogFileConfig();

    // Get paths to monitor - use server-configured paths or provider defaults
    let paths: string[];
    if (server.logPaths && server.logPaths.length > 0) {
      paths = [...server.logPaths];
    } else {
      paths = await this.fileDiscoveryService.getDefaultPaths(logFileConfig);
    }

    const patterns =
      server.logFilePatterns && server.logFilePatterns.length > 0
        ? [...server.logFilePatterns]
        : [...logFileConfig.filePatterns];

    this.logger.log(`Starting file ingestion for ${server.name}`);
    this.logger.log(`  Paths: ${paths.join(', ')}`);
    this.logger.log(`  Patterns: ${patterns.join(', ')}`);

    // Validate paths exist
    for (const path of paths) {
      const validation = await this.fileDiscoveryService.validatePath(path);
      if (!validation.accessible) {
        this.logger.warn(`Path not accessible for ${server.name}: ${path} - ${validation.error}`);
      }
    }

    // Discover log files
    const logFiles = await this.fileDiscoveryService.discoverLogFiles(paths, patterns);

    if (logFiles.length === 0) {
      this.logger.warn(
        `No log files found for server ${server.name} in paths: ${paths.join(', ')}`
      );
      return;
    }

    this.logger.log(`Found ${logFiles.length} log files for ${server.name}:`);
    logFiles.forEach((f) => this.logger.debug(`  - ${f}`));

    // Start tailing each file
    for (const filePath of logFiles) {
      await this.startTailingFile(server.id, filePath, provider);
    }
  }

  /**
   * Start tailing a single log file
   */
  private async startTailingFile(
    serverId: string,
    filePath: string,
    provider: MediaServerProvider
  ) {
    const tailerId = `${serverId}:${filePath}`;

    // Check if already tailing this file
    if (this.tailers.has(tailerId)) {
      this.logger.debug(`Already tailing ${filePath}`);
      return;
    }

    // Get or create file state
    let state = await this.fileStateService.getState(serverId, filePath);
    if (!state) {
      state = await this.fileStateService.createState(serverId, filePath);
    }

    // Create processor for multi-line handling
    const processor = new LogFileProcessor(provider);
    processor.setFilePath(filePath);

    // Create tailer
    const tailer = new LogFileTailer(
      {
        serverId,
        filePath,
        resumeFromState: state ?? undefined,
        onEntry: async (entry: ParsedLogEntry) => {
          await this.processEntry(serverId, entry, filePath);
        },
        onError: (error: Error) => {
          this.logger.error(`Error tailing ${filePath}:`, error.message);
          this.fileStateService.updateError(serverId, filePath, error.message);
        },
        onRotation: () => {
          this.logger.log(`Log rotation detected for ${filePath}`);
          this.fileStateService.resetState(serverId, filePath);
        },
        onStateChange: async (newState) => {
          // Persist state to database
          const updates: {
            byteOffset?: bigint;
            lineNumber?: number;
            fileSize?: bigint;
            fileInode?: string | null;
          } = {};

          if (newState.byteOffset !== undefined) {
            updates.byteOffset = newState.byteOffset;
          }
          if (newState.lineNumber !== undefined) {
            updates.lineNumber = newState.lineNumber;
          }
          if (newState.fileSize !== undefined) {
            updates.fileSize = newState.fileSize;
          }
          if (newState.fileInode !== undefined) {
            updates.fileInode = newState.fileInode;
          }

          await this.fileStateService.updateState(serverId, filePath, updates);
        },
      },
      processor,
      provider
    );

    this.tailers.set(tailerId, tailer);

    // Start tailing
    try {
      await tailer.start();
      this.logger.log(`Started tailing ${filePath}`);
    } catch (error) {
      this.logger.error(`Failed to start tailing ${filePath}:`, error);
      this.tailers.delete(tailerId);
    }
  }

  /**
   * Stop tailing all files
   */
  async stopAllTailers() {
    this.logger.log(`Stopping ${this.tailers.size} file tailers...`);

    for (const [tailerId, tailer] of this.tailers) {
      try {
        await tailer.stop();
      } catch (error) {
        this.logger.error(`Error stopping tailer ${tailerId}:`, error);
      }
    }

    this.tailers.clear();
    this.isStarted = false;
  }

  /**
   * Stop file ingestion for a specific server
   */
  async stopServerFileIngestion(serverId: string) {
    const serverTailers = Array.from(this.tailers.entries()).filter(([id]) =>
      id.startsWith(`${serverId}:`)
    );

    for (const [tailerId, tailer] of serverTailers) {
      try {
        await tailer.stop();
        this.tailers.delete(tailerId);
      } catch (error) {
        this.logger.error(`Error stopping tailer ${tailerId}:`, error);
      }
    }
  }

  /**
   * Process a parsed log entry
   */
  private async processEntry(serverId: string, entry: ParsedLogEntry, filePath: string) {
    // Generate deduplication key
    const dedupKey = this.generateDeduplicationKey(entry, serverId);

    // Insert with conflict handling for deduplication
    const result = await this.db
      .insert(schema.logEntries)
      .values({
        serverId,
        timestamp: entry.timestamp,
        level: entry.level,
        message: entry.message,
        source: entry.source ?? null,
        threadId: entry.threadId ?? null,
        raw: entry.raw,
        sessionId: entry.sessionId ?? null,
        userId: entry.userId ?? null,
        deviceId: entry.deviceId ?? null,
        itemId: entry.itemId ?? null,
        playSessionId: entry.playSessionId ?? null,
        metadata: entry.metadata ?? null,
        exception: entry.exception ?? null,
        stackTrace: entry.stackTrace ?? null,
        logSource: 'file',
        logFilePath: filePath,
        deduplicationKey: dedupKey,
      })
      .onConflictDoNothing({
        target: [schema.logEntries.serverId, schema.logEntries.deduplicationKey],
      })
      .returning();

    if (result.length > 0) {
      const inserted = result[0]!;
      this.logger.debug(`Ingested log entry from file: ${entry.message.substring(0, 50)}...`);

      // Broadcast to WebSocket clients
      const logData: Parameters<typeof this.logsGateway.broadcastLog>[0] = {
        id: inserted.id,
        serverId,
        timestamp: inserted.timestamp,
        level: inserted.level,
        message: inserted.message,
        logSource: 'file',
      };
      if (inserted.source) {
        logData.source = inserted.source;
      }
      this.logsGateway.broadcastLog(logData);

      // Process for issue detection (errors and warnings)
      if (['error', 'warn'].includes(inserted.level)) {
        try {
          const issueId = await this.issuesService.processLogEntry(inserted);
          if (issueId) {
            const issue = await this.issuesService.findOne(issueId);
            if (issue) {
              if (issue.occurrenceCount === 1) {
                this.issuesGateway.broadcastNewIssue(issue);
              } else {
                this.issuesGateway.broadcastIssueUpdate(issue);
              }
            }
          }
        } catch (err) {
          this.logger.warn(`Failed to process issue for log entry ${inserted.id}:`, err);
        }
      }

      return inserted;
    }

    return null;
  }

  /**
   * Generate a deduplication key for a log entry
   * Combines timestamp, level, source, and message hash for uniqueness
   */
  private generateDeduplicationKey(entry: ParsedLogEntry, _serverId: string): string {
    const messageHash = createHash('sha256')
      .update(entry.message.substring(0, 200))
      .digest('hex')
      .substring(0, 16);

    // Use second-precision timestamp for matching
    const timestampKey = entry.timestamp.toISOString().substring(0, 19);

    return `${timestampKey}:${entry.level}:${entry.source ?? ''}:${messageHash}`;
  }

  /**
   * Restart file ingestion for a server (e.g., after config change)
   */
  async restartServerFileIngestion(serverId: string, providers: Map<string, MediaServerProvider>) {
    await this.stopServerFileIngestion(serverId);

    const [server] = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.id, serverId));

    if (server && server.isEnabled && server.fileIngestionEnabled) {
      await this.startServerFileIngestion(server, providers);
    }
  }

  /**
   * Get status of file ingestion
   */
  getStatus() {
    return {
      isStarted: this.isStarted,
      activeTailers: this.tailers.size,
      tailers: Array.from(this.tailers.keys()),
    };
  }

  /**
   * Validate log paths for a server
   */
  async validateLogPaths(paths: string[]): Promise<{
    valid: boolean;
    results: Array<{
      path: string;
      accessible: boolean;
      error?: string;
      files?: string[];
    }>;
  }> {
    const results = await Promise.all(
      paths.map(async (path) => ({
        path,
        ...(await this.fileDiscoveryService.validatePath(path)),
      }))
    );

    return {
      valid: results.every((r) => r.accessible),
      results,
    };
  }

  /**
   * Backfill logs from files for a server
   * Reads all log files from the beginning and ingests them
   */
  async backfillFromFiles(
    serverId: string,
    providers: Map<string, MediaServerProvider>,
    progressCallback?: (progress: {
      status: 'started' | 'progress' | 'completed' | 'error';
      totalFiles: number;
      processedFiles: number;
      totalLines: number;
      processedLines: number;
      entriesIngested: number;
      currentFile?: string;
      error?: string;
    }) => void
  ): Promise<{
    processedFiles: number;
    processedLines: number;
    entriesIngested: number;
  }> {
    const [server] = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.id, serverId));

    if (!server || !server.fileIngestionEnabled || !server.logPaths?.length) {
      throw new Error('Server not found or file ingestion not enabled');
    }

    const provider = providers.get(server.providerId);
    if (!provider) {
      throw new Error(`Provider ${server.providerId} not found`);
    }

    // Check if provider supports file-based log ingestion
    if (!hasFileIngestionSupport(provider)) {
      throw new Error(`Provider ${server.providerId} does not support file-based log ingestion`);
    }

    const logFileConfig = provider.getLogFileConfig();
    const patterns = server.logFilePatterns?.length
      ? [...server.logFilePatterns]
      : [...logFileConfig.filePatterns];

    // Discover all log files
    const logFiles = await this.fileDiscoveryService.discoverLogFiles(
      [...server.logPaths],
      patterns
    );

    if (logFiles.length === 0) {
      progressCallback?.({
        status: 'completed',
        totalFiles: 0,
        processedFiles: 0,
        totalLines: 0,
        processedLines: 0,
        entriesIngested: 0,
      });
      return { processedFiles: 0, processedLines: 0, entriesIngested: 0 };
    }

    this.logger.log(`Backfilling ${logFiles.length} log files for server ${server.name}`);

    progressCallback?.({
      status: 'started',
      totalFiles: logFiles.length,
      processedFiles: 0,
      totalLines: 0,
      processedLines: 0,
      entriesIngested: 0,
    });

    let totalProcessedFiles = 0;
    let totalProcessedLines = 0;
    let totalEntriesIngested = 0;

    // Process each file
    for (const filePath of logFiles) {
      try {
        const result = await this.backfillSingleFile(
          serverId,
          filePath,
          provider,
          (lineProgress) => {
            progressCallback?.({
              status: 'progress',
              totalFiles: logFiles.length,
              processedFiles: totalProcessedFiles,
              totalLines: lineProgress.totalLines,
              processedLines: totalProcessedLines + lineProgress.processedLines,
              entriesIngested: totalEntriesIngested + lineProgress.entriesIngested,
              currentFile: filePath,
            });
          }
        );

        totalProcessedFiles++;
        totalProcessedLines += result.processedLines;
        totalEntriesIngested += result.entriesIngested;

        this.logger.log(
          `Backfilled ${filePath}: ${result.processedLines} lines, ${result.entriesIngested} entries`
        );
      } catch (error) {
        this.logger.error(`Error backfilling ${filePath}:`, error);
        progressCallback?.({
          status: 'error',
          totalFiles: logFiles.length,
          processedFiles: totalProcessedFiles,
          totalLines: 0,
          processedLines: totalProcessedLines,
          entriesIngested: totalEntriesIngested,
          currentFile: filePath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    progressCallback?.({
      status: 'completed',
      totalFiles: logFiles.length,
      processedFiles: totalProcessedFiles,
      totalLines: totalProcessedLines,
      processedLines: totalProcessedLines,
      entriesIngested: totalEntriesIngested,
    });

    return {
      processedFiles: totalProcessedFiles,
      processedLines: totalProcessedLines,
      entriesIngested: totalEntriesIngested,
    };
  }

  /**
   * Backfill a single log file
   */
  private async backfillSingleFile(
    serverId: string,
    filePath: string,
    provider: MediaServerProvider,
    progressCallback?: (progress: {
      totalLines: number;
      processedLines: number;
      entriesIngested: number;
    }) => void
  ): Promise<{
    processedLines: number;
    entriesIngested: number;
  }> {
    const { createReadStream } = await import('fs');
    const { createInterface } = await import('readline');

    const processor = new LogFileProcessor(provider);
    processor.setFilePath(filePath);

    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    let lineNumber = 0;
    let entriesIngested = 0;
    let parseFailures = 0;
    const BATCH_SIZE = 100;
    const BATCH_REPORT_SIZE = 1000;

    // Collect entries in batches for more efficient processing
    const pendingEntries: Array<{ entry: ParsedLogEntry; lineNum: number }> = [];

    for await (const line of rl) {
      lineNumber++;

      const result = processor.processLine(line, lineNumber);
      if (result) {
        pendingEntries.push({ entry: result, lineNum: lineNumber });
      } else if (lineNumber <= 5) {
        // Log first few failures for debugging
        this.logger.debug(`Line ${lineNumber} not parsed: ${line.substring(0, 80)}...`);
        parseFailures++;
      } else {
        parseFailures++;
      }

      // Process in batches
      if (pendingEntries.length >= BATCH_SIZE) {
        for (const { entry } of pendingEntries) {
          const inserted = await this.processEntry(serverId, entry, filePath);
          if (inserted) {
            entriesIngested++;
          }
        }
        pendingEntries.length = 0;
      }

      if (lineNumber % BATCH_REPORT_SIZE === 0) {
        progressCallback?.({
          totalLines: lineNumber,
          processedLines: lineNumber,
          entriesIngested,
        });
      }
    }

    // Process remaining entries
    for (const { entry } of pendingEntries) {
      const inserted = await this.processEntry(serverId, entry, filePath);
      if (inserted) {
        entriesIngested++;
      }
    }

    // Flush any pending entry from processor
    const pending = processor.flush();
    if (pending) {
      const inserted = await this.processEntry(serverId, pending, filePath);
      if (inserted) {
        entriesIngested++;
      }
    }

    this.logger.log(
      `Backfill complete for ${filePath}: ${lineNumber} lines, ${pendingEntries.length} parsed, ${entriesIngested} ingested, ${parseFailures} parse failures`
    );
    return { processedLines: lineNumber, entriesIngested };
  }
}
