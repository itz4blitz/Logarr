/**
 * Seerr provider for Logarr (also covers Overseerr and Jellyseerr)
 * Implements the MediaServerProvider interface
 *
 * Activity comes from media requests and user reported issues. Application logs
 * are ingested from log files only (see getLogFileConfig).
 */

import { SeerrClient } from './seerr.client.js';
import {
  SEERR_CORRELATION_PATTERNS,
  SEERR_LOG_FILE_CONFIG,
  isSeerrLogContinuation,
  parseSeerrLogLine,
  parseSeerrLogLineWithContext,
} from './seerr.parser.js';

import type { SeerrIssue, SeerrMediaInfo, SeerrRequest, SeerrUser } from './seerr.types.js';
import type {
  ConnectionStatus,
  CorrelationPattern,
  LogFileConfig,
  LogLevel,
  LogParseContext,
  LogParseResult,
  MediaServerProvider,
  NormalizedActivity,
  NormalizedSession,
  NormalizedUser,
  ParsedLogEntry,
  ProviderCapabilities,
  ProviderConfig,
  ServerInfo,
} from '@logarr/core';

const PAGE_SIZE = 50;
const MAX_PAGES_WITH_SINCE = 3;

const REQUEST_STATUS: Record<number, { type: string; label: string; severity: LogLevel }> = {
  1: { type: 'request_pending', label: 'pending approval', severity: 'info' },
  2: { type: 'request_approved', label: 'approved', severity: 'info' },
  3: { type: 'request_declined', label: 'declined', severity: 'warn' },
  4: { type: 'request_failed', label: 'failed', severity: 'error' },
  5: { type: 'request_completed', label: 'completed', severity: 'info' },
};

const ISSUE_TYPE_LABELS: Record<number, string> = {
  1: 'Video',
  2: 'Audio',
  3: 'Subtitles',
  4: 'Other',
};

function userName(user: SeerrUser | undefined): string | undefined {
  if (user === undefined) {
    return undefined;
  }
  return (
    user.displayName ??
    user.username ??
    user.plexUsername ??
    user.jellyfinUsername ??
    `user ${user.id}`
  );
}

function mediaLabel(media: SeerrMediaInfo | undefined, fallback: string): string {
  return media?.tmdbId !== undefined ? `tmdb:${media.tmdbId}` : fallback;
}

function parseDate(value: string | undefined): Date | null {
  if (value === undefined) {
    return null;
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Seerr provider
 */
export class SeerrProvider implements MediaServerProvider {
  readonly id = 'seerr';
  readonly name = 'Seerr';

  readonly capabilities: ProviderCapabilities = {
    supportsRealTimeLogs: false,
    supportsActivityLog: true,
    supportsSessions: false,
    supportsWebhooks: false,
    supportsPlaybackHistory: false,
  };

  private client: SeerrClient | null = null;
  private config: ProviderConfig | null = null;

  // ===========================================================================
  // Connection Lifecycle
  // ===========================================================================

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.client = new SeerrClient(config.url, config.apiKey);
    // /settings/about is admin-only, so this validates the API key as well
    await this.client.getAbout();
  }

  disconnect(): Promise<void> {
    this.client = null;
    this.config = null;
    return Promise.resolve();
  }

  async testConnection(): Promise<ConnectionStatus> {
    if (this.client === null) {
      return { connected: false, error: 'Not initialized' };
    }

    try {
      return { connected: true, serverInfo: await this.fetchServerInfo(this.client) };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getServerInfo(): Promise<ServerInfo> {
    return this.fetchServerInfo(this.getClient());
  }

  // ===========================================================================
  // Log Files
  // ===========================================================================

  getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }
    return Promise.resolve(['/seerr-logs', '/app/config/logs']);
  }

  getLogFileConfig(): LogFileConfig {
    return SEERR_LOG_FILE_CONFIG;
  }

  parseLogLine(line: string): ParsedLogEntry | null {
    return parseSeerrLogLine(line);
  }

  parseLogLineWithContext(line: string, context: LogParseContext): LogParseResult {
    return parseSeerrLogLineWithContext(line, context);
  }

  isLogContinuation(line: string): boolean {
    return isSeerrLogContinuation(line);
  }

  getCorrelationPatterns(): readonly CorrelationPattern[] {
    return SEERR_CORRELATION_PATTERNS;
  }

  // ===========================================================================
  // Sessions / Users (not applicable)
  // ===========================================================================

  getSessions(): Promise<readonly NormalizedSession[]> {
    return Promise.resolve([]);
  }

  getUsers(): Promise<readonly NormalizedUser[]> {
    return Promise.resolve([]);
  }

  // ===========================================================================
  // Activity
  // ===========================================================================

  /**
   * Requests and issues. One source failing does not hide the other; if both
   * fail the first error is rethrown so the poll marks the server as down.
   */
  async getActivity(since?: Date): Promise<readonly NormalizedActivity[]> {
    const client = this.getClient();

    const results = await Promise.allSettled([
      this.collect(client, 'request', since),
      this.collect(client, 'issue', since),
    ]);

    const activities: NormalizedActivity[] = [];
    const errors: unknown[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === 'fulfilled') {
        activities.push(...result.value);
      } else {
        errors.push(result.reason);
        console.error(
          `[${this.id}] Failed to fetch ${index === 0 ? 'request' : 'issue'} activity:`,
          result.reason
        );
      }
    }

    if (errors.length === results.length) {
      throw errors[0] instanceof Error ? errors[0] : new Error(String(errors[0]));
    }

    return activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private getClient(): SeerrClient {
    if (this.client === null) {
      throw new Error('Not connected to Seerr server');
    }
    return this.client;
  }

  private async fetchServerInfo(client: SeerrClient): Promise<ServerInfo> {
    const about = await client.getAbout();
    return { name: 'Seerr', version: about.version, id: 'seerr' };
  }

  /**
   * Page through a list (newest modification first) until an item older than
   * `since` is seen, a short page is returned or the page cap is reached.
   *
   * Trade-off: the cap (3 pages = 150 items per poll) bounds the number of API
   * calls (Seerr rate limits to 50 req/60 s). If more than 150 items changed since
   * the last poll, the oldest ones are skipped; this is logged as a warning.
   */
  private async collect(
    client: SeerrClient,
    kind: 'request' | 'issue',
    since?: Date
  ): Promise<NormalizedActivity[]> {
    const maxPages = since === undefined ? 1 : MAX_PAGES_WITH_SINCE;
    const out: NormalizedActivity[] = [];

    for (let page = 0; page < maxPages; page++) {
      const options = { take: PAGE_SIZE, skip: page * PAGE_SIZE };
      const items: readonly (SeerrRequest | SeerrIssue)[] =
        kind === 'request' ? await client.getRequests(options) : await client.getIssues(options);

      let reachedOlder = false;
      for (const item of items) {
        const activity =
          kind === 'request'
            ? this.normalizeRequest(item as SeerrRequest)
            : this.normalizeIssue(item as SeerrIssue);
        if (activity === null) {
          continue;
        }
        if (since !== undefined && activity.timestamp < since) {
          reachedOlder = true;
          continue;
        }
        out.push(activity);
      }

      if (reachedOlder || items.length < PAGE_SIZE) {
        break;
      }

      if (since !== undefined && page === maxPages - 1) {
        console.warn(`[${this.id}] activity page cap reached; some changes may be skipped`);
      }
    }

    return out;
  }

  private normalizeRequest(req: SeerrRequest): NormalizedActivity | null {
    const timestamp = parseDate(req.updatedAt);
    if (timestamp === null || typeof req.status !== 'number') {
      return null;
    }

    const mediaType = req.type ?? req.media?.mediaType;
    const typeLabel = mediaType === 'movie' ? 'Movie' : mediaType === 'tv' ? 'TV' : 'Media';
    const mapped = REQUEST_STATUS[req.status] ?? {
      type: 'request_unknown',
      label: `status ${req.status}`,
      severity: 'info' as LogLevel,
    };

    const seasons = (req.seasons ?? []).map((s) => `S${s.seasonNumber}`);
    const modifier =
      typeof req.modifiedBy === 'object' ? userName(req.modifiedBy ?? undefined) : undefined;
    const details = [
      req.is4k === true ? '4K' : undefined,
      seasons.length > 0 ? seasons.join(', ') : undefined,
      `requested by ${userName(req.requestedBy) ?? 'unknown user'}`,
      modifier !== undefined ? `updated by ${modifier}` : undefined,
    ].filter((d): d is string => d !== undefined);

    return {
      id: `seerr-request-${req.id}-status-${req.status}`,
      type: mapped.type,
      name: `${typeLabel} request ${mapped.label}`,
      overview: `${mediaLabel(req.media, `request #${req.id}`)} (${details.join(', ')})`,
      severity: mapped.severity,
      userId: req.requestedBy !== undefined ? String(req.requestedBy.id) : undefined,
      itemId: req.media?.tmdbId !== undefined ? `tmdb:${req.media.tmdbId}` : undefined,
      timestamp,
      metadata: {
        requestId: req.id,
        status: req.status,
        mediaType,
        tmdbId: req.media?.tmdbId,
        tvdbId: req.media?.tvdbId,
        is4k: req.is4k ?? false,
        mediaStatus: req.media?.status,
      },
    };
  }

  private normalizeIssue(issue: SeerrIssue): NormalizedActivity | null {
    const timestamp = parseDate(issue.updatedAt) ?? parseDate(issue.createdAt);
    if (timestamp === null) {
      return null;
    }

    if (issue.status !== undefined && typeof issue.status !== 'number') {
      return null;
    }
    const status = issue.status ?? 1;
    const resolved = status === 2;
    const typeLabel = ISSUE_TYPE_LABELS[issue.issueType] ?? `Type ${issue.issueType}`;

    const where =
      issue.problemSeason !== undefined && issue.problemSeason > 0
        ? ` S${issue.problemSeason}${
            issue.problemEpisode !== undefined && issue.problemEpisode > 0
              ? `E${issue.problemEpisode}`
              : ''
          }`
        : '';

    const comments = issue.comments ?? [];
    const reporter = userName(issue.createdBy) ?? 'unknown user';
    const subject = mediaLabel(issue.media, `issue #${issue.id}`);

    return {
      id: `seerr-issue-${issue.id}-status-${status}`,
      type: resolved ? 'issue_resolved' : 'issue_open',
      name: `${typeLabel} issue ${resolved ? 'resolved' : 'open'}${where}`,
      // Comment text is user-controlled and flows into AI analysis, so only the count is shown
      overview: `${subject}: ${comments.length} ${
        comments.length === 1 ? 'comment' : 'comments'
      } (reported by ${reporter})`,
      severity: resolved ? 'info' : 'warn',
      userId: issue.createdBy !== undefined ? String(issue.createdBy.id) : undefined,
      itemId: issue.media?.tmdbId !== undefined ? `tmdb:${issue.media.tmdbId}` : undefined,
      timestamp,
      metadata: {
        issueId: issue.id,
        issueType: issue.issueType,
        status,
        commentCount: comments.length,
        tmdbId: issue.media?.tmdbId,
        mediaType: issue.media?.mediaType,
      },
    };
  }
}
