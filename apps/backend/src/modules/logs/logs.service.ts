import { Injectable, Inject } from '@nestjs/common';
import { and, eq, gte, lte, inArray, sql, desc, count } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import type { LogSearchDto } from './logs.dto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

@Injectable()
export class LogsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  // Normalize query param to array (handles single value or array)
  private toArray(value: string | string[] | undefined): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  private buildConditions(params: LogSearchDto) {
    const conditions = [];

    if (params.serverId) {
      conditions.push(eq(schema.logEntries.serverId, params.serverId));
    }

    const levels = this.toArray(params.levels);
    if (levels.length > 0) {
      conditions.push(inArray(schema.logEntries.level, levels));
    }

    const sources = this.toArray(params.sources);
    if (sources.length > 0) {
      conditions.push(inArray(schema.logEntries.source, sources));
    }

    const logSources = this.toArray(params.logSources) as ('api' | 'file')[];
    if (logSources.length > 0) {
      conditions.push(inArray(schema.logEntries.logSource, logSources));
    }

    if (params.sessionId) {
      conditions.push(eq(schema.logEntries.sessionId, params.sessionId));
    }

    if (params.userId) {
      conditions.push(eq(schema.logEntries.userId, params.userId));
    }

    if (params.startDate) {
      conditions.push(gte(schema.logEntries.timestamp, new Date(params.startDate)));
    }

    if (params.endDate) {
      conditions.push(lte(schema.logEntries.timestamp, new Date(params.endDate)));
    }

    if (params.search) {
      conditions.push(sql`${schema.logEntries.message} ILIKE ${'%' + params.search + '%'}`);
    }

    return conditions;
  }

  async search(params: LogSearchDto) {
    const conditions = this.buildConditions(params);
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const limit = Math.min(params.limit ?? 100, 1000);
    const offset = params.offset ?? 0;

    // Get total count for pagination
    const [countResult] = await this.db
      .select({ total: count() })
      .from(schema.logEntries)
      .where(whereClause);

    const total = Number(countResult?.total ?? 0);

    const data = await this.db
      .select()
      .from(schema.logEntries)
      .where(whereClause)
      .orderBy(desc(schema.logEntries.timestamp))
      .limit(limit)
      .offset(offset);

    return {
      data,
      total,
      limit,
      offset,
    };
  }

  async findOne(id: string) {
    const result = await this.db
      .select()
      .from(schema.logEntries)
      .where(eq(schema.logEntries.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  async getStats(serverId?: string) {
    const baseCondition = serverId ? eq(schema.logEntries.serverId, serverId) : undefined;

    // Get total counts by level
    const levelCounts = await this.db
      .select({
        level: schema.logEntries.level,
        count: count(),
      })
      .from(schema.logEntries)
      .where(baseCondition)
      .groupBy(schema.logEntries.level);

    const countByLevel: Record<string, number> = {};
    let totalCount = 0;

    for (const row of levelCounts) {
      countByLevel[row.level] = Number(row.count);
      totalCount += Number(row.count);
    }

    // Get top sources
    const topSources = await this.db
      .select({
        source: schema.logEntries.source,
        count: count(),
      })
      .from(schema.logEntries)
      .where(baseCondition)
      .groupBy(schema.logEntries.source)
      .orderBy(desc(count()))
      .limit(10);

    // Get top errors (most frequent error messages)
    const topErrors = await this.db
      .select({
        message: schema.logEntries.message,
        count: count(),
        lastOccurrence: sql<Date>`MAX(${schema.logEntries.timestamp})`,
      })
      .from(schema.logEntries)
      .where(
        baseCondition
          ? and(baseCondition, eq(schema.logEntries.level, 'error'))
          : eq(schema.logEntries.level, 'error')
      )
      .groupBy(schema.logEntries.message)
      .orderBy(desc(count()))
      .limit(10);

    const errorCount = countByLevel['error'] ?? 0;

    return {
      totalCount,
      errorCount,
      warnCount: countByLevel['warn'] ?? 0,
      infoCount: countByLevel['info'] ?? 0,
      debugCount: countByLevel['debug'] ?? 0,
      errorRate: totalCount > 0 ? errorCount / totalCount : 0,
      topSources: topSources.map((s) => ({
        source: s.source ?? 'Unknown',
        count: Number(s.count),
      })),
      topErrors: topErrors.map((e) => ({
        message: e.message,
        count: Number(e.count),
        lastOccurrence: e.lastOccurrence,
      })),
    };
  }

  async getSources(serverId?: string) {
    const condition = serverId ? eq(schema.logEntries.serverId, serverId) : undefined;

    const sources = await this.db
      .selectDistinct({ source: schema.logEntries.source })
      .from(schema.logEntries)
      .where(condition);

    return sources.map((s) => s.source).filter((s): s is string => s !== null);
  }

  async getLogWithRelations(id: string) {
    // Get the log entry with server info
    const logResult = await this.db
      .select({
        id: schema.logEntries.id,
        serverId: schema.logEntries.serverId,
        timestamp: schema.logEntries.timestamp,
        level: schema.logEntries.level,
        message: schema.logEntries.message,
        source: schema.logEntries.source,
        threadId: schema.logEntries.threadId,
        raw: schema.logEntries.raw,
        sessionId: schema.logEntries.sessionId,
        userId: schema.logEntries.userId,
        deviceId: schema.logEntries.deviceId,
        itemId: schema.logEntries.itemId,
        playSessionId: schema.logEntries.playSessionId,
        metadata: schema.logEntries.metadata,
        exception: schema.logEntries.exception,
        stackTrace: schema.logEntries.stackTrace,
        logSource: schema.logEntries.logSource,
        logFilePath: schema.logEntries.logFilePath,
        createdAt: schema.logEntries.createdAt,
        serverName: schema.servers.name,
        serverProviderId: schema.servers.providerId,
        serverUrl: schema.servers.url,
      })
      .from(schema.logEntries)
      .leftJoin(schema.servers, eq(schema.logEntries.serverId, schema.servers.id))
      .where(eq(schema.logEntries.id, id))
      .limit(1);

    if (logResult.length === 0) {
      return null;
    }

    const log = logResult[0];

    // Find related issue via issueOccurrences
    const relatedIssue = await this.db
      .select({
        id: schema.issues.id,
        title: schema.issues.title,
        severity: schema.issues.severity,
        status: schema.issues.status,
        source: schema.issues.source,
        occurrenceCount: schema.issues.occurrenceCount,
      })
      .from(schema.issueOccurrences)
      .innerJoin(schema.issues, eq(schema.issueOccurrences.issueId, schema.issues.id))
      .where(eq(schema.issueOccurrences.logEntryId, id))
      .limit(1);

    return {
      ...log,
      relatedIssue: relatedIssue[0] || null,
    };
  }
}
