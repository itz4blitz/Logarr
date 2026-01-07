import * as crypto from 'crypto';

import { Injectable, Inject } from '@nestjs/common';
import { eq, and, gte, desc, asc, sql, count } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Context gathered for deep AI analysis of an issue
 */
export interface IssueAnalysisContext {
  // Core issue data
  issue: {
    id: string;
    title: string;
    source: string;
    severity: string;
    status: string;
    category: string | null;
    sampleMessage: string | null;
    exceptionType: string | null;
    firstSeen: Date;
    lastSeen: Date;
    occurrenceCount: number;
    affectedUsersCount: number;
    affectedSessionsCount: number;
    impactScore: number;
  };

  // Timeline patterns
  timeline: {
    hourly: { hour: string; count: number }[];
    daily: { date: string; count: number }[];
    trend: 'increasing' | 'decreasing' | 'stable' | 'sporadic';
    peakHours: number[];
    burstDetected: boolean;
  };

  // Affected users with real data
  affectedUsers: {
    userId: string;
    userName?: string;
    occurrenceCount: number;
    devices: string[];
    lastSeen: Date;
  }[];

  // Affected sessions with playback context
  affectedSessions: {
    sessionId: string;
    userName?: string;
    deviceName?: string;
    clientName?: string;
    playbackContext?: {
      itemName?: string;
      videoCodec?: string;
      audioCodec?: string;
      isTranscoding: boolean;
      transcodeReasons?: string[];
    };
  }[];

  // Stack traces (deduplicated by hash)
  stackTraces: {
    hash: string;
    trace: string;
    count: number;
  }[];

  // Server context
  server: {
    name: string;
    version?: string;
    providerId: string;
  };

  // Varied sample occurrences (not just first one)
  sampleOccurrences: {
    timestamp: Date;
    message: string;
    userId?: string;
    stackTrace?: string;
    metadata?: Record<string, unknown>;
  }[];
}

@Injectable()
export class IssueContextService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  /**
   * Gather full context for an issue to enable deep AI analysis
   */
  async gatherContext(issueId: string): Promise<IssueAnalysisContext> {
    // Fetch all data in parallel for performance
    const [issue, timeline, affectedUsers, affectedSessions, sampleOccurrences, server] =
      await Promise.all([
        this.getIssue(issueId),
        this.getTimeline(issueId),
        this.getAffectedUsers(issueId),
        this.getAffectedSessions(issueId),
        this.getSampleOccurrences(issueId, 10),
        this.getServerContext(issueId),
      ]);

    // Extract unique stack traces from occurrences
    const stackTraces = this.extractStackTraces(sampleOccurrences);

    // Analyze timeline patterns
    const timelinePatterns = this.analyzeTimelinePatterns(timeline.hourly, timeline.daily);

    return {
      issue,
      timeline: {
        hourly: timeline.hourly,
        daily: timeline.daily,
        ...timelinePatterns,
      },
      affectedUsers,
      affectedSessions,
      stackTraces,
      server,
      sampleOccurrences,
    };
  }

  /**
   * Get core issue data
   */
  private async getIssue(issueId: string) {
    const [issue] = await this.db
      .select({
        id: schema.issues.id,
        title: schema.issues.title,
        source: schema.issues.source,
        severity: schema.issues.severity,
        status: schema.issues.status,
        category: schema.issues.category,
        sampleMessage: schema.issues.sampleMessage,
        exceptionType: schema.issues.exceptionType,
        firstSeen: schema.issues.firstSeen,
        lastSeen: schema.issues.lastSeen,
        occurrenceCount: schema.issues.occurrenceCount,
        affectedUsersCount: schema.issues.affectedUsersCount,
        affectedSessionsCount: schema.issues.affectedSessionsCount,
        impactScore: schema.issues.impactScore,
      })
      .from(schema.issues)
      .where(eq(schema.issues.id, issueId))
      .limit(1);

    if (!issue) {
      throw new Error(`Issue with ID ${issueId} not found`);
    }

    return issue;
  }

  /**
   * Get timeline data (hourly and daily occurrence counts)
   */
  private async getTimeline(issueId: string) {
    // Get hourly counts for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const hourlyData = await this.db
      .select({
        hour: sql<string>`to_char(date_trunc('hour', ${schema.issueOccurrences.timestamp}), 'YYYY-MM-DD HH24:00')`,
        count: count(),
      })
      .from(schema.issueOccurrences)
      .where(
        and(
          eq(schema.issueOccurrences.issueId, issueId),
          gte(schema.issueOccurrences.timestamp, sevenDaysAgo)
        )
      )
      .groupBy(sql`date_trunc('hour', ${schema.issueOccurrences.timestamp})`)
      .orderBy(asc(sql`date_trunc('hour', ${schema.issueOccurrences.timestamp})`));

    // Get daily counts for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyData = await this.db
      .select({
        date: sql<string>`to_char(date_trunc('day', ${schema.issueOccurrences.timestamp}), 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(schema.issueOccurrences)
      .where(
        and(
          eq(schema.issueOccurrences.issueId, issueId),
          gte(schema.issueOccurrences.timestamp, thirtyDaysAgo)
        )
      )
      .groupBy(sql`date_trunc('day', ${schema.issueOccurrences.timestamp})`)
      .orderBy(asc(sql`date_trunc('day', ${schema.issueOccurrences.timestamp})`));

    return {
      hourly: hourlyData.map((d) => ({
        hour: d.hour,
        count: Number(d.count),
      })),
      daily: dailyData.map((d) => ({
        date: d.date,
        count: Number(d.count),
      })),
    };
  }

  /**
   * Analyze timeline patterns to detect trends, peaks, and bursts
   */
  private analyzeTimelinePatterns(
    hourly: { hour: string; count: number }[],
    daily: { date: string; count: number }[]
  ): {
    trend: 'increasing' | 'decreasing' | 'stable' | 'sporadic';
    peakHours: number[];
    burstDetected: boolean;
  } {
    // Detect trend from daily data
    let trend: 'increasing' | 'decreasing' | 'stable' | 'sporadic' = 'stable';

    if (daily.length >= 7) {
      const recentWeek = daily.slice(-7);
      const previousWeek = daily.slice(-14, -7);

      const recentSum = recentWeek.reduce((sum, d) => sum + d.count, 0);
      const previousSum = previousWeek.reduce((sum, d) => sum + d.count, 0);

      if (previousSum > 0) {
        const changePercent = ((recentSum - previousSum) / previousSum) * 100;
        if (changePercent > 20) trend = 'increasing';
        else if (changePercent < -20) trend = 'decreasing';
      }

      // Check for sporadic pattern (high variance)
      const counts = daily.map((d) => d.count);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev > avg * 1.5) {
        trend = 'sporadic';
      }
    }

    // Find peak hours from hourly data
    const hourCounts: Record<number, number> = {};
    for (const h of hourly) {
      const hour = parseInt(h.hour.split(' ')[1]?.split(':')[0] || '0', 10);
      hourCounts[hour] = (hourCounts[hour] || 0) + h.count;
    }

    const hourEntries = Object.entries(hourCounts).map(([hour, count]) => ({
      hour: parseInt(hour, 10),
      count,
    }));
    hourEntries.sort((a, b) => b.count - a.count);
    const peakHours = hourEntries.slice(0, 3).map((e) => e.hour);

    // Detect bursts (3+ occurrences in a single hour)
    const burstDetected = hourly.some((h) => h.count >= 3);

    return { trend, peakHours, burstDetected };
  }

  /**
   * Get affected users with their occurrence counts and devices
   * Optimized: Single query to get users with aggregated device arrays (eliminates N+1)
   */
  private async getAffectedUsers(issueId: string): Promise<IssueAnalysisContext['affectedUsers']> {
    // Single query: Get user occurrences with their devices in one go using array_agg
    const userOccurrences = await this.db
      .select({
        userId: schema.issueOccurrences.userId,
        count: count(),
        lastSeen: sql<Date>`max(${schema.issueOccurrences.timestamp})`,
        devices: sql<
          string[]
        >`array_agg(DISTINCT ${schema.logEntries.deviceId}) FILTER (WHERE ${schema.logEntries.deviceId} IS NOT NULL)`,
      })
      .from(schema.issueOccurrences)
      .innerJoin(schema.logEntries, eq(schema.issueOccurrences.logEntryId, schema.logEntries.id))
      .where(
        and(
          eq(schema.issueOccurrences.issueId, issueId),
          sql`${schema.issueOccurrences.userId} IS NOT NULL`
        )
      )
      .groupBy(schema.issueOccurrences.userId)
      .orderBy(desc(count()))
      .limit(10);

    return userOccurrences
      .filter((user) => user.userId !== null)
      .map((user) => ({
        userId: user.userId!,
        occurrenceCount: Number(user.count),
        devices: (user.devices || []).slice(0, 5), // Limit devices to 5
        lastSeen: user.lastSeen,
      }));
  }

  /**
   * Get affected sessions with playback context
   * Optimized: Single query with lateral join to get session + latest playback in one query
   */
  private async getAffectedSessions(
    issueId: string
  ): Promise<IssueAnalysisContext['affectedSessions']> {
    // Get unique session IDs from occurrences with session details and latest playback event
    // Using a subquery with DISTINCT ON to get the latest playback event per session
    const sessionsWithPlayback = await this.db
      .select({
        sessionId: schema.issueOccurrences.sessionId,
        userName: schema.sessions.userName,
        deviceName: schema.sessions.deviceName,
        clientName: schema.sessions.clientName,
        nowPlayingItemName: schema.sessions.nowPlayingItemName,
        videoCodec: schema.playbackEvents.videoCodec,
        audioCodec: schema.playbackEvents.audioCodec,
        isTranscoding: schema.playbackEvents.isTranscoding,
        transcodeReasons: schema.playbackEvents.transcodeReasons,
        playbackItemName: schema.playbackEvents.itemName,
      })
      .from(schema.issueOccurrences)
      .leftJoin(schema.sessions, eq(schema.sessions.externalId, schema.issueOccurrences.sessionId))
      .leftJoin(schema.playbackEvents, eq(schema.playbackEvents.sessionId, schema.sessions.id))
      .where(
        and(
          eq(schema.issueOccurrences.issueId, issueId),
          sql`${schema.issueOccurrences.sessionId} IS NOT NULL`
        )
      )
      .groupBy(
        schema.issueOccurrences.sessionId,
        schema.sessions.userName,
        schema.sessions.deviceName,
        schema.sessions.clientName,
        schema.sessions.nowPlayingItemName,
        schema.playbackEvents.videoCodec,
        schema.playbackEvents.audioCodec,
        schema.playbackEvents.isTranscoding,
        schema.playbackEvents.transcodeReasons,
        schema.playbackEvents.itemName,
        schema.playbackEvents.timestamp
      )
      .orderBy(desc(schema.playbackEvents.timestamp))
      .limit(10);

    // Deduplicate by sessionId (keeping the first occurrence which has latest playback due to ordering)
    const seenSessions = new Set<string>();
    const result: IssueAnalysisContext['affectedSessions'] = [];

    for (const row of sessionsWithPlayback) {
      if (!row.sessionId || seenSessions.has(row.sessionId)) continue;
      seenSessions.add(row.sessionId);

      const sessionEntry: IssueAnalysisContext['affectedSessions'][0] = {
        sessionId: row.sessionId,
      };

      if (row.userName) sessionEntry.userName = row.userName;
      if (row.deviceName) sessionEntry.deviceName = row.deviceName;
      if (row.clientName) sessionEntry.clientName = row.clientName;

      // Build playback context if we have any playback data
      if (row.isTranscoding !== null) {
        const ctx: NonNullable<IssueAnalysisContext['affectedSessions'][0]['playbackContext']> = {
          isTranscoding: row.isTranscoding,
        };
        const itemName = row.playbackItemName || row.nowPlayingItemName;
        if (itemName) ctx.itemName = itemName;
        if (row.videoCodec) ctx.videoCodec = row.videoCodec;
        if (row.audioCodec) ctx.audioCodec = row.audioCodec;
        if (row.transcodeReasons) ctx.transcodeReasons = row.transcodeReasons;
        sessionEntry.playbackContext = ctx;
      }

      result.push(sessionEntry);
    }

    return result;
  }

  /**
   * Get sample occurrences with varied messages
   */
  private async getSampleOccurrences(
    issueId: string,
    limit: number
  ): Promise<IssueAnalysisContext['sampleOccurrences']> {
    const occurrences = await this.db
      .select({
        timestamp: schema.issueOccurrences.timestamp,
        userId: schema.issueOccurrences.userId,
        message: schema.logEntries.message,
        stackTrace: schema.logEntries.stackTrace,
        metadata: schema.logEntries.metadata,
      })
      .from(schema.issueOccurrences)
      .innerJoin(schema.logEntries, eq(schema.issueOccurrences.logEntryId, schema.logEntries.id))
      .where(eq(schema.issueOccurrences.issueId, issueId))
      .orderBy(desc(schema.issueOccurrences.timestamp))
      .limit(limit);

    return occurrences.map((o) => {
      const entry: IssueAnalysisContext['sampleOccurrences'][0] = {
        timestamp: o.timestamp,
        message: o.message,
      };
      if (o.userId !== null && o.userId !== undefined) entry.userId = o.userId;
      if (o.stackTrace !== null && o.stackTrace !== undefined) entry.stackTrace = o.stackTrace;
      if (o.metadata !== null && o.metadata !== undefined)
        entry.metadata = o.metadata as Record<string, unknown>;
      return entry;
    });
  }

  /**
   * Get server context for the issue
   */
  private async getServerContext(issueId: string): Promise<IssueAnalysisContext['server']> {
    const [result] = await this.db
      .select({
        name: schema.servers.name,
        version: schema.servers.version,
        providerId: schema.servers.providerId,
      })
      .from(schema.issues)
      .innerJoin(schema.servers, eq(schema.issues.serverId, schema.servers.id))
      .where(eq(schema.issues.id, issueId))
      .limit(1);

    const server: IssueAnalysisContext['server'] = {
      name: result?.name ?? 'Unknown Server',
      providerId: result?.providerId ?? 'unknown',
    };
    if (result?.version !== null && result?.version !== undefined) server.version = result.version;
    return server;
  }

  /**
   * Extract unique stack traces from occurrences, deduplicated by hash
   */
  private extractStackTraces(
    occurrences: IssueAnalysisContext['sampleOccurrences']
  ): IssueAnalysisContext['stackTraces'] {
    const traceMap = new Map<string, { trace: string; count: number }>();

    for (const occ of occurrences) {
      if (!occ.stackTrace) continue;

      // Hash the stack trace for deduplication
      const hash = crypto
        .createHash('sha256')
        .update(occ.stackTrace)
        .digest('hex')
        .substring(0, 16);

      const existing = traceMap.get(hash);
      if (existing) {
        existing.count++;
      } else {
        traceMap.set(hash, { trace: occ.stackTrace, count: 1 });
      }
    }

    return Array.from(traceMap.entries()).map(([hash, data]) => ({
      hash,
      trace: data.trace,
      count: data.count,
    }));
  }
}
