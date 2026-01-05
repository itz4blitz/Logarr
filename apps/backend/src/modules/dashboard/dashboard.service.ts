import { Injectable, Inject } from '@nestjs/common';
import { eq, gte, sql, desc, count, inArray } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import type {
  DashboardDataDto,
  ActivityHourDto,
  HeatmapDayDto,
  TopIssueDto,
  SourceStatusDto,
  NowPlayingDto,
  RecentEventDto,
  TopLogSourceDto,
} from './dashboard.dto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  async getDashboardData(): Promise<DashboardDataDto> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Run all queries in parallel for performance
    const [
      servers,
      activeSessions,
      issueStats,
      activityChart,
      logDistribution,
      heatmapData,
      topIssues,
      recentIssues,
      dailyLogCounts,
      dailySessionCounts,
      dailyIssueCounts,
    ] = await Promise.all([
      this.getServers(),
      this.getActiveSessions(),
      this.getIssueStats(),
      this.getActivityChart(twentyFourHoursAgo),
      this.getLogDistribution(),
      this.getHeatmapData(sevenDaysAgo),
      this.getTopIssues(),
      this.getRecentIssues(),
      this.getDailyLogCounts(sevenDaysAgo),
      this.getDailySessionCounts(sevenDaysAgo),
      this.getDailyIssueCounts(sevenDaysAgo),
    ]);

    // Build sources with active stream counts
    const sessionsByServer = new Map<string, number>();
    for (const session of activeSessions) {
      const count = sessionsByServer.get(session.serverId) || 0;
      sessionsByServer.set(session.serverId, count + 1);
    }

    const sources: SourceStatusDto[] = servers.map((server) => ({
      id: server.id,
      name: server.name,
      providerId: server.providerId,
      isConnected: server.isConnected,
      lastSeen: server.lastSeen?.toISOString() || null,
      version: server.version,
      activeStreams: sessionsByServer.get(server.id) || 0,
      fileIngestionEnabled: server.fileIngestionEnabled,
      fileIngestionConnected: server.fileIngestionConnected,
    }));

    // Build now playing list
    const serverNameMap = new Map(servers.map((s) => [s.id, s.name]));
    const nowPlaying: NowPlayingDto[] = activeSessions.slice(0, 10).map((session) => ({
      id: session.id,
      userName: session.userName,
      nowPlayingItemName: session.nowPlayingItemName,
      nowPlayingItemType: session.nowPlayingItemType,
      deviceName: session.deviceName,
      clientName: session.clientName,
      progress: 0, // Would need playback events for accurate progress
      serverName: serverNameMap.get(session.serverId) || 'Unknown',
    }));

    // Calculate health status
    const onlineServers = servers.filter((s) => s.isConnected).length;
    const health = this.calculateHealth(
      onlineServers,
      servers.length,
      issueStats.critical,
      issueStats.high
    );

    // Calculate metrics with trends
    const todayLogs = dailyLogCounts[dailyLogCounts.length - 1] || 0;
    const avgLogs =
      dailyLogCounts.length > 0
        ? Math.round(dailyLogCounts.reduce((a, b) => a + b, 0) / dailyLogCounts.length)
        : 0;

    const todayErrors = activityChart.reduce((sum, h) => sum + h.error, 0);
    const todayTotal = activityChart.reduce(
      (sum, h) => sum + h.error + h.warn + h.info + h.debug,
      0
    );
    const currentErrorRate = todayTotal > 0 ? todayErrors / todayTotal : 0;

    // Calculate error rate trend (simplified - just show daily values scaled 0-100)
    const errorRateTrend = dailyLogCounts.map(() => Math.random() * 5); // Placeholder for actual calculation

    const logVolumeTrend = dailyLogCounts.slice(-7);
    const sessionTrend = dailySessionCounts.slice(-7);
    const issueTrend = dailyIssueCounts.slice(-7);

    // Build recent events
    const recentEvents: RecentEventDto[] = recentIssues.map((issue) => ({
      id: issue.id,
      type: issue.status === 'resolved' ? ('issue_resolved' as const) : ('issue_new' as const),
      title: issue.title,
      timestamp: issue.updatedAt.toISOString(),
      severity: issue.severity,
    }));

    return {
      health: {
        status: health,
        sources: { online: onlineServers, total: servers.length },
        issues: {
          critical: issueStats.critical,
          high: issueStats.high,
          open: issueStats.open,
        },
        activeStreams: activeSessions.length,
      },
      activityChart,
      activityHeatmap: heatmapData,
      logDistribution,
      metrics: {
        errorRate: {
          current: currentErrorRate,
          trend: errorRateTrend,
          change: 0, // Would calculate from previous period
        },
        logVolume: {
          today: todayLogs,
          average: avgLogs,
          trend: logVolumeTrend,
        },
        sessionCount: {
          today: dailySessionCounts[dailySessionCounts.length - 1] || 0,
          trend: sessionTrend,
        },
        issueCount: {
          open: issueStats.open,
          trend: issueTrend,
        },
      },
      topIssues,
      sources,
      nowPlaying,
      recentEvents,
    };
  }

  private calculateHealth(
    onlineServers: number,
    totalServers: number,
    criticalIssues: number,
    highIssues: number
  ): 'healthy' | 'warning' | 'critical' {
    if (criticalIssues > 0 || (totalServers > 0 && onlineServers === 0)) {
      return 'critical';
    }
    if (highIssues > 0 || (totalServers > 0 && onlineServers < totalServers)) {
      return 'warning';
    }
    return 'healthy';
  }

  private async getServers() {
    return this.db
      .select({
        id: schema.servers.id,
        name: schema.servers.name,
        providerId: schema.servers.providerId,
        isConnected: schema.servers.isConnected,
        lastSeen: schema.servers.lastSeen,
        version: schema.servers.version,
        fileIngestionEnabled: schema.servers.fileIngestionEnabled,
        fileIngestionConnected: schema.servers.fileIngestionConnected,
      })
      .from(schema.servers)
      .where(eq(schema.servers.isEnabled, true));
  }

  private async getActiveSessions() {
    return this.db
      .select({
        id: schema.sessions.id,
        serverId: schema.sessions.serverId,
        userName: schema.sessions.userName,
        nowPlayingItemName: schema.sessions.nowPlayingItemName,
        nowPlayingItemType: schema.sessions.nowPlayingItemType,
        deviceName: schema.sessions.deviceName,
        clientName: schema.sessions.clientName,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.isActive, true));
  }

  private async getIssueStats() {
    const results = await this.db
      .select({
        status: schema.issues.status,
        severity: schema.issues.severity,
        count: count(),
      })
      .from(schema.issues)
      .where(inArray(schema.issues.status, ['open', 'acknowledged', 'in_progress']))
      .groupBy(schema.issues.status, schema.issues.severity);

    let critical = 0;
    let high = 0;
    let open = 0;

    for (const row of results) {
      const cnt = Number(row.count);
      open += cnt;
      if (row.severity === 'critical') critical += cnt;
      if (row.severity === 'high') high += cnt;
    }

    return { critical, high, open };
  }

  private async getActivityChart(since: Date): Promise<ActivityHourDto[]> {
    const result = await this.db
      .select({
        hour: sql<string>`date_trunc('hour', ${schema.logEntries.timestamp})`,
        level: schema.logEntries.level,
        count: count(),
      })
      .from(schema.logEntries)
      .where(gte(schema.logEntries.timestamp, since))
      .groupBy(sql`date_trunc('hour', ${schema.logEntries.timestamp})`, schema.logEntries.level)
      .orderBy(sql`date_trunc('hour', ${schema.logEntries.timestamp})`);

    // Group by hour
    const hourMap = new Map<string, ActivityHourDto>();

    for (const row of result) {
      const hourKey = row.hour;
      if (!hourMap.has(hourKey)) {
        hourMap.set(hourKey, {
          hour: hourKey,
          error: 0,
          warn: 0,
          info: 0,
          debug: 0,
        });
      }
      const entry = hourMap.get(hourKey)!;
      const cnt = Number(row.count);

      if (row.level === 'error' || row.level === 'Error') entry.error += cnt;
      else if (row.level === 'warn' || row.level === 'Warning') entry.warn += cnt;
      else if (row.level === 'info' || row.level === 'Information') entry.info += cnt;
      else if (row.level === 'debug' || row.level === 'Debug') entry.debug += cnt;
    }

    return Array.from(hourMap.values());
  }

  private async getLogDistribution() {
    // Get level counts and top sources in parallel
    const [levelResults, sourceResults] = await Promise.all([
      this.db
        .select({
          level: schema.logEntries.level,
          count: count(),
        })
        .from(schema.logEntries)
        .groupBy(schema.logEntries.level),
      this.db
        .select({
          source: schema.logEntries.source,
          level: schema.logEntries.level,
          count: count(),
        })
        .from(schema.logEntries)
        .groupBy(schema.logEntries.source, schema.logEntries.level),
    ]);

    let error = 0,
      warn = 0,
      info = 0,
      debug = 0,
      total = 0;

    for (const row of levelResults) {
      const cnt = Number(row.count);
      total += cnt;

      const level = row.level?.toLowerCase() || '';
      if (level === 'error') error += cnt;
      else if (level === 'warn' || level === 'warning') warn += cnt;
      else if (level === 'info' || level === 'information') info += cnt;
      else if (level === 'debug') debug += cnt;
    }

    // Aggregate source data
    const sourceMap = new Map<string, { count: number; errorCount: number }>();
    for (const row of sourceResults) {
      const source = row.source || 'Unknown';
      const cnt = Number(row.count);
      const level = row.level?.toLowerCase() || '';

      if (!sourceMap.has(source)) {
        sourceMap.set(source, { count: 0, errorCount: 0 });
      }
      const data = sourceMap.get(source)!;
      data.count += cnt;
      if (level === 'error') {
        data.errorCount += cnt;
      }
    }

    // Sort by count and take top 10
    const topSources: TopLogSourceDto[] = Array.from(sourceMap.entries())
      .map(([source, data]) => ({ source, count: data.count, errorCount: data.errorCount }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return { error, warn, info, debug, total, topSources };
  }

  private async getHeatmapData(since: Date): Promise<HeatmapDayDto[]> {
    const result = await this.db
      .select({
        dayOfWeek: sql<number>`EXTRACT(DOW FROM ${schema.logEntries.timestamp})`,
        hour: sql<number>`EXTRACT(HOUR FROM ${schema.logEntries.timestamp})`,
        count: count(),
      })
      .from(schema.logEntries)
      .where(gte(schema.logEntries.timestamp, since))
      .groupBy(
        sql`EXTRACT(DOW FROM ${schema.logEntries.timestamp})`,
        sql`EXTRACT(HOUR FROM ${schema.logEntries.timestamp})`
      );

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const heatmap: HeatmapDayDto[] = days.map((day) => ({
      day,
      hours: Array(24).fill(0),
    }));

    // Find max for normalization
    let maxCount = 1;
    for (const row of result) {
      const cnt = Number(row.count);
      if (cnt > maxCount) maxCount = cnt;
    }

    // Fill in the data and normalize to 0-100
    for (const row of result) {
      const dayIndex = Number(row.dayOfWeek);
      const hourIndex = Number(row.hour);
      const normalized = Math.round((Number(row.count) / maxCount) * 100);
      if (heatmap[dayIndex] && hourIndex >= 0 && hourIndex < 24) {
        heatmap[dayIndex].hours[hourIndex] = normalized;
      }
    }

    return heatmap;
  }

  private async getTopIssues(): Promise<TopIssueDto[]> {
    const results = await this.db
      .select({
        id: schema.issues.id,
        title: schema.issues.title,
        severity: schema.issues.severity,
        occurrenceCount: schema.issues.occurrenceCount,
        impactScore: schema.issues.impactScore,
      })
      .from(schema.issues)
      .where(inArray(schema.issues.status, ['open', 'acknowledged', 'in_progress']))
      .orderBy(desc(schema.issues.impactScore))
      .limit(20);

    return results.map((r) => ({
      id: r.id,
      title: r.title,
      severity: r.severity,
      occurrenceCount: r.occurrenceCount,
      impactScore: r.impactScore,
    }));
  }

  private async getRecentIssues() {
    return this.db
      .select({
        id: schema.issues.id,
        title: schema.issues.title,
        severity: schema.issues.severity,
        status: schema.issues.status,
        updatedAt: schema.issues.updatedAt,
      })
      .from(schema.issues)
      .orderBy(desc(schema.issues.updatedAt))
      .limit(10);
  }

  private async getDailyLogCounts(since: Date): Promise<number[]> {
    const result = await this.db
      .select({
        day: sql<string>`date_trunc('day', ${schema.logEntries.timestamp})`,
        count: count(),
      })
      .from(schema.logEntries)
      .where(gte(schema.logEntries.timestamp, since))
      .groupBy(sql`date_trunc('day', ${schema.logEntries.timestamp})`)
      .orderBy(sql`date_trunc('day', ${schema.logEntries.timestamp})`);

    return result.map((r) => Number(r.count));
  }

  private async getDailySessionCounts(since: Date): Promise<number[]> {
    const result = await this.db
      .select({
        day: sql<string>`date_trunc('day', ${schema.sessions.startedAt})`,
        count: count(),
      })
      .from(schema.sessions)
      .where(gte(schema.sessions.startedAt, since))
      .groupBy(sql`date_trunc('day', ${schema.sessions.startedAt})`)
      .orderBy(sql`date_trunc('day', ${schema.sessions.startedAt})`);

    return result.map((r) => Number(r.count));
  }

  private async getDailyIssueCounts(since: Date): Promise<number[]> {
    const result = await this.db
      .select({
        day: sql<string>`date_trunc('day', ${schema.issues.createdAt})`,
        count: count(),
      })
      .from(schema.issues)
      .where(gte(schema.issues.createdAt, since))
      .groupBy(sql`date_trunc('day', ${schema.issues.createdAt})`)
      .orderBy(sql`date_trunc('day', ${schema.issues.createdAt})`);

    return result.map((r) => Number(r.count));
  }
}
