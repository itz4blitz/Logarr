import * as crypto from 'crypto';

import { Injectable, Inject, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { and, eq, gte, inArray, sql, desc, asc, count, avg } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';
import { AiProviderService } from '../settings/ai-provider.service';

import { AnalysisPromptBuilder } from './analysis-prompt-builder';
import { parseAnalysisResponse } from './analysis-response-parser';
import { IssueContextService, type IssueAnalysisContext } from './issue-context.service';

import type {
  AnalysisResult,
  FollowUpResult,
  ConversationMessage,
} from './analysis-response.types';
import type {
  IssueSearchDto,
  UpdateIssueDto,
  IssueStatsDto,
  MergeIssuesDto,
  IssueSeverity,
} from './issues.dto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Normalize a query parameter that should be an array.
 * NestJS returns a string when only one value is provided, and an array when multiple.
 */
function normalizeArrayParam<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly aiProviderService: AiProviderService,
    private readonly issueContextService: IssueContextService,
    private readonly analysisPromptBuilder: AnalysisPromptBuilder
  ) {}

  /**
   * Generate a fingerprint for an error message by normalizing it
   * This removes variable parts like IDs, timestamps, paths, etc.
   */
  generateFingerprint(message: string, source: string, exceptionType?: string): string {
    // Normalize the message by removing variable parts
    const normalized = message
      // Remove UUIDs
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
      // Remove numeric IDs
      .replace(/\b\d{5,}\b/g, '<ID>')
      // Remove file paths (Windows and Unix)
      .replace(/[A-Za-z]:\\[\w\\.-]+/g, '<PATH>')
      .replace(/\/[\w/.-]+/g, '<PATH>')
      // Remove IP addresses
      .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '<IP>')
      // Remove timestamps
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>')
      // Remove quoted strings (but keep error keywords)
      .replace(/"[^"]+"/g, '<STRING>')
      .replace(/'[^']+'/g, '<STRING>')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    // Create fingerprint from source + normalized message + exception type
    const input = `${source}:${exceptionType || ''}:${normalized}`;
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
  }

  /**
   * Extract a title from an error message
   */
  extractTitle(message: string, maxLength: number = 100): string {
    // Get first line or first sentence
    let title = (message.split('\n')[0] ?? '').split('.')[0]?.trim() ?? '';

    // Remove common prefixes
    title = title
      .replace(/^(error|exception|warning|failed|failure):\s*/i, '')
      .replace(/^An?\s+/i, '');

    // Truncate if too long
    if (title.length > maxLength) {
      title = title.substring(0, maxLength - 3) + '...';
    }

    return title || 'Unknown Error';
  }

  /**
   * Calculate impact score based on various factors
   */
  calculateImpactScore(
    severity: string,
    occurrenceCount: number,
    affectedUsersCount: number,
    affectedSessionsCount: number,
    hoursSinceLastSeen: number
  ): number {
    // Base score from severity (0-40)
    const severityScores: Record<string, number> = {
      critical: 40,
      high: 30,
      medium: 20,
      low: 10,
      info: 5,
    };
    let score = severityScores[severity] || 20;

    // Frequency factor (0-25) - logarithmic scale
    const frequencyScore = Math.min(25, Math.log10(occurrenceCount + 1) * 10);
    score += frequencyScore;

    // User impact (0-20)
    const userScore = Math.min(20, affectedUsersCount * 4);
    score += userScore;

    // Session impact (0-10)
    const sessionScore = Math.min(10, affectedSessionsCount * 2);
    score += sessionScore;

    // Recency factor (0-5) - more recent = higher score
    const recencyScore =
      hoursSinceLastSeen < 1 ? 5 : hoursSinceLastSeen < 24 ? 3 : hoursSinceLastSeen < 168 ? 1 : 0;
    score += recencyScore;

    return Math.min(100, Math.round(score));
  }

  /**
   * Detect and categorize an error from a log entry
   */
  categorizeError(message: string): { category: string; severity: IssueSeverity } {
    const lowerMessage = message.toLowerCase();

    // Authentication/Authorization issues
    if (
      lowerMessage.includes('auth') ||
      lowerMessage.includes('login') ||
      lowerMessage.includes('permission') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('access denied')
    ) {
      return { category: 'authentication', severity: 'high' as any };
    }

    // Database issues
    if (
      lowerMessage.includes('database') ||
      lowerMessage.includes('sql') ||
      lowerMessage.includes('connection refused') ||
      lowerMessage.includes('query failed')
    ) {
      return { category: 'database', severity: 'critical' as any };
    }

    // Network issues
    if (
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('connection') ||
      lowerMessage.includes('network') ||
      lowerMessage.includes('socket') ||
      lowerMessage.includes('dns') ||
      lowerMessage.includes('unreachable')
    ) {
      return { category: 'network', severity: 'high' as any };
    }

    // Transcoding issues
    if (
      lowerMessage.includes('transcode') ||
      lowerMessage.includes('ffmpeg') ||
      lowerMessage.includes('codec') ||
      lowerMessage.includes('encoding')
    ) {
      return { category: 'transcoding', severity: 'medium' as any };
    }

    // Playback issues
    if (
      lowerMessage.includes('playback') ||
      lowerMessage.includes('stream') ||
      lowerMessage.includes('buffer') ||
      lowerMessage.includes('media')
    ) {
      return { category: 'playback', severity: 'medium' as any };
    }

    // File system issues
    if (
      lowerMessage.includes('file not found') ||
      lowerMessage.includes('disk') ||
      lowerMessage.includes('storage') ||
      lowerMessage.includes('permission denied')
    ) {
      return { category: 'filesystem', severity: 'high' as any };
    }

    // Memory/performance issues
    if (
      lowerMessage.includes('memory') ||
      lowerMessage.includes('out of memory') ||
      lowerMessage.includes('performance') ||
      lowerMessage.includes('slow')
    ) {
      return { category: 'performance', severity: 'high' as any };
    }

    // Default
    return { category: 'general', severity: 'medium' as any };
  }

  /**
   * Process a log entry and create/update an issue
   */
  async processLogEntry(logEntry: typeof schema.logEntries.$inferSelect): Promise<string | null> {
    // Only process errors and warnings
    if (!['error', 'warn'].includes(logEntry.level)) {
      return null;
    }

    const fingerprint = this.generateFingerprint(
      logEntry.message,
      logEntry.source || 'unknown',
      logEntry.exception || undefined
    );

    // Check if issue already exists
    const existingIssue = await this.db
      .select()
      .from(schema.issues)
      .where(eq(schema.issues.fingerprint, fingerprint))
      .limit(1);

    if (existingIssue.length > 0) {
      // Update existing issue
      const issue = existingIssue[0]!;

      // Get unique affected users and sessions
      const affectedUsers = new Set<string>();
      const affectedSessions = new Set<string>();

      // Get all occurrences to count unique users/sessions
      const occurrences = await this.db
        .select({
          userId: schema.issueOccurrences.userId,
          sessionId: schema.issueOccurrences.sessionId,
        })
        .from(schema.issueOccurrences)
        .where(eq(schema.issueOccurrences.issueId, issue.id));

      occurrences.forEach((o) => {
        if (o.userId) affectedUsers.add(o.userId);
        if (o.sessionId) affectedSessions.add(o.sessionId);
      });

      if (logEntry.userId) affectedUsers.add(logEntry.userId);
      if (logEntry.sessionId) affectedSessions.add(logEntry.sessionId);

      const newImpactScore = this.calculateImpactScore(
        issue.severity,
        issue.occurrenceCount + 1,
        affectedUsers.size,
        affectedSessions.size,
        0 // Just happened - recency is 0 hours
      );

      // Update issue
      await this.db
        .update(schema.issues)
        .set({
          lastSeen: logEntry.timestamp,
          occurrenceCount: issue.occurrenceCount + 1,
          affectedUsersCount: affectedUsers.size,
          affectedSessionsCount: affectedSessions.size,
          impactScore: newImpactScore,
          updatedAt: new Date(),
        })
        .where(eq(schema.issues.id, issue.id));

      // Create occurrence
      await this.db
        .insert(schema.issueOccurrences)
        .values({
          issueId: issue.id,
          logEntryId: logEntry.id,
          timestamp: logEntry.timestamp,
          serverId: logEntry.serverId,
          userId: logEntry.userId,
          sessionId: logEntry.sessionId,
        })
        .onConflictDoNothing();

      return issue.id;
    } else {
      // Create new issue
      const { category, severity } = this.categorizeError(logEntry.message);
      const title = this.extractTitle(logEntry.message);

      // Map server provider to issue source
      const server = await this.db
        .select({ providerId: schema.servers.providerId })
        .from(schema.servers)
        .where(eq(schema.servers.id, logEntry.serverId))
        .limit(1);

      const sourceMap: Record<string, string> = {
        jellyfin: 'jellyfin',
        sonarr: 'sonarr',
        radarr: 'radarr',
        prowlarr: 'prowlarr',
      };
      const source = (sourceMap[server[0]?.providerId || ''] || 'system') as any;

      const impactScore = this.calculateImpactScore(
        severity,
        1,
        logEntry.userId ? 1 : 0,
        logEntry.sessionId ? 1 : 0,
        0
      );

      const [newIssue] = await this.db
        .insert(schema.issues)
        .values({
          fingerprint,
          title,
          source,
          severity,
          category,
          serverId: logEntry.serverId,
          errorPattern: this.generateFingerprint(logEntry.message, logEntry.source || 'unknown'),
          sampleMessage: logEntry.message,
          exceptionType: logEntry.exception,
          firstSeen: logEntry.timestamp,
          lastSeen: logEntry.timestamp,
          occurrenceCount: 1,
          affectedUsersCount: logEntry.userId ? 1 : 0,
          affectedSessionsCount: logEntry.sessionId ? 1 : 0,
          impactScore,
        })
        .returning();

      if (!newIssue) {
        return null;
      }

      // Create first occurrence
      await this.db.insert(schema.issueOccurrences).values({
        issueId: newIssue.id,
        logEntryId: logEntry.id,
        timestamp: logEntry.timestamp,
        serverId: logEntry.serverId,
        userId: logEntry.userId,
        sessionId: logEntry.sessionId,
      });

      return newIssue.id;
    }
  }

  /**
   * Search for issues with filters
   */
  async search(params: IssueSearchDto) {
    // Normalize array parameters (NestJS passes single values as strings, not arrays)
    const sources = normalizeArrayParam(params.sources);
    const severities = normalizeArrayParam(params.severities);
    const statuses = normalizeArrayParam(params.statuses);

    const conditions = [];

    if (params.serverId) {
      conditions.push(eq(schema.issues.serverId, params.serverId));
    }

    if (sources && sources.length > 0) {
      conditions.push(inArray(schema.issues.source, sources as any));
    }

    if (severities && severities.length > 0) {
      conditions.push(inArray(schema.issues.severity, severities as any));
    }

    if (statuses && statuses.length > 0) {
      conditions.push(inArray(schema.issues.status, statuses as any));
    }

    if (params.category) {
      conditions.push(eq(schema.issues.category, params.category));
    }

    if (params.search) {
      conditions.push(
        sql`(${schema.issues.title} ILIKE ${'%' + params.search + '%'} OR ${schema.issues.sampleMessage} ILIKE ${'%' + params.search + '%'})`
      );
    }

    const limit = Math.min(params.limit ?? 50, 100);
    const offset = params.offset ?? 0;

    // Determine sort column and order
    const sortColumns: Record<string, any> = {
      impactScore: schema.issues.impactScore,
      occurrenceCount: schema.issues.occurrenceCount,
      lastSeen: schema.issues.lastSeen,
      firstSeen: schema.issues.firstSeen,
      severity: schema.issues.severity,
    };
    const sortColumn = sortColumns[params.sortBy || 'impactScore'];
    const orderFn = params.sortOrder === 'asc' ? asc : desc;

    const results = await this.db
      .select({
        issue: schema.issues,
        serverName: schema.servers.name,
      })
      .from(schema.issues)
      .leftJoin(schema.servers, eq(schema.issues.serverId, schema.servers.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset);

    return results.map((r) => ({
      ...r.issue,
      serverName: r.serverName,
    }));
  }

  /**
   * Get a single issue by ID with full details
   */
  async findOne(id: string) {
    const result = await this.db
      .select({
        issue: schema.issues,
        serverName: schema.servers.name,
      })
      .from(schema.issues)
      .leftJoin(schema.servers, eq(schema.issues.serverId, schema.servers.id))
      .where(eq(schema.issues.id, id))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundException(`Issue with ID ${id} not found`);
    }

    // Get recent occurrences with log messages
    const recentOccurrences = await this.db
      .select({
        id: schema.issueOccurrences.id,
        timestamp: schema.issueOccurrences.timestamp,
        userId: schema.issueOccurrences.userId,
        sessionId: schema.issueOccurrences.sessionId,
        message: schema.logEntries.message,
      })
      .from(schema.issueOccurrences)
      .innerJoin(schema.logEntries, eq(schema.issueOccurrences.logEntryId, schema.logEntries.id))
      .where(eq(schema.issueOccurrences.issueId, id))
      .orderBy(desc(schema.issueOccurrences.timestamp))
      .limit(20);

    const firstResult = result[0];
    return {
      ...firstResult!.issue,
      serverName: firstResult!.serverName,
      recentOccurrences,
    };
  }

  /**
   * Update an issue
   */
  async update(id: string, updateDto: UpdateIssueDto) {
    const updateData: Partial<typeof schema.issues.$inferInsert> = {
      ...updateDto,
      updatedAt: new Date(),
    };

    if (updateDto.status === 'resolved' && updateDto.resolvedBy) {
      updateData.resolvedAt = new Date();
    }

    const [updated] = await this.db
      .update(schema.issues)
      .set(updateData)
      .where(eq(schema.issues.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Issue with ID ${id} not found`);
    }

    return updated;
  }

  /**
   * Merge multiple issues into one
   */
  async mergeIssues(mergeDto: MergeIssuesDto) {
    const { issueIds, newTitle } = mergeDto;

    if (issueIds.length < 2) {
      throw new Error('Need at least 2 issues to merge');
    }

    // Get all issues
    const issues = await this.db
      .select()
      .from(schema.issues)
      .where(inArray(schema.issues.id, issueIds));

    if (issues.length !== issueIds.length) {
      throw new NotFoundException('One or more issues not found');
    }

    // Use the first issue as the primary one
    const primaryIssue = issues[0]!;
    const otherIssueIds = issueIds.slice(1);

    // Calculate combined stats
    const totalOccurrences = issues.reduce((sum, i) => sum + i.occurrenceCount, 0);
    const firstSeen = new Date(Math.min(...issues.map((i) => new Date(i.firstSeen).getTime())));
    const lastSeen = new Date(Math.max(...issues.map((i) => new Date(i.lastSeen).getTime())));

    // Get unique affected users/sessions from all issues
    const allOccurrences = await this.db
      .select({
        userId: schema.issueOccurrences.userId,
        sessionId: schema.issueOccurrences.sessionId,
      })
      .from(schema.issueOccurrences)
      .where(inArray(schema.issueOccurrences.issueId, issueIds));

    const affectedUsers = new Set(allOccurrences.filter((o) => o.userId).map((o) => o.userId));
    const affectedSessions = new Set(
      allOccurrences.filter((o) => o.sessionId).map((o) => o.sessionId)
    );

    // Move all occurrences to primary issue
    await this.db
      .update(schema.issueOccurrences)
      .set({ issueId: primaryIssue.id })
      .where(inArray(schema.issueOccurrences.issueId, otherIssueIds));

    // Update primary issue stats
    const hoursSinceLastSeen = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60);
    const newImpactScore = this.calculateImpactScore(
      primaryIssue.severity,
      totalOccurrences,
      affectedUsers.size,
      affectedSessions.size,
      hoursSinceLastSeen
    );

    await this.db
      .update(schema.issues)
      .set({
        title: newTitle || primaryIssue.title,
        firstSeen,
        lastSeen,
        occurrenceCount: totalOccurrences,
        affectedUsersCount: affectedUsers.size,
        affectedSessionsCount: affectedSessions.size,
        impactScore: newImpactScore,
        updatedAt: new Date(),
      })
      .where(eq(schema.issues.id, primaryIssue.id));

    // Delete the other issues
    await this.db.delete(schema.issues).where(inArray(schema.issues.id, otherIssueIds));

    return this.findOne(primaryIssue.id);
  }

  /**
   * Get issue statistics
   */
  async getStats(serverId?: string): Promise<IssueStatsDto> {
    const baseCondition = serverId ? eq(schema.issues.serverId, serverId) : undefined;

    // Get counts by status
    const statusCounts = await this.db
      .select({
        status: schema.issues.status,
        count: count(),
      })
      .from(schema.issues)
      .where(baseCondition)
      .groupBy(schema.issues.status);

    // Get counts by severity
    const severityCounts = await this.db
      .select({
        severity: schema.issues.severity,
        count: count(),
      })
      .from(schema.issues)
      .where(baseCondition)
      .groupBy(schema.issues.severity);

    // Get counts by source
    const sourceCounts = await this.db
      .select({
        source: schema.issues.source,
        count: count(),
      })
      .from(schema.issues)
      .where(baseCondition)
      .groupBy(schema.issues.source);

    // Get top categories
    const topCategories = await this.db
      .select({
        category: schema.issues.category,
        count: count(),
      })
      .from(schema.issues)
      .where(baseCondition)
      .groupBy(schema.issues.category)
      .orderBy(desc(count()))
      .limit(10);

    // Get average impact score
    const avgImpact = await this.db
      .select({
        avg: avg(schema.issues.impactScore),
      })
      .from(schema.issues)
      .where(baseCondition);

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCondition = gte(schema.issues.createdAt, today);
    const resolvedTodayCondition = and(
      gte(schema.issues.resolvedAt, today),
      eq(schema.issues.status, 'resolved')
    );

    const [newToday] = await this.db
      .select({ count: count() })
      .from(schema.issues)
      .where(baseCondition ? and(baseCondition, todayCondition) : todayCondition);

    const [resolvedToday] = await this.db
      .select({ count: count() })
      .from(schema.issues)
      .where(baseCondition ? and(baseCondition, resolvedTodayCondition) : resolvedTodayCondition);

    // Build response
    const byStatus: Record<string, number> = {};
    let totalIssues = 0;
    let openIssues = 0;

    for (const row of statusCounts) {
      byStatus[row.status] = Number(row.count);
      totalIssues += Number(row.count);
      if (['open', 'acknowledged', 'in_progress'].includes(row.status)) {
        openIssues += Number(row.count);
      }
    }

    const bySeverity: Record<string, number> = {};
    let criticalIssues = 0;
    let highIssues = 0;

    for (const row of severityCounts) {
      bySeverity[row.severity] = Number(row.count);
      if (row.severity === 'critical') criticalIssues = Number(row.count);
      if (row.severity === 'high') highIssues = Number(row.count);
    }

    const bySource: Record<string, number> = {};
    for (const row of sourceCounts) {
      bySource[row.source] = Number(row.count);
    }

    return {
      totalIssues,
      openIssues,
      criticalIssues,
      highIssues,
      resolvedToday: Number(resolvedToday?.count || 0),
      newToday: Number(newToday?.count || 0),
      bySource,
      bySeverity,
      byStatus,
      topCategories: topCategories.map((c) => ({
        category: c.category || 'uncategorized',
        count: Number(c.count),
      })),
      averageImpactScore: Number(avgImpact[0]?.avg || 0),
    };
  }

  /**
   * Get categories list
   */
  async getCategories(): Promise<string[]> {
    const categories = await this.db
      .selectDistinct({ category: schema.issues.category })
      .from(schema.issues);

    return categories
      .map((c) => c.category)
      .filter((c): c is string => c !== null)
      .sort();
  }

  /**
   * Progress callback type for backfill operation
   */
  static BackfillProgressCallback: (progress: {
    status: 'started' | 'progress' | 'completed' | 'error';
    totalLogs: number;
    processedLogs: number;
    issuesCreated: number;
    issuesUpdated: number;
    currentBatch?: number;
    totalBatches?: number;
    error?: string;
  }) => void;

  /**
   * Backfill issues from existing log entries
   * Processes all error/warning logs that don't have an issue occurrence yet
   * Uses parallel processing for speed and skips already-processed logs
   */
  async backfillFromLogs(
    serverId?: string,
    progressCallback?: (progress: {
      status: 'started' | 'progress' | 'completed' | 'error';
      totalLogs: number;
      processedLogs: number;
      issuesCreated: number;
      issuesUpdated: number;
      currentBatch?: number;
      totalBatches?: number;
      error?: string;
    }) => void
  ): Promise<{
    processedLogs: number;
    issuesCreated: number;
    issuesUpdated: number;
  }> {
    // Build base conditions for error/warn logs
    const levelCondition = inArray(schema.logEntries.level, ['error', 'warn']);
    const serverCondition = serverId ? eq(schema.logEntries.serverId, serverId) : undefined;

    // Use NOT EXISTS subquery to find unprocessed logs (much faster than loading all IDs)
    const unprocessedCondition = sql`NOT EXISTS (
      SELECT 1 FROM ${schema.issueOccurrences}
      WHERE ${schema.issueOccurrences.logEntryId} = ${schema.logEntries.id}
    )`;

    const conditions = serverCondition
      ? and(levelCondition, serverCondition, unprocessedCondition)
      : and(levelCondition, unprocessedCondition);

    // Get total count of unprocessed logs
    const [countResult] = await this.db
      .select({ count: count() })
      .from(schema.logEntries)
      .where(conditions);

    const totalLogs = Number(countResult?.count || 0);
    const BATCH_SIZE = 500; // Larger batches since we're processing in parallel
    const CONCURRENCY = 20; // Process 20 logs concurrently
    const totalBatches = Math.ceil(totalLogs / BATCH_SIZE);

    let processedLogs = 0;
    let issuesCreated = 0;
    let issuesUpdated = 0;

    // Emit started event
    progressCallback?.({
      status: 'started',
      totalLogs,
      processedLogs: 0,
      issuesCreated: 0,
      issuesUpdated: 0,
      currentBatch: 0,
      totalBatches,
    });

    // If no logs to process, complete immediately
    if (totalLogs === 0) {
      progressCallback?.({
        status: 'completed',
        totalLogs: 0,
        processedLogs: 0,
        issuesCreated: 0,
        issuesUpdated: 0,
        currentBatch: 0,
        totalBatches: 0,
      });
      return { processedLogs: 0, issuesCreated: 0, issuesUpdated: 0 };
    }

    // Get existing issue IDs before backfill
    const existingIssueIds = new Set(
      (await this.db.select({ id: schema.issues.id }).from(schema.issues)).map((i) => i.id)
    );

    // Process in batches - no offset needed since we're always querying unprocessed logs
    // As logs get processed, they get occurrences and won't appear in next batch
    for (let batch = 0; batch < totalBatches; batch++) {
      // Get batch of unprocessed logs (always from the start since processed ones are excluded)
      const logs = await this.db
        .select()
        .from(schema.logEntries)
        .where(conditions)
        .orderBy(asc(schema.logEntries.timestamp))
        .limit(BATCH_SIZE);

      if (logs.length === 0) break; // No more unprocessed logs

      // Process logs in parallel with concurrency limit
      for (let i = 0; i < logs.length; i += CONCURRENCY) {
        const chunk = logs.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (log) => {
            const issueId = await this.processLogEntry(log);
            return { issueId, logId: log.id };
          })
        );

        for (const result of results) {
          processedLogs++;
          if (result.status === 'fulfilled' && result.value.issueId) {
            const { issueId } = result.value;
            if (existingIssueIds.has(issueId)) {
              issuesUpdated++;
            } else {
              issuesCreated++;
              existingIssueIds.add(issueId);
            }
          }
        }
      }

      // Emit progress event after each batch
      progressCallback?.({
        status: 'progress',
        totalLogs,
        processedLogs,
        issuesCreated,
        issuesUpdated,
        currentBatch: batch + 1,
        totalBatches,
      });
    }

    // Emit completed event
    progressCallback?.({
      status: 'completed',
      totalLogs,
      processedLogs,
      issuesCreated,
      issuesUpdated,
      currentBatch: totalBatches,
      totalBatches,
    });

    return { processedLogs, issuesCreated, issuesUpdated };
  }

  /**
   * Get paginated occurrences for an issue
   */
  async getOccurrences(issueId: string, limit?: number, offset?: number) {
    const actualLimit = Math.min(limit || 50, 100);
    const actualOffset = offset || 0;

    const occurrences = await this.db
      .select({
        id: schema.issueOccurrences.id,
        timestamp: schema.issueOccurrences.timestamp,
        userId: schema.issueOccurrences.userId,
        sessionId: schema.issueOccurrences.sessionId,
        serverId: schema.issueOccurrences.serverId,
        logEntryId: schema.issueOccurrences.logEntryId,
        message: schema.logEntries.message,
        level: schema.logEntries.level,
        source: schema.logEntries.source,
        serverName: schema.servers.name,
      })
      .from(schema.issueOccurrences)
      .innerJoin(schema.logEntries, eq(schema.issueOccurrences.logEntryId, schema.logEntries.id))
      .leftJoin(schema.servers, eq(schema.issueOccurrences.serverId, schema.servers.id))
      .where(eq(schema.issueOccurrences.issueId, issueId))
      .orderBy(desc(schema.issueOccurrences.timestamp))
      .limit(actualLimit)
      .offset(actualOffset);

    // Get total count
    const [countResult] = await this.db
      .select({ count: count() })
      .from(schema.issueOccurrences)
      .where(eq(schema.issueOccurrences.issueId, issueId));

    return {
      data: occurrences,
      total: Number(countResult?.count || 0),
      limit: actualLimit,
      offset: actualOffset,
    };
  }

  /**
   * Get timeline data for an issue (occurrences grouped by time)
   */
  async getTimeline(issueId: string) {
    // Get hourly counts for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const hourlyData = await this.db
      .select({
        hour: sql<string>`date_trunc('hour', ${schema.issueOccurrences.timestamp})`,
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

    // Get daily counts for all time
    const dailyData = await this.db
      .select({
        day: sql<string>`date_trunc('day', ${schema.issueOccurrences.timestamp})`,
        count: count(),
      })
      .from(schema.issueOccurrences)
      .where(eq(schema.issueOccurrences.issueId, issueId))
      .groupBy(sql`date_trunc('day', ${schema.issueOccurrences.timestamp})`)
      .orderBy(asc(sql`date_trunc('day', ${schema.issueOccurrences.timestamp})`));

    // Get affected users over time
    const affectedUsers = await this.db
      .selectDistinct({
        userId: schema.issueOccurrences.userId,
      })
      .from(schema.issueOccurrences)
      .where(
        and(
          eq(schema.issueOccurrences.issueId, issueId),
          sql`${schema.issueOccurrences.userId} IS NOT NULL`
        )
      );

    return {
      hourly: hourlyData.map((d) => ({
        timestamp: d.hour,
        count: Number(d.count),
      })),
      daily: dailyData.map((d) => ({
        timestamp: d.day,
        count: Number(d.count),
      })),
      affectedUsers: affectedUsers.map((u) => u.userId).filter(Boolean),
    };
  }

  /**
   * Analyze an issue using AI with deep context gathering
   * Returns structured analysis with confidence levels, evidence, and recommendations
   */
  async analyzeIssue(issueId: string, providerId?: string): Promise<AnalysisResult> {
    // Check if AI provider is configured
    const defaultProvider = await this.aiProviderService.getDefaultProvider();
    if (!defaultProvider && !providerId) {
      throw new BadRequestException(
        'No AI provider configured. Please configure an AI provider in settings.'
      );
    }

    this.logger.log(`Gathering context for deep AI analysis of issue ${issueId}`);

    // Gather rich context for the issue
    const context = await this.issueContextService.gatherContext(issueId);

    // Build the enhanced prompt with full context
    const { system, user } = this.analysisPromptBuilder.buildPrompt(context);

    this.logger.log(
      `Generating AI analysis for issue ${issueId} with ${context.sampleOccurrences.length} occurrences, ${context.affectedUsers.length} users, ${context.stackTraces.length} stack traces`
    );

    // Generate the analysis using system + user prompt
    let result;
    try {
      result = await this.aiProviderService.generateAnalysisWithSystemPrompt(
        system,
        user,
        providerId
      );
    } catch (error) {
      this.logger.error(`AI generation failed for issue ${issueId}:`, error);
      throw error;
    }

    // Parse the structured response
    let analysis;
    try {
      analysis = parseAnalysisResponse(result.analysis);
    } catch (error) {
      this.logger.error(
        `Failed to parse AI response for issue ${issueId}:`,
        result.analysis,
        error
      );
      throw error;
    }

    // Create a conversation for follow-ups
    const firstMessage: {
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
      tokensUsed?: number;
    } = {
      role: 'assistant',
      content: result.analysis,
      timestamp: new Date().toISOString(),
    };
    if (result.tokensUsed !== undefined) {
      firstMessage.tokensUsed = result.tokensUsed;
    }

    const [conversation] = await this.db
      .insert(schema.analysisConversations)
      .values({
        issueId,
        messages: [firstMessage],
        contextSnapshot: context as unknown as Record<string, unknown>,
        provider: result.provider,
        model: result.model,
        totalTokens: result.tokensUsed ?? 0,
      })
      .returning();

    // Update the issue with analysis summary (for backward compatibility)
    await this.db
      .update(schema.issues)
      .set({
        aiAnalysis: JSON.stringify(analysis),
        aiAnalysisAt: new Date(),
        aiSuggestedFix:
          analysis.recommendations.length > 0 ? analysis.recommendations[0]?.action || null : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.issues.id, issueId));

    // Create audit record
    await this.db.insert(schema.aiAnalyses).values({
      serverId: context.issue.id,
      provider: result.provider,
      prompt: `${system}\n\n${user}`,
      response: result.analysis,
      tokensUsed: result.tokensUsed ?? null,
    });

    this.logger.log(
      `AI analysis complete for issue ${issueId}: ${result.tokensUsed ?? 'unknown'} tokens used, confidence: ${analysis.rootCause.confidence}%`
    );

    const analysisResult: AnalysisResult = {
      analysis,
      metadata: {
        provider: result.provider,
        model: result.model,
        tokensUsed: result.tokensUsed ?? 0,
        generatedAt: new Date(),
        contextSummary: {
          occurrencesIncluded: context.sampleOccurrences.length,
          stackTracesIncluded: context.stackTraces.length,
          usersIncluded: context.affectedUsers.length,
          sessionsIncluded: context.affectedSessions.length,
        },
      },
    };

    if (conversation?.id) {
      analysisResult.conversationId = conversation.id;
    }

    return analysisResult;
  }

  /**
   * Ask a follow-up question about an issue analysis
   */
  async analyzeIssueFollowUp(
    issueId: string,
    conversationId: string,
    question: string,
    providerId?: string
  ): Promise<FollowUpResult> {
    // Get the conversation
    const [conversation] = await this.db
      .select()
      .from(schema.analysisConversations)
      .where(
        and(
          eq(schema.analysisConversations.id, conversationId),
          eq(schema.analysisConversations.issueId, issueId)
        )
      )
      .limit(1);

    if (!conversation) {
      throw new NotFoundException('Analysis conversation not found');
    }

    // Check if AI provider is configured
    const defaultProvider = await this.aiProviderService.getDefaultProvider();
    if (!defaultProvider && !providerId) {
      throw new BadRequestException(
        'No AI provider configured. Please configure an AI provider in settings.'
      );
    }

    // Get the original context from the snapshot
    const context = conversation.contextSnapshot as unknown as IssueAnalysisContext;

    // Get the previous analysis (first assistant message)
    const previousMessages = conversation.messages as ConversationMessage[];
    const previousAnalysis = previousMessages.find((m) => m.role === 'assistant')?.content || '';

    // Build follow-up prompt
    const { system, user } = this.analysisPromptBuilder.buildFollowUpPrompt(
      context,
      previousAnalysis,
      question
    );

    this.logger.log(
      `Generating follow-up response for issue ${issueId}, conversation ${conversationId}`
    );

    // Generate follow-up response
    const result = await this.aiProviderService.generateAnalysisWithSystemPrompt(
      system,
      user,
      providerId
    );

    // Add messages to conversation
    type DbMessage = {
      role: 'user' | 'assistant';
      content: string;
      timestamp: string;
      tokensUsed?: number;
    };
    const userMessage: DbMessage = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };
    const assistantMessage: DbMessage = {
      role: 'assistant',
      content: result.analysis,
      timestamp: new Date().toISOString(),
    };
    if (result.tokensUsed !== undefined) {
      assistantMessage.tokensUsed = result.tokensUsed;
    }

    const updatedMessages: DbMessage[] = [
      ...(previousMessages as DbMessage[]),
      userMessage,
      assistantMessage,
    ];

    // Update conversation
    await this.db
      .update(schema.analysisConversations)
      .set({
        messages: updatedMessages,
        totalTokens: (conversation.totalTokens ?? 0) + (result.tokensUsed ?? 0),
        updatedAt: new Date(),
      })
      .where(eq(schema.analysisConversations.id, conversationId));

    this.logger.log(
      `Follow-up response complete for issue ${issueId}: ${result.tokensUsed ?? 'unknown'} tokens used`
    );

    return {
      conversationId,
      response: result.analysis,
      tokensUsed: result.tokensUsed ?? 0,
    };
  }

  /**
   * Get analysis conversation history for an issue
   */
  async getAnalysisConversation(issueId: string, conversationId: string) {
    const [conversation] = await this.db
      .select()
      .from(schema.analysisConversations)
      .where(
        and(
          eq(schema.analysisConversations.id, conversationId),
          eq(schema.analysisConversations.issueId, issueId)
        )
      )
      .limit(1);

    if (!conversation) {
      throw new NotFoundException('Analysis conversation not found');
    }

    return {
      id: conversation.id,
      issueId: conversation.issueId,
      messages: conversation.messages,
      provider: conversation.provider,
      model: conversation.model,
      totalTokens: conversation.totalTokens,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * Get latest analysis conversation for an issue
   */
  async getLatestAnalysisConversation(issueId: string) {
    const [conversation] = await this.db
      .select()
      .from(schema.analysisConversations)
      .where(eq(schema.analysisConversations.issueId, issueId))
      .orderBy(desc(schema.analysisConversations.createdAt))
      .limit(1);

    if (!conversation) {
      return null;
    }

    return {
      id: conversation.id,
      issueId: conversation.issueId,
      messages: conversation.messages,
      provider: conversation.provider,
      model: conversation.model,
      totalTokens: conversation.totalTokens,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }
}
