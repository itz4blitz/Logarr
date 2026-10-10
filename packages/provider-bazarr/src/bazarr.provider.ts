import { BazarrClient } from './bazarr.client.js';
import {
  BAZARR_CORRELATION_PATTERNS,
  BAZARR_LOG_FILE_CONFIG,
  isBazarrLogContinuation,
  parseBazarrLogLine,
  parseBazarrLogLineWithContext,
} from './bazarr.parser.js';
import { BazarrHistoryActions } from './bazarr.types.js';
import { parseBazarrTimestamp, stableHash } from './bazarr.utils.js';

import type {
  BazarrEpisodeHistory,
  BazarrHealthIssue,
  BazarrHistoryBase,
  BazarrJob,
  BazarrMovieHistory,
} from './bazarr.types.js';
import type {
  ConnectionStatus,
  CorrelationPattern,
  LogFileConfig,
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

/** History page size requested from Bazarr */
const HISTORY_PAGE_SIZE = 50;
/** Maximum history pages fetched per endpoint per poll (when a `since` cutoff exists) */
const HISTORY_MAX_PAGES_WITH_SINCE = 3;
/**
 * History timestamps are naive local time of the Bazarr host, so the `since` cutoff is
 * widened by this margin to absorb timezone differences. Re-read rows are deduplicated
 * by their stable activity id.
 */
const HISTORY_SINCE_MARGIN_MS = 24 * 60 * 60 * 1000;

/** Anything with an explicit UTC offset can be parsed natively */
const ISO_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Lowercase kebab id fragment (stable, no spaces or punctuation) */
function idPart(value: string | number): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseJobTime(value: string | null | undefined): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (ISO_WITH_TIMEZONE.test(value)) {
    const date = new Date(value.replace(' ', 'T'));
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return parseBazarrTimestamp({ timestamp: value });
}

/**
 * Bazarr subtitle manager provider
 */
export class BazarrProvider implements MediaServerProvider {
  readonly id = 'bazarr';
  readonly name = 'Bazarr';

  readonly capabilities: ProviderCapabilities = {
    supportsRealTimeLogs: false,
    supportsActivityLog: true,
    supportsSessions: false,
    supportsWebhooks: false,
    supportsPlaybackHistory: false,
  };

  private client: BazarrClient | null = null;
  private config: ProviderConfig | null = null;

  async connect(config: ProviderConfig): Promise<void> {
    this.config = config;
    this.client = new BazarrClient(config.url, config.apiKey);
    await this.client.testConnection();
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
      const status = await this.client.getSystemStatus();

      return {
        connected: true,
        serverInfo: {
          name: 'Bazarr',
          version: status.bazarr_version,
          id: status.bazarr_config_directory ?? 'bazarr',
        },
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }

    return Promise.resolve([
      '/bazarr-logs', // Docker with Logarr (mount via BAZARR_LOGS_PATH env var)
      '/config/log', // Docker (Bazarr container)
      '/opt/bazarr/data/log', // Linux
      '/var/lib/bazarr/log', // Linux
      'C:\\ProgramData\\Bazarr\\log', // Windows
    ]);
  }

  parseLogLine(line: string): ParsedLogEntry | null {
    return parseBazarrLogLine(line);
  }

  getCorrelationPatterns(): readonly CorrelationPattern[] {
    return BAZARR_CORRELATION_PATTERNS;
  }

  getLogFileConfig(): LogFileConfig {
    return BAZARR_LOG_FILE_CONFIG;
  }

  parseLogLineWithContext(line: string, context: LogParseContext): LogParseResult {
    return parseBazarrLogLineWithContext(line, context);
  }

  isLogContinuation(line: string): boolean {
    return isBazarrLogContinuation(line);
  }

  getSessions(): Promise<readonly NormalizedSession[]> {
    return Promise.resolve([]);
  }

  getUsers(): Promise<readonly NormalizedUser[]> {
    return Promise.resolve([]);
  }

  async getServerInfo(): Promise<ServerInfo> {
    const status = await this.getClient().getSystemStatus();

    return {
      name: 'Bazarr',
      version: status.bazarr_version,
      id: status.bazarr_config_directory ?? 'bazarr',
    };
  }

  async getActivity(since?: Date): Promise<readonly NormalizedActivity[]> {
    const client = this.getClient();

    const sections = await Promise.all([
      this.safely('episode history', () =>
        this.collectHistory(
          (length, start) => client.getEpisodeHistory(length, start),
          (rec) => this.normalizeEpisodeHistory(rec),
          since
        )
      ),
      this.safely('movie history', () =>
        this.collectHistory(
          (length, start) => client.getMovieHistory(length, start),
          (rec) => this.normalizeMovieHistory(rec),
          since
        )
      ),
      this.safely('health', async () =>
        (await client.getHealth()).map((issue) => this.normalizeHealthIssue(issue))
      ),
      this.safely('jobs', async () =>
        (await client.getJobs('failed'))
          .map((job) => this.normalizeFailedJob(job))
          .filter((activity) => since === undefined || activity.timestamp >= since)
      ),
    ]);

    // Partial failure is tolerated; if every source failed, surface the first error so the
    // poll marks the server unhealthy instead of reporting "connected, no activity".
    const failures = sections.filter((section) => section.error !== undefined);
    if (failures.length === sections.length) {
      throw failures[0]?.error;
    }

    return sections
      .flatMap((section) => section.items)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private getClient(): BazarrClient {
    if (this.client === null) {
      throw new Error('Not connected');
    }
    return this.client;
  }

  /** Run one activity source; a failing endpoint must not drop the others */
  private async safely(
    source: string,
    run: () => Promise<readonly NormalizedActivity[]>
  ): Promise<{ items: readonly NormalizedActivity[]; error?: unknown }> {
    try {
      return { items: await run() };
    } catch (error) {
      console.error(`[${this.id}] Failed to get ${source}:`, error);
      return { items: [], error };
    }
  }

  /**
   * Page through newest-first history. Without `since` only the latest page is read;
   * with `since`, pages are followed (max 3) until a short page or records older than the cutoff.
   */
  private async collectHistory<T extends BazarrHistoryBase>(
    fetchPage: (length: number, start: number) => Promise<readonly T[]>,
    normalize: (record: T) => NormalizedActivity,
    since: Date | undefined
  ): Promise<NormalizedActivity[]> {
    const cutoff = since !== undefined ? since.getTime() - HISTORY_SINCE_MARGIN_MS : undefined;
    const maxPages = cutoff !== undefined ? HISTORY_MAX_PAGES_WITH_SINCE : 1;
    const result: NormalizedActivity[] = [];
    let reachedEnd = false;

    for (let page = 0; page < maxPages; page++) {
      const records = await fetchPage(HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);

      let anyParsed = false;
      for (const record of records) {
        const parsed = parseBazarrTimestamp(record);
        anyParsed ||= parsed !== undefined;
        // Unparseable timestamps are kept; dedupe by stable id makes that safe
        if (cutoff === undefined || parsed === undefined || parsed.getTime() >= cutoff) {
          result.push(normalize(record));
        }
      }

      const oldest = records[records.length - 1];
      const oldestTime = oldest !== undefined ? parseBazarrTimestamp(oldest) : undefined;
      if (
        records.length < HISTORY_PAGE_SIZE ||
        // Nothing on this page has a usable time, so the cutoff can never be reached
        (cutoff !== undefined && !anyParsed) ||
        (cutoff !== undefined && oldestTime !== undefined && oldestTime.getTime() < cutoff)
      ) {
        reachedEnd = true;
        break;
      }
    }

    if (cutoff !== undefined && !reachedEnd) {
      console.warn(
        `[${this.id}] History paging stopped after ${maxPages} pages; older events may have been skipped`
      );
    }

    return result;
  }

  private historyId(kind: 'episode' | 'movie', record: BazarrHistoryBase, ref: unknown): string {
    const prefix = `bazarr-${kind}-history-`;
    if (typeof record.id === 'number') {
      return `${prefix}${record.id}`;
    }

    // Bazarr's API model omits the row id: derive a stable one from the record content.
    // The humanised `timestamp` changes over time, so only an absolute time is used.
    const when = parseBazarrTimestamp(record)?.toISOString() ?? null;
    return `${prefix}${stableHash(
      JSON.stringify([
        ref,
        record.action ?? null,
        when,
        record.description ?? null,
        record.subtitles_path ?? null,
        record.subs_id ?? null,
        record.provider ?? null,
        record.score ?? null,
        record.language?.code2 ?? record.language?.name ?? null,
      ])
    )}`;
  }

  private historyType(action: number | undefined): string {
    const label = action !== undefined ? BazarrHistoryActions[action] : undefined;
    return label !== undefined ? `subtitle_${label}` : 'subtitle_event';
  }

  private commonHistoryMetadata(record: BazarrHistoryBase): Record<string, unknown> {
    return {
      action: record.action,
      language: record.language?.name ?? record.language?.code2,
      forced: record.language?.forced,
      hi: record.language?.hi,
      provider: record.provider,
      score: record.score,
      subtitlesPath: record.subtitles_path,
      upgradable: record.upgradable,
      blacklisted: record.blacklisted,
    };
  }

  private normalizeEpisodeHistory(record: BazarrEpisodeHistory): NormalizedActivity {
    const name =
      record.seriesTitle !== undefined
        ? `${record.seriesTitle} ${record.episode_number ?? ''}`.trim()
        : 'Unknown';

    return {
      id: this.historyId('episode', record, [record.sonarrSeriesId, record.sonarrEpisodeId]),
      type: this.historyType(record.action),
      name,
      overview: record.description,
      severity: record.blacklisted === true ? 'warn' : 'info',
      itemId: record.sonarrEpisodeId !== undefined ? String(record.sonarrEpisodeId) : undefined,
      timestamp: parseBazarrTimestamp(record) ?? new Date(),
      metadata: {
        kind: 'episode',
        ...this.commonHistoryMetadata(record),
        episodeTitle: record.episodeTitle,
        sonarrSeriesId: record.sonarrSeriesId,
        sonarrEpisodeId: record.sonarrEpisodeId,
      },
    };
  }

  private normalizeMovieHistory(record: BazarrMovieHistory): NormalizedActivity {
    return {
      id: this.historyId('movie', record, [record.radarrId]),
      type: this.historyType(record.action),
      name: record.title ?? 'Unknown',
      overview: record.description,
      severity: record.blacklisted === true ? 'warn' : 'info',
      itemId: record.radarrId !== undefined ? String(record.radarrId) : undefined,
      timestamp: parseBazarrTimestamp(record) ?? new Date(),
      metadata: {
        kind: 'movie',
        ...this.commonHistoryMetadata(record),
        radarrId: record.radarrId,
      },
    };
  }

  /** Health issues are state, not events: the id is stable so a persistent issue is logged once */
  private normalizeHealthIssue(issue: BazarrHealthIssue): NormalizedActivity {
    return {
      id: `bazarr-health-${stableHash(`${issue.object}|${issue.issue}`)}`,
      type: 'health_warning',
      name: `Health issue: ${issue.object}`,
      overview: issue.issue,
      severity: 'warn',
      timestamp: new Date(),
      metadata: { object: issue.object, issue: issue.issue },
    };
  }

  private normalizeFailedJob(job: BazarrJob): NormalizedActivity {
    return {
      id: `bazarr-job-${idPart(job.job_id)}-${idPart(job.last_run_time ?? 'unknown')}`,
      type: 'job_failed',
      name: `Job failed: ${job.job_name}`,
      overview: job.progress_message ?? 'Background job failed',
      severity: 'error',
      timestamp: parseJobTime(job.last_run_time) ?? new Date(),
      metadata: {
        jobId: job.job_id,
        jobName: job.job_name,
        status: job.status,
        lastRunTime: job.last_run_time,
      },
    };
  }
}
