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
  // File ingestion settings
  FILE_INGESTION_MAX_CONCURRENT_TAILERS: 'file_ingestion.max_concurrent_tailers',
  FILE_INGESTION_MAX_FILE_AGE_DAYS: 'file_ingestion.max_file_age_days',
  FILE_INGESTION_TAILER_START_DELAY_MS: 'file_ingestion.tailer_start_delay_ms',
  // Security settings
  SECURITY_ADMIN_USERNAME: 'security.admin.username',
  SECURITY_ADMIN_PASSWORD_HASH: 'security.admin.password_hash',
  SECURITY_ADMIN_CREATED_AT: 'security.admin.created_at',
  SECURITY_SETUP_TOKEN: 'security.setup_token',
  SECURITY_SETUP_COMPLETED: 'security.setup_completed',
  SECURITY_JWT_SECRET: 'security.jwt_secret',
  SECURITY_JWT_EXPIRATION_MS: 'security.jwt_expiration_ms',
  SECURITY_SESSION_TIMEOUT_MS: 'security.session_timeout_ms',
} as const;

// Retention configuration interface
export interface RetentionSettings {
  enabled: boolean;
  infoRetentionDays: number;
  errorRetentionDays: number;
  batchSize: number;
}

// File ingestion configuration interface
export interface FileIngestionSettings {
  /** Maximum number of files to tail concurrently per server */
  maxConcurrentTailers: number;
  /** Only process files modified within the last N days on initial startup */
  maxFileAgeDays: number;
  /** Delay between starting each file tailer (ms) to spread out load */
  tailerStartDelayMs: number;
}

// Default file ingestion settings
export const FILE_INGESTION_DEFAULTS: FileIngestionSettings = {
  maxConcurrentTailers: 5,
  maxFileAgeDays: 7,
  tailerStartDelayMs: 500,
};

// Security configuration interface
export interface SecuritySettings {
  jwtExpirationMs: number;
  sessionTimeoutMs: number;
}

// Default security settings
export const SECURITY_DEFAULTS: SecuritySettings = {
  jwtExpirationMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
};

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
      updates.push(
        this.setSetting(SETTINGS_KEYS.RETENTION_ERROR_DAYS, settings.errorRetentionDays)
      );
    }
    if (settings.batchSize !== undefined) {
      updates.push(this.setSetting(SETTINGS_KEYS.RETENTION_BATCH_SIZE, settings.batchSize));
    }

    await Promise.all(updates);

    // Return updated settings
    return this.getRetentionSettings();
  }

  /**
   * Get file ingestion settings - database values with defaults
   */
  async getFileIngestionSettings(): Promise<FileIngestionSettings> {
    const [maxConcurrentTailers, maxFileAgeDays, tailerStartDelayMs] = await Promise.all([
      this.getSetting(
        SETTINGS_KEYS.FILE_INGESTION_MAX_CONCURRENT_TAILERS,
        FILE_INGESTION_DEFAULTS.maxConcurrentTailers
      ),
      this.getSetting(
        SETTINGS_KEYS.FILE_INGESTION_MAX_FILE_AGE_DAYS,
        FILE_INGESTION_DEFAULTS.maxFileAgeDays
      ),
      this.getSetting(
        SETTINGS_KEYS.FILE_INGESTION_TAILER_START_DELAY_MS,
        FILE_INGESTION_DEFAULTS.tailerStartDelayMs
      ),
    ]);

    return {
      maxConcurrentTailers,
      maxFileAgeDays,
      tailerStartDelayMs,
    };
  }

  /**
   * Update file ingestion settings in the database
   */
  async updateFileIngestionSettings(
    settings: Partial<FileIngestionSettings>
  ): Promise<FileIngestionSettings> {
    const updates: Promise<void>[] = [];

    if (settings.maxConcurrentTailers !== undefined) {
      // Validate range: 1-20
      const value = Math.max(1, Math.min(20, settings.maxConcurrentTailers));
      updates.push(this.setSetting(SETTINGS_KEYS.FILE_INGESTION_MAX_CONCURRENT_TAILERS, value));
    }
    if (settings.maxFileAgeDays !== undefined) {
      // Validate range: 1-365
      const value = Math.max(1, Math.min(365, settings.maxFileAgeDays));
      updates.push(this.setSetting(SETTINGS_KEYS.FILE_INGESTION_MAX_FILE_AGE_DAYS, value));
    }
    if (settings.tailerStartDelayMs !== undefined) {
      // Validate range: 0-5000
      const value = Math.max(0, Math.min(5000, settings.tailerStartDelayMs));
      updates.push(this.setSetting(SETTINGS_KEYS.FILE_INGESTION_TAILER_START_DELAY_MS, value));
    }

    await Promise.all(updates);

    // Return updated settings
    return this.getFileIngestionSettings();
  }

  /**
   * Get retention history
   */
  async getRetentionHistory(limit = 20): Promise<
    Array<{
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
    }>
  > {
    const results = await this.db
      .select()
      .from(schema.retentionHistory)
      .orderBy(desc(schema.retentionHistory.startedAt))
      .limit(limit);

    return results.map((r) => ({
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
  async updateRetentionRun(
    id: string,
    data: {
      completedAt?: Date;
      infoDeleted?: number;
      debugDeleted?: number;
      warnDeleted?: number;
      errorDeleted?: number;
      orphanedOccurrencesDeleted?: number;
      status?: 'running' | 'completed' | 'failed';
      errorMessage?: string;
    }
  ): Promise<void> {
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

  /**
   * Get security settings - database values with defaults
   */
  async getSecuritySettings(): Promise<SecuritySettings> {
    const [jwtExpirationMs, sessionTimeoutMs] = await Promise.all([
      this.getSetting(
        SETTINGS_KEYS.SECURITY_JWT_EXPIRATION_MS,
        SECURITY_DEFAULTS.jwtExpirationMs
      ),
      this.getSetting(
        SETTINGS_KEYS.SECURITY_SESSION_TIMEOUT_MS,
        SECURITY_DEFAULTS.sessionTimeoutMs
      ),
    ]);

    return {
      jwtExpirationMs,
      sessionTimeoutMs,
    };
  }

  /**
   * Update security settings in the database
   */
  async updateSecuritySettings(settings: Partial<SecuritySettings>): Promise<SecuritySettings> {
    const updates: Promise<void>[] = [];

    if (settings.jwtExpirationMs !== undefined) {
      // Validate range: 5 minutes to 30 days
      const value = Math.max(5 * 60 * 1000, Math.min(30 * 24 * 60 * 60 * 1000, settings.jwtExpirationMs));
      updates.push(this.setSetting(SETTINGS_KEYS.SECURITY_JWT_EXPIRATION_MS, value));
    }
    if (settings.sessionTimeoutMs !== undefined) {
      // Validate range: 1 minute to 24 hours
      const value = Math.max(60 * 1000, Math.min(24 * 60 * 60 * 1000, settings.sessionTimeoutMs));
      updates.push(this.setSetting(SETTINGS_KEYS.SECURITY_SESSION_TIMEOUT_MS, value));
    }

    await Promise.all(updates);

    // Return updated settings
    return this.getSecuritySettings();
  }

  /**
   * Get the JWT secret from database or generate a new one
   */
  async getOrCreateJwtSecret(): Promise<string> {
    const existingSecret = await this.getSetting<string | null>(SETTINGS_KEYS.SECURITY_JWT_SECRET, null);
    if (existingSecret) {
      return existingSecret;
    }

    // Generate a new secret
    const crypto = await import('node:crypto');
    const newSecret = crypto.randomBytes(64).toString('hex');
    await this.setSetting(SETTINGS_KEYS.SECURITY_JWT_SECRET, newSecret);
    this.logger.warn('Generated new JWT secret - keep this secure!');
    return newSecret;
  }

  /**
   * Check if setup has been completed
   */
  async isSetupCompleted(): Promise<boolean> {
    return this.getSetting(SETTINGS_KEYS.SECURITY_SETUP_COMPLETED, false);
  }

  /**
   * Get the stored setup token (for validation)
   */
  async getSetupToken(): Promise<string | null> {
    return this.getSetting<string | null>(SETTINGS_KEYS.SECURITY_SETUP_TOKEN, null);
  }

  /**
   * Store the setup token
   */
  async setSetupToken(token: string): Promise<void> {
    await this.setSetting(SETTINGS_KEYS.SECURITY_SETUP_TOKEN, token);
  }

  /**
   * Consume the setup token (remove it after use)
   */
  async consumeSetupToken(): Promise<void> {
    await this.db
      .delete(schema.appSettings)
      .where(eq(schema.appSettings.key, SETTINGS_KEYS.SECURITY_SETUP_TOKEN));
  }

  /**
   * Mark setup as completed
   */
  async markSetupCompleted(): Promise<void> {
    await this.setSetting(SETTINGS_KEYS.SECURITY_SETUP_COMPLETED, true);
  }

  /**
   * Get admin credentials (username and password hash)
   */
  async getAdminCredentials(): Promise<{ username: string | null; passwordHash: string | null }> {
    const [username, passwordHash] = await Promise.all([
      this.getSetting<string | null>(SETTINGS_KEYS.SECURITY_ADMIN_USERNAME, null),
      this.getSetting<string | null>(SETTINGS_KEYS.SECURITY_ADMIN_PASSWORD_HASH, null),
    ]);
    return { username, passwordHash };
  }

  /**
   * Set admin credentials
   */
  async setAdminCredentials(username: string, passwordHash: string): Promise<void> {
    await Promise.all([
      this.setSetting(SETTINGS_KEYS.SECURITY_ADMIN_USERNAME, username),
      this.setSetting(SETTINGS_KEYS.SECURITY_ADMIN_PASSWORD_HASH, passwordHash),
      this.setSetting(SETTINGS_KEYS.SECURITY_ADMIN_CREATED_AT, new Date().toISOString()),
    ]);
  }

  /**
   * Update admin password hash
   */
  async updateAdminPassword(passwordHash: string): Promise<void> {
    await this.setSetting(SETTINGS_KEYS.SECURITY_ADMIN_PASSWORD_HASH, passwordHash);
  }

  /**
   * Get admin account creation date
   */
  async getAdminCreatedAt(): Promise<string | null> {
    return this.getSetting<string | null>(SETTINGS_KEYS.SECURITY_ADMIN_CREATED_AT, null);
  }
}
