import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, count, desc } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// Settings keys
export const SETTINGS_KEYS = {
  RETENTION_ENABLED: 'retention.enabled',
  RETENTION_INFO_DAYS: 'retention.info_days',
  RETENTION_ERROR_DAYS: 'retention.error_days',
  RETENTION_BATCH_SIZE: 'retention.batch_size',
} as const;

// Retention configuration interface
export interface RetentionSettings {
  enabled: boolean;
  infoRetentionDays: number;
  errorRetentionDays: number;
  batchSize: number;
}

// General app settings interface
export interface AppSettings {
  aiEnabled: boolean;
  autoAnalyzeIssues: boolean;
  issueRetentionDays: number;
  logRetentionDays: number;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly configService: ConfigService
  ) {}

  /**
   * Get a setting value from database, with env var fallback
   */
  private async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const result = await this.db
        .select({ value: schema.appSettings.value })
        .from(schema.appSettings)
        .where(eq(schema.appSettings.key, key))
        .limit(1);

      if (result.length > 0 && result[0]?.value !== null && result[0]?.value !== undefined) {
        return result[0].value as T;
      }
    } catch {
      this.logger.debug(`Failed to get setting ${key} from DB, using default`);
    }
    return defaultValue;
  }

  /**
   * Set a setting value in the database
   */
  private async setSetting<T>(key: string, value: T): Promise<void> {
    await this.db
      .insert(schema.appSettings)
      .values({
        key,
        value: value as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: {
          value: value as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get retention settings - database values with env var fallbacks
   */
  async getRetentionSettings(): Promise<RetentionSettings> {
    // Environment variables as fallbacks
    const envEnabled = this.configService.get('LOG_CLEANUP_ENABLED', 'true') !== 'false';
    const envInfoDays = parseInt(this.configService.get('LOG_RETENTION_DAYS', '30'), 10);
    const envErrorDays = parseInt(this.configService.get('LOG_RETENTION_ERROR_DAYS', '90'), 10);
    const envBatchSize = parseInt(this.configService.get('LOG_CLEANUP_BATCH_SIZE', '10000'), 10);

    // Database values take precedence over env vars
    const [enabled, infoRetentionDays, errorRetentionDays, batchSize] = await Promise.all([
      this.getSetting(SETTINGS_KEYS.RETENTION_ENABLED, envEnabled),
      this.getSetting(SETTINGS_KEYS.RETENTION_INFO_DAYS, envInfoDays),
      this.getSetting(SETTINGS_KEYS.RETENTION_ERROR_DAYS, envErrorDays),
      this.getSetting(SETTINGS_KEYS.RETENTION_BATCH_SIZE, envBatchSize),
    ]);

    return {
      enabled,
      infoRetentionDays,
      errorRetentionDays,
      batchSize,
    };
  }

  /**
   * Update retention settings in the database
   */
  async updateRetentionSettings(settings: Partial<RetentionSettings>): Promise<RetentionSettings> {
    const updates: Promise<void>[] = [];

    if (settings.enabled !== undefined) {
      updates.push(this.setSetting(SETTINGS_KEYS.RETENTION_ENABLED, settings.enabled));
    }
    if (settings.infoRetentionDays !== undefined) {
      updates.push(this.setSetting(SETTINGS_KEYS.RETENTION_INFO_DAYS, settings.infoRetentionDays));
    }
    if (settings.errorRetentionDays !== undefined) {
      updates.push(this.setSetting(SETTINGS_KEYS.RETENTION_ERROR_DAYS, settings.errorRetentionDays));
    }
    if (settings.batchSize !== undefined) {
      updates.push(this.setSetting(SETTINGS_KEYS.RETENTION_BATCH_SIZE, settings.batchSize));
    }

    await Promise.all(updates);

    // Return updated settings
    return this.getRetentionSettings();
  }

  /**
   * Get retention history
   */
  async getRetentionHistory(limit = 20): Promise<Array<{
    id: string;
    startedAt: Date;
    completedAt: Date | null;
    infoDeleted: number;
    debugDeleted: number;
    warnDeleted: number;
    errorDeleted: number;
    orphanedOccurrencesDeleted: number;
    totalDeleted: number;
    status: string;
    errorMessage: string | null;
  }>> {
    const results = await this.db
      .select()
      .from(schema.retentionHistory)
      .orderBy(desc(schema.retentionHistory.startedAt))
      .limit(limit);

    return results.map(r => ({
      id: r.id,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      infoDeleted: r.infoDeleted,
      debugDeleted: r.debugDeleted,
      warnDeleted: r.warnDeleted,
      errorDeleted: r.errorDeleted,
      orphanedOccurrencesDeleted: r.orphanedOccurrencesDeleted,
      totalDeleted: r.infoDeleted + r.debugDeleted + r.warnDeleted + r.errorDeleted,
      status: r.status,
      errorMessage: r.errorMessage,
    }));
  }

  /**
   * Record a retention run in history
   */
  async recordRetentionRun(data: {
    startedAt: Date;
    completedAt?: Date;
    infoDeleted?: number;
    debugDeleted?: number;
    warnDeleted?: number;
    errorDeleted?: number;
    orphanedOccurrencesDeleted?: number;
    status: 'running' | 'completed' | 'failed';
    errorMessage?: string;
  }): Promise<string> {
    const result = await this.db
      .insert(schema.retentionHistory)
      .values({
        startedAt: data.startedAt,
        completedAt: data.completedAt || null,
        infoDeleted: data.infoDeleted || 0,
        debugDeleted: data.debugDeleted || 0,
        warnDeleted: data.warnDeleted || 0,
        errorDeleted: data.errorDeleted || 0,
        orphanedOccurrencesDeleted: data.orphanedOccurrencesDeleted || 0,
        status: data.status,
        errorMessage: data.errorMessage || null,
      })
      .returning({ id: schema.retentionHistory.id });

    return result[0]?.id ?? '';
  }

  /**
   * Update a retention history record
   */
  async updateRetentionRun(id: string, data: {
    completedAt?: Date;
    infoDeleted?: number;
    debugDeleted?: number;
    warnDeleted?: number;
    errorDeleted?: number;
    orphanedOccurrencesDeleted?: number;
    status?: 'running' | 'completed' | 'failed';
    errorMessage?: string;
  }): Promise<void> {
    await this.db
      .update(schema.retentionHistory)
      .set({
        completedAt: data.completedAt,
        infoDeleted: data.infoDeleted,
        debugDeleted: data.debugDeleted,
        warnDeleted: data.warnDeleted,
        errorDeleted: data.errorDeleted,
        orphanedOccurrencesDeleted: data.orphanedOccurrencesDeleted,
        status: data.status,
        errorMessage: data.errorMessage,
      })
      .where(eq(schema.retentionHistory.id, id));
  }

  /**
   * Get general app settings
   * For now, these are hardcoded defaults. Can be extended to store in DB.
   */
  getAppSettings(): AppSettings {
    return {
      aiEnabled: true,
      autoAnalyzeIssues: false,
      issueRetentionDays: 90,
      logRetentionDays: 30,
    };
  }

  /**
   * Get system info for settings page
   */
  async getSystemInfo(): Promise<{
    version: string;
    dbConnected: boolean;
    serverCount: number;
    logCount: number;
    issueCount: number;
  }> {
    try {
      const [serverCountResult, logCountResult, issueCountResult] = await Promise.all([
        this.db.select({ count: count() }).from(schema.servers),
        this.db.select({ count: count() }).from(schema.logEntries),
        this.db.select({ count: count() }).from(schema.issues),
      ]);

      return {
        version: '0.1.0',
        dbConnected: true,
        serverCount: Number(serverCountResult[0]?.count ?? 0),
        logCount: Number(logCountResult[0]?.count ?? 0),
        issueCount: Number(issueCountResult[0]?.count ?? 0),
      };
    } catch {
      return {
        version: '0.1.0',
        dbConnected: false,
        serverCount: 0,
        logCount: 0,
        issueCount: 0,
      };
    }
  }
}
