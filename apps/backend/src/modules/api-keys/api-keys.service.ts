import { randomBytes, pbkdf2Sync } from 'crypto';

import { Inject, Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

interface CreateApiKeyDto {
  name: string;
  deviceInfo?: string;
  rateLimit?: number;
  rateLimitTtl?: number;
  scopes?: string[];
  expiresAt?: Date;
  notes?: string;
}

interface UpdateApiKeyDto {
  name?: string;
  isEnabled?: boolean;
  rateLimit?: number;
  rateLimitTtl?: number;
  scopes?: string[];
  expiresAt?: Date;
  notes?: string;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  /**
   * Generate a new API key
   * Returns the plain text key (only shown once) and stores the hash
   */
  async createApiKey(
    dto: CreateApiKeyDto
  ): Promise<{ key: string; apiKey: typeof schema.apiKeys.$inferSelect }> {
    this.logger.log(`Creating API key: ${dto.name}`);

    // Generate a random 32-byte key and encode as hex
    const key = randomBytes(32).toString('hex');
    const keyPrefix = `lk_${key.substring(0, 8)}`; // lk_ = Logarr Key

    // Hash the key for storage
    const keyHash = this.hashKey(key);

    try {
      const result = await this.db
        .insert(schema.apiKeys)
        .values({
          name: dto.name,
          keyHash,
          deviceInfo: dto.deviceInfo,
          isEnabled: true,
          rateLimit: dto.rateLimit,
          rateLimitTtl: dto.rateLimitTtl,
          scopes: dto.scopes ?? [],
          expiresAt: dto.expiresAt,
          notes: dto.notes,
        })
        .returning();

      const apiKey = result[0];

      if (!apiKey) {
        throw new Error('Failed to create API key');
      }

      this.logger.log(`API key created: ${apiKey.id} (${keyPrefix})`);

      return {
        key: `${keyPrefix}_${key}`, // Full key with prefix
        apiKey,
      };
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') {
        throw new ConflictException('API key hash collision. Please try again.');
      }
      throw error;
    }
  }

  /**
   * Validate an API key and return the key record if valid
   */
  async validateApiKey(key: string): Promise<typeof schema.apiKeys.$inferSelect | null> {
    if (key === undefined || key === null || key === '') {
      return null;
    }

    // Extract key from format: lk_<prefix>_<key>
    const keyParts = key.split('_');
    if (keyParts.length < 3 || keyParts[0] !== 'lk') {
      this.logger.warn(`Invalid API key format`);
      return null;
    }

    // The actual key is everything after the second underscore
    // Format: lk_<8-char prefix>_<actual key>
    const actualKey = keyParts.slice(2).join('_');
    const keyHash = this.hashKey(actualKey);

    this.logger.debug(`Validating API key with hash: ${keyHash.substring(0, 10)}...`);

    try {
      const result = await this.db
        .select()
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.keyHash, keyHash))
        .limit(1);

      const apiKey = result[0];

      if (!apiKey) {
        return null;
      }

      // Check if key is enabled
      if (!apiKey.isEnabled) {
        this.logger.warn(`API key is disabled: ${apiKey.id}`);
        return null;
      }

      // Check if key has expired
      if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
        this.logger.warn(`API key has expired: ${apiKey.id}`);
        return null;
      }

      return apiKey;
    } catch (error) {
      this.logger.error(
        `Error validating API key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  /**
   * Get all API keys
   */
  async getAllApiKeys(): Promise<(typeof schema.apiKeys.$inferSelect)[]> {
    const result = await this.db.select().from(schema.apiKeys).orderBy(schema.apiKeys.createdAt);

    return result;
  }

  /**
   * Get API key by ID
   */
  async getApiKeyById(id: string): Promise<typeof schema.apiKeys.$inferSelect> {
    const result = await this.db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, id))
      .limit(1);

    const apiKey = result[0];

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    return apiKey;
  }

  /**
   * Update API key
   */
  async updateApiKey(
    id: string,
    dto: UpdateApiKeyDto
  ): Promise<typeof schema.apiKeys.$inferSelect> {
    await this.getApiKeyById(id);

    const result = await this.db
      .update(schema.apiKeys)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(schema.apiKeys.id, id))
      .returning();

    const apiKey = result[0];

    if (!apiKey) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    return apiKey;
  }

  /**
   * Delete API key
   */
  async deleteApiKey(id: string): Promise<void> {
    await this.getApiKeyById(id);

    await this.db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id));

    this.logger.log(`API key deleted: ${id}`);
  }

  /**
   * Update last used timestamp and request count
   */
  async updateLastUsed(id: string, ipAddress: string): Promise<void> {
    await this.db
      .update(schema.apiKeys)
      .set({
        lastUsedAt: new Date(),
        lastUsedIp: ipAddress,
        requestCount: sql`${schema.apiKeys.requestCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.apiKeys.id, id));
  }

  /**
   * Log API key usage
   */
  async logUsage(
    keyId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    responseTime: number,
    success: boolean,
    errorMessage?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await this.db.insert(schema.apiKeyUsageLog).values({
        keyId,
        endpoint,
        method,
        statusCode,
        responseTime,
        success,
        errorMessage,
        ipAddress,
        userAgent,
      });
    } catch (error) {
      // Don't throw errors from logging to avoid breaking requests
      this.logger.error(
        `Failed to log API key usage: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get usage statistics for an API key
   */
  async getUsageStats(
    keyId: string,
    days: number = 30
  ): Promise<{
    totalRequests: number;
    successRate: number;
    avgResponseTime: number;
    errorCount: number;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        success: sql<number>`sum(case when success then 1 else 0 end)::int`,
        avgResponseTime: sql<number>`avg(response_time)::int`,
        errors: sql<number>`sum(case when not success then 1 else 0 end)::int`,
      })
      .from(schema.apiKeyUsageLog)
      .where(
        and(
          eq(schema.apiKeyUsageLog.keyId, keyId),
          sql`${schema.apiKeyUsageLog.timestamp} >= ${since}`
        )
      );

    const stats = result[0] ?? { total: 0, success: 0, avgResponseTime: 0, errors: 0 };

    return {
      totalRequests: stats.total,
      successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0,
      avgResponseTime: stats.avgResponseTime,
      errorCount: stats.errors,
    };
  }

  /**
   * Get audit logs for an API key
   */
  async getAuditLogs(
    keyId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<(typeof schema.apiKeyUsageLog.$inferSelect)[]> {
    const result = await this.db
      .select()
      .from(schema.apiKeyUsageLog)
      .where(eq(schema.apiKeyUsageLog.keyId, keyId))
      .orderBy(schema.apiKeyUsageLog.timestamp)
      .limit(limit)
      .offset(offset);

    return result;
  }

  /**
   * Hash an API key using PBKDF2 for computational resistance
   * Uses a fixed salt so the same key always maps to the same hash for lookup
   */
  private hashKey(key: string): string {
    const iterations = 100_000;
    const keyLength = 32; // 256-bit derived key
    const digest = 'sha256';
    const salt = 'logarr-api-key-hash-v1';

    return pbkdf2Sync(key, salt, iterations, keyLength, digest).toString('hex');
  }
}
