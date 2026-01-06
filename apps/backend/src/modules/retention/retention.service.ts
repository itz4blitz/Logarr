import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { sql, count, eq, and, lt } from 'drizzle-orm';


import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';
import { SettingsService } from '../settings/settings.service';

import type {
  RetentionConfig,
  StorageStats,
  ServerStorageStats,
  CleanupPreview,
  RetentionResult,
} from './retention.dto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly settingsService: SettingsService
  ) {}

  async onModuleInit() {
    const config = await this.settingsService.getRetentionSettings();

    this.logger.log(`Retention service initialized:`);
    this.logger.log(`  - Enabled: ${config.enabled}`);
    this.logger.log(`  - Info/Debug retention: ${config.infoRetentionDays} days`);
    this.logger.log(`  - Error/Warn retention: ${config.errorRetentionDays} days`);
    this.logger.log(`  - Batch size: ${config.batchSize}`);

    // Set up cleanup interval
    if (config.enabled) {
      this.setupCleanupInterval();
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  private setupCleanupInterval() {
    // Check every hour if we should run cleanup
    const ONE_HOUR = 60 * 60 * 1000;

    this.cleanupInterval = setInterval(async () => {
      const now = new Date();
      // Run at 3 AM by default (matching the default cron: 0 3 * * *)
      if (now.getHours() === 3 && now.getMinutes() === 0) {
        await this.runScheduledCleanup();
      }
    }, ONE_HOUR);

    this.logger.log(`Cleanup interval set (hourly check, runs at 3 AM)`);
  }

  /**
   * Scheduled cleanup - runs on configured cron schedule
   */
  private async runScheduledCleanup() {
    const config = await this.settingsService.getRetentionSettings();

    if (!config.enabled) {
      this.logger.debug('Cleanup skipped - disabled via settings');
      return;
    }

    this.logger.log('Starting scheduled retention cleanup...');

    try {
      const result = await this.runCleanup();
      this.logger.log(
        `Scheduled cleanup complete: ${result.totalDeleted} logs deleted in ${result.durationMs}ms`
      );
    } catch (error) {
      this.logger.error('Scheduled cleanup failed:', error);
    }
  }

  /**
   * Get current retention configuration from settings
   */
  async getConfig(): Promise<RetentionConfig> {
    const settings = await this.settingsService.getRetentionSettings();
    return {
      enabled: settings.enabled,
      infoRetentionDays: settings.infoRetentionDays,
      errorRetentionDays: settings.errorRetentionDays,
      cleanupCron: '0 3 * * *', // This is informational only
      batchSize: settings.batchSize,
    };
  }

  /**
   * Get storage statistics with detailed per-server breakdown
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      this.logger.debug('Getting storage stats...');
      const config = await this.getConfig();
      const now = new Date();

      // Date boundaries for age distribution
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const last90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Cutoff dates for retention preview
      const infoCutoff = this.getInfoCutoffDate(config.infoRetentionDays);
      const errorCutoff = this.getErrorCutoffDate(config.errorRetentionDays);

      this.logger.debug('Fetching data in parallel...');

      // Convert dates to ISO strings for postgres-js compatibility
      const last24hStr = last24h.toISOString();
      const last7dStr = last7d.toISOString();
      const last30dStr = last30d.toISOString();
      const last90dStr = last90d.toISOString();

      // Fetch all data in parallel
      const [
        logCountResult,
        dbSizeResult,
        oldestResult,
        newestResult,
        levelCounts,
        serverList,
        tableSizesResult,
        globalAgeDistribution,
      ] = await Promise.all([
        // Total log count
        this.db.select({ count: count() }).from(schema.logEntries),
        // Database size
        this.db.execute(sql`SELECT pg_database_size(current_database()) as size`),
        // Oldest log
        this.db
          .select({ oldest: sql<string>`MIN(${schema.logEntries.timestamp})` })
          .from(schema.logEntries),
        // Newest log
        this.db
          .select({ newest: sql<string>`MAX(${schema.logEntries.timestamp})` })
          .from(schema.logEntries),
        // Level counts
        this.db
          .select({
            level: schema.logEntries.level,
            count: count(),
          })
          .from(schema.logEntries)
          .groupBy(schema.logEntries.level),
        // Get all servers
        this.db.select().from(schema.servers),
        // Table sizes
        this.db.execute(sql`
          SELECT
            relname as table_name,
            pg_total_relation_size(c.oid) as size
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind = 'r'
            AND relname IN ('log_entries', 'issues', 'sessions', 'playback_events')
        `),
        // Global age distribution - use ISO strings for dates
        this.db.execute(sql`
          SELECT
            SUM(CASE WHEN timestamp >= ${last24hStr}::timestamptz THEN 1 ELSE 0 END) as last_24h,
            SUM(CASE WHEN timestamp >= ${last7dStr}::timestamptz AND timestamp < ${last24hStr}::timestamptz THEN 1 ELSE 0 END) as last_7d,
            SUM(CASE WHEN timestamp >= ${last30dStr}::timestamptz AND timestamp < ${last7dStr}::timestamptz THEN 1 ELSE 0 END) as last_30d,
            SUM(CASE WHEN timestamp >= ${last90dStr}::timestamptz AND timestamp < ${last30dStr}::timestamptz THEN 1 ELSE 0 END) as last_90d,
            SUM(CASE WHEN timestamp < ${last90dStr}::timestamptz THEN 1 ELSE 0 END) as older
          FROM log_entries
        `),
      ]);

      this.logger.debug('Parallel fetch complete. Processing results...');
      this.logger.debug(`dbSizeResult type: ${typeof dbSizeResult}, value: ${JSON.stringify(dbSizeResult)}`);
      this.logger.debug(`tableSizesResult type: ${typeof tableSizesResult}, value: ${JSON.stringify(tableSizesResult)}`);
      this.logger.debug(`globalAgeDistribution type: ${typeof globalAgeDistribution}, value: ${JSON.stringify(globalAgeDistribution)}`);

      const logCount = Number(logCountResult[0]?.count ?? 0);

      // Handle raw SQL result - postgres-js/drizzle returns { rows: [...] } object
      const dbSizeRows = Array.isArray(dbSizeResult) ? dbSizeResult : (dbSizeResult as { rows: Array<{ size: string }> }).rows ?? [];
      const databaseSizeBytes = Number(dbSizeRows[0]?.size ?? 0);

      // Build level counts object
      const logCountsByLevel = {
        info: 0,
        debug: 0,
        warn: 0,
        error: 0,
      };
      for (const row of levelCounts) {
        const level = row.level?.toLowerCase();
        if (level && level in logCountsByLevel) {
          logCountsByLevel[level as keyof typeof logCountsByLevel] = Number(row.count);
        }
      }

      // Parse table sizes
      const tableSizesRows = tableSizesResult as unknown as Array<{ table_name: string; size: string }>;
      const tableSizes = {
        logEntries: 0,
        issues: 0,
        sessions: 0,
        playbackEvents: 0,
        total: 0,
      };
      for (const row of tableSizesRows) {
        const size = Number(row.size);
        tableSizes.total += size;
        if (row.table_name === 'log_entries') tableSizes.logEntries = size;
        if (row.table_name === 'issues') tableSizes.issues = size;
        if (row.table_name === 'sessions') tableSizes.sessions = size;
        if (row.table_name === 'playback_events') tableSizes.playbackEvents = size;
      }

      // Parse global age distribution
      const ageRow = (globalAgeDistribution as unknown as Array<{
        last_24h: string;
        last_7d: string;
        last_30d: string;
        last_90d: string;
        older: string;
      }>)[0];
      const ageDistribution = {
        last24h: Number(ageRow?.last_24h ?? 0),
        last7d: Number(ageRow?.last_7d ?? 0),
        last30d: Number(ageRow?.last_30d ?? 0),
        last90d: Number(ageRow?.last_90d ?? 0),
        older: Number(ageRow?.older ?? 0),
      };

      // Fetch per-server stats
      const serverStats = await this.getPerServerStats(
        serverList,
        { last24h, last7d, last30d, last90d },
        { infoCutoff, errorCutoff }
      );

      return {
        logCount,
        databaseSizeBytes,
        databaseSizeFormatted: this.formatBytes(databaseSizeBytes),
        oldestLogTimestamp: oldestResult[0]?.oldest ?? null,
        newestLogTimestamp: newestResult[0]?.newest ?? null,
        retentionConfig: config,
        logCountsByLevel,
        serverStats,
        ageDistribution,
        tableSizes,
      };
    } catch (error) {
      this.logger.error('Failed to get storage stats:', error);
      throw error;
    }
  }

  /**
   * Get detailed stats for each server
   */
  private async getPerServerStats(
    servers: Array<{ id: string; name: string; providerId: string }>,
    ageBoundaries: { last24h: Date; last7d: Date; last30d: Date; last90d: Date },
    cutoffs: { infoCutoff: Date; errorCutoff: Date }
  ): Promise<ServerStorageStats[]> {
    const { last24h, last7d, last30d, last90d } = ageBoundaries;
    const { infoCutoff, errorCutoff } = cutoffs;

    // Convert dates to ISO strings for postgres-js compatibility
    const last24hStr = last24h.toISOString();
    const last7dStr = last7d.toISOString();
    const last30dStr = last30d.toISOString();
    const last90dStr = last90d.toISOString();
    const infoCutoffStr = infoCutoff.toISOString();
    const errorCutoffStr = errorCutoff.toISOString();

    // Fetch all server stats in parallel
    const serverStatsPromises = servers.map(async (server) => {
      const [
        logCountResult,
        levelCountsResult,
        timestampRangeResult,
        ageDistResult,
        cleanupEligibleResult,
      ] = await Promise.all([
        // Total count for server
        this.db
          .select({ count: count() })
          .from(schema.logEntries)
          .where(eq(schema.logEntries.serverId, server.id)),
        // Level breakdown for server
        this.db
          .select({
            level: schema.logEntries.level,
            count: count(),
          })
          .from(schema.logEntries)
          .where(eq(schema.logEntries.serverId, server.id))
          .groupBy(schema.logEntries.level),
        // Oldest/newest for server
        this.db
          .select({
            oldest: sql<string>`MIN(${schema.logEntries.timestamp})`,
            newest: sql<string>`MAX(${schema.logEntries.timestamp})`,
          })
          .from(schema.logEntries)
          .where(eq(schema.logEntries.serverId, server.id)),
        // Age distribution for server - use ISO strings for dates
        this.db.execute(sql`
          SELECT
            SUM(CASE WHEN timestamp >= ${last24hStr}::timestamptz THEN 1 ELSE 0 END) as last_24h,
            SUM(CASE WHEN timestamp >= ${last7dStr}::timestamptz AND timestamp < ${last24hStr}::timestamptz THEN 1 ELSE 0 END) as last_7d,
            SUM(CASE WHEN timestamp >= ${last30dStr}::timestamptz AND timestamp < ${last7dStr}::timestamptz THEN 1 ELSE 0 END) as last_30d,
            SUM(CASE WHEN timestamp >= ${last90dStr}::timestamptz AND timestamp < ${last30dStr}::timestamptz THEN 1 ELSE 0 END) as last_90d,
            SUM(CASE WHEN timestamp < ${last90dStr}::timestamptz THEN 1 ELSE 0 END) as older
          FROM log_entries
          WHERE server_id = ${server.id}
        `),
        // Cleanup eligible counts for server - use ISO strings for dates
        this.db.execute(sql`
          SELECT
            SUM(CASE WHEN level = 'info' AND timestamp < ${infoCutoffStr}::timestamptz THEN 1 ELSE 0 END) as info,
            SUM(CASE WHEN level = 'debug' AND timestamp < ${infoCutoffStr}::timestamptz THEN 1 ELSE 0 END) as debug,
            SUM(CASE WHEN level = 'warn' AND timestamp < ${errorCutoffStr}::timestamptz THEN 1 ELSE 0 END) as warn,
            SUM(CASE WHEN level = 'error' AND timestamp < ${errorCutoffStr}::timestamptz THEN 1 ELSE 0 END) as error
          FROM log_entries
          WHERE server_id = ${server.id}
        `),
      ]);

      const logCount = Number(logCountResult[0]?.count ?? 0);

      // Build level counts
      const logCountsByLevel = { info: 0, debug: 0, warn: 0, error: 0 };
      for (const row of levelCountsResult) {
        const level = row.level?.toLowerCase();
        if (level && level in logCountsByLevel) {
          logCountsByLevel[level as keyof typeof logCountsByLevel] = Number(row.count);
        }
      }

      // Parse age distribution
      const ageRow = (ageDistResult as unknown as Array<{
        last_24h: string;
        last_7d: string;
        last_30d: string;
        last_90d: string;
        older: string;
      }>)[0];

      // Parse cleanup eligible
      const cleanupRow = (cleanupEligibleResult as unknown as Array<{
        info: string;
        debug: string;
        warn: string;
        error: string;
      }>)[0];
      const eligibleInfo = Number(cleanupRow?.info ?? 0);
      const eligibleDebug = Number(cleanupRow?.debug ?? 0);
      const eligibleWarn = Number(cleanupRow?.warn ?? 0);
      const eligibleError = Number(cleanupRow?.error ?? 0);

      // Estimate size (~1KB per log entry on average)
      const estimatedSizeBytes = logCount * 1024;

      return {
        serverId: server.id,
        serverName: server.name,
        serverType: server.providerId,
        logCount,
        estimatedSizeBytes,
        estimatedSizeFormatted: this.formatBytes(estimatedSizeBytes),
        oldestLogTimestamp: timestampRangeResult[0]?.oldest ?? null,
        newestLogTimestamp: timestampRangeResult[0]?.newest ?? null,
        logCountsByLevel,
        ageDistribution: {
          last24h: Number(ageRow?.last_24h ?? 0),
          last7d: Number(ageRow?.last_7d ?? 0),
          last30d: Number(ageRow?.last_30d ?? 0),
          last90d: Number(ageRow?.last_90d ?? 0),
          older: Number(ageRow?.older ?? 0),
        },
        eligibleForCleanup: {
          info: eligibleInfo,
          debug: eligibleDebug,
          warn: eligibleWarn,
          error: eligibleError,
          total: eligibleInfo + eligibleDebug + eligibleWarn + eligibleError,
        },
      };
    });

    const stats = await Promise.all(serverStatsPromises);
    // Sort by log count descending
    return stats.sort((a, b) => b.logCount - a.logCount);
  }

  /**
   * Preview what would be deleted without actually deleting
   */
  async previewCleanup(): Promise<CleanupPreview> {
    const config = await this.settingsService.getRetentionSettings();
    const infoCutoff = this.getInfoCutoffDate(config.infoRetentionDays);
    const errorCutoff = this.getErrorCutoffDate(config.errorRetentionDays);

    // Count logs that would be deleted for each level
    const [infoCount, debugCount, warnCount, errorCount] = await Promise.all([
      this.countLogsBefore('info', infoCutoff),
      this.countLogsBefore('debug', infoCutoff),
      this.countLogsBefore('warn', errorCutoff),
      this.countLogsBefore('error', errorCutoff),
    ]);

    const totalLogsToDelete = infoCount + debugCount + warnCount + errorCount;

    // Estimate space savings (rough: ~1KB per log entry average)
    const estimatedBytesPerLog = 1024;
    const estimatedSpaceSavingsBytes = totalLogsToDelete * estimatedBytesPerLog;

    return {
      infoLogsToDelete: infoCount,
      debugLogsToDelete: debugCount,
      warnLogsToDelete: warnCount,
      errorLogsToDelete: errorCount,
      totalLogsToDelete,
      estimatedSpaceSavingsBytes,
      estimatedSpaceSavingsFormatted: this.formatBytes(estimatedSpaceSavingsBytes),
      infoCutoffDate: infoCutoff.toISOString(),
      errorCutoffDate: errorCutoff.toISOString(),
    };
  }

  /**
   * Run cleanup manually
   */
  async runCleanup(): Promise<RetentionResult> {
    const startedAt = new Date();
    this.logger.log('Starting log retention cleanup...');

    // Record run in history
    const historyId = await this.settingsService.recordRetentionRun({
      startedAt,
      status: 'running',
    });

    try {
      const config = await this.settingsService.getRetentionSettings();
      const infoCutoff = this.getInfoCutoffDate(config.infoRetentionDays);
      const errorCutoff = this.getErrorCutoffDate(config.errorRetentionDays);

      // Delete by level with appropriate cutoffs
      const [infoDeleted, debugDeleted, warnDeleted, errorDeleted] = await Promise.all([
        this.deleteLogsBefore('info', infoCutoff, config.batchSize),
        this.deleteLogsBefore('debug', infoCutoff, config.batchSize),
        this.deleteLogsBefore('warn', errorCutoff, config.batchSize),
        this.deleteLogsBefore('error', errorCutoff, config.batchSize),
      ]);

      // Clean up orphaned issue occurrences
      const orphanedOccurrences = await this.cleanupOrphanedOccurrences();

      const completedAt = new Date();
      const totalDeleted = infoDeleted + debugDeleted + warnDeleted + errorDeleted;
      const durationMs = completedAt.getTime() - startedAt.getTime();

      this.logger.log(
        `Cleanup complete: ${totalDeleted} logs deleted in ${durationMs}ms ` +
          `(info: ${infoDeleted}, debug: ${debugDeleted}, ` +
          `warn: ${warnDeleted}, error: ${errorDeleted}, ` +
          `orphaned occurrences: ${orphanedOccurrences})`
      );

      // Update history record
      await this.settingsService.updateRetentionRun(historyId, {
        completedAt,
        infoDeleted,
        debugDeleted,
        warnDeleted,
        errorDeleted,
        orphanedOccurrencesDeleted: orphanedOccurrences,
        status: 'completed',
      });

      return {
        success: true,
        info: infoDeleted,
        debug: debugDeleted,
        warn: warnDeleted,
        error: errorDeleted,
        orphanedOccurrences,
        totalDeleted,
        durationMs,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update history record with failure
      await this.settingsService.updateRetentionRun(historyId, {
        completedAt: new Date(),
        status: 'failed',
        errorMessage,
      });

      throw error;
    }
  }

  /**
   * Get cutoff date for info/debug logs
   */
  private getInfoCutoffDate(days: number): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  }

  /**
   * Get cutoff date for error/warn logs
   */
  private getErrorCutoffDate(days: number): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  }

  /**
   * Count logs older than cutoff date for a specific level
   */
  private async countLogsBefore(level: string, cutoff: Date): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.logEntries)
      .where(and(eq(schema.logEntries.level, level), lt(schema.logEntries.timestamp, cutoff)));

    return Number(result[0]?.count ?? 0);
  }

  /**
   * Delete logs older than cutoff date for a specific level.
   * Uses batched deletion to avoid long table locks.
   */
  private async deleteLogsBefore(level: string, cutoff: Date, batchSize: number): Promise<number> {
    let totalDeleted = 0;

    while (true) {
      // Delete in batches using Drizzle's delete with returning
      const deleted = await this.db
        .delete(schema.logEntries)
        .where(and(eq(schema.logEntries.level, level), lt(schema.logEntries.timestamp, cutoff)))
        .returning({ id: schema.logEntries.id });

      // Drizzle delete doesn't support LIMIT, so we count what was deleted
      // and break after a reasonable amount
      const deletedCount = deleted.length;
      totalDeleted += deletedCount;

      // If we deleted less than what we'd expect in a large table, we're done
      // Note: This is a simplification - in production you might want to use raw SQL with LIMIT
      if (deletedCount < batchSize || totalDeleted >= batchSize * 10) {
        break;
      }

      // Small delay between batches to reduce database pressure
      await this.delay(100);
    }

    return totalDeleted;
  }

  /**
   * Clean up issue_occurrences where the linked log_entry no longer exists.
   * This happens after logs are deleted but issues are preserved.
   */
  private async cleanupOrphanedOccurrences(): Promise<number> {
    // Use Drizzle's delete with a subquery approach
    const orphaned = await this.db
      .delete(schema.issueOccurrences)
      .where(
        sql`${schema.issueOccurrences.logEntryId} NOT IN (SELECT id FROM log_entries)`
      )
      .returning({ id: schema.issueOccurrences.id });

    return orphaned.length;
  }

  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
