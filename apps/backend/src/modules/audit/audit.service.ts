import { Injectable, Logger, Inject } from '@nestjs/common';
import { eq, and, desc, sql } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

export interface CreateAuditLogDto {
  userId?: string;
  sessionId?: string;
  action:
    | 'create'
    | 'update'
    | 'delete'
    | 'read'
    | 'login'
    | 'logout'
    | 'error'
    | 'export'
    | 'import'
    | 'sync'
    | 'test'
    | 'other';
  category:
    | 'auth'
    | 'server'
    | 'log_entry'
    | 'session'
    | 'playback'
    | 'issue'
    | 'ai_analysis'
    | 'api_key'
    | 'settings'
    | 'retention'
    | 'proxy'
    | 'other';
  entityType: string;
  entityId?: string;
  description: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  success: boolean;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  apiKeyId?: string;
}

export interface AuditLogFilters {
  userId?: string;
  action?: string;
  category?: string;
  entityType?: string;
  entityId?: string;
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  /**
   * Create an audit log entry
   */
  async createLog(dto: CreateAuditLogDto): Promise<void> {
    try {
      await this.db.insert(schema.auditLog).values({
        userId: dto.userId,
        sessionId: dto.sessionId,
        action: dto.action,
        category: dto.category,
        entityType: dto.entityType,
        entityId: dto.entityId,
        description: dto.description,
        endpoint: dto.endpoint,
        method: dto.method,
        statusCode: dto.statusCode,
        responseTime: dto.responseTime,
        success: dto.success,
        errorMessage: dto.errorMessage,
        ipAddress: dto.ipAddress,
        userAgent: dto.userAgent,
        metadata: dto.metadata,
        apiKeyId: dto.apiKeyId,
      });

      this.logger.debug(`Audit log created: ${dto.action} ${dto.category}/${dto.entityType}`);
    } catch (error) {
      // Don't throw errors from audit logging to avoid breaking requests
      this.logger.error(
        `Failed to create audit log: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get audit logs with filters
   */
  async getLogs(filters: AuditLogFilters = {}): Promise<(typeof schema.auditLog.$inferSelect)[]> {
    const conditions = [];

    if (filters.userId !== undefined && filters.userId !== null && filters.userId !== '') {
      conditions.push(eq(schema.auditLog.userId, filters.userId));
    }

    if (filters.action !== undefined && filters.action !== null && filters.action !== '') {
      conditions.push(eq(schema.auditLog.action, filters.action as any));
    }

    if (filters.category !== undefined && filters.category !== null && filters.category !== '') {
      conditions.push(eq(schema.auditLog.category, filters.category as any));
    }

    if (
      filters.entityType !== undefined &&
      filters.entityType !== null &&
      filters.entityType !== ''
    ) {
      conditions.push(eq(schema.auditLog.entityType, filters.entityType));
    }

    if (filters.entityId !== undefined && filters.entityId !== null && filters.entityId !== '') {
      conditions.push(eq(schema.auditLog.entityId, filters.entityId));
    }

    if (filters.success !== undefined) {
      conditions.push(eq(schema.auditLog.success, filters.success));
    }

    if (filters.startDate) {
      conditions.push(sql`${schema.auditLog.timestamp} >= ${filters.startDate}`);
    }

    if (filters.endDate) {
      conditions.push(sql`${schema.auditLog.timestamp} <= ${filters.endDate}`);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const result = await this.db
      .select()
      .from(schema.auditLog)
      .where(where)
      .orderBy(desc(schema.auditLog.timestamp))
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0);

    return result;
  }

  /**
   * Get audit log statistics
   */
  async getStatistics(days: number = 30): Promise<{
    totalLogs: number;
    successCount: number;
    errorCount: number;
    byCategory: Record<string, number>;
    byAction: Record<string, number>;
    byUser: Array<{ userId: string; count: number }>;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString();

    const result = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        success: sql<number>`sum(case when success then 1 else 0 end)::int`,
        errors: sql<number>`sum(case when not success then 1 else 0 end)::int`,
      })
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.timestamp} >= ${sinceStr}`);

    const stats = result[0] ?? { total: 0, success: 0, errors: 0 };

    // Get stats by category
    const byCategoryResult = await this.db
      .select({
        category: schema.auditLog.category,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.timestamp} >= ${sinceStr}`)
      .groupBy(schema.auditLog.category);

    const byCategory: Record<string, number> = {};
    byCategoryResult.forEach((row) => {
      byCategory[row.category] = row.count;
    });

    // Get stats by action
    const byActionResult = await this.db
      .select({
        action: schema.auditLog.action,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.auditLog)
      .where(sql`${schema.auditLog.timestamp} >= ${sinceStr}`)
      .groupBy(schema.auditLog.action);

    const byAction: Record<string, number> = {};
    byActionResult.forEach((row) => {
      byAction[row.action] = row.count;
    });

    // Get top users
    const byUserResult = await this.db
      .select({
        userId: schema.auditLog.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.auditLog)
      .where(
        and(
          sql`${schema.auditLog.timestamp} >= ${sinceStr}`,
          sql`${schema.auditLog.userId} IS NOT NULL`
        )
      )
      .groupBy(schema.auditLog.userId)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return {
      totalLogs: stats.total,
      successCount: stats.success,
      errorCount: stats.errors,
      byCategory,
      byAction,
      byUser: byUserResult.map((row) => ({ userId: row.userId ?? 'unknown', count: row.count })),
    };
  }

  /**
   * Get recent activity for a specific user
   */
  async getUserActivity(
    userId: string,
    limit: number = 50
  ): Promise<(typeof schema.auditLog.$inferSelect)[]> {
    return this.getLogs({ userId, limit });
  }

  /**
   * Get recent activity for a specific entity
   */
  async getEntityActivity(
    entityType: string,
    entityId: string,
    limit: number = 50
  ): Promise<(typeof schema.auditLog.$inferSelect)[]> {
    return this.getLogs({ entityType, entityId, limit });
  }
}
