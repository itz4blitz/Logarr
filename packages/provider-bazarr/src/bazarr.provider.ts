import { BazarrClient } from './bazarr.client.js';
import {
  BAZARR_CORRELATION_PATTERNS,
  BAZARR_LOG_FILE_CONFIG,
  isBazarrLogContinuation,
  parseBazarrLogLine,
  parseBazarrLogLineWithContext,
} from './bazarr.parser.js';
import { BazarrHistoryActions } from './bazarr.types.js';
import { inferSlashDateOrder, parseBazarrTimestamp, stableHash } from './bazarr.utils.js';

import type {
  BazarrEpisodeHistory,
  BazarrHealthIssue,
  BazarrHistoryBase,
  BazarrJob,
  BazarrMovieHistory,
} from './bazarr.types.js';
import type { SlashDateOrder } from './bazarr.utils.js';
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
/**
 * Safety cap on history pages per endpoint per poll (40 x 50 = 2000 rows). Paging normally
 * ends earlier, at a short page or the first row older than the cutoff.
 */
const HISTORY_MAX_PAGES = 40;
/** How far back the first poll (no `since`) reads history, matching file-ingestion's default backfill */
const HISTORY_INITIAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Upper bound for remembered per-server slash-date orders */
const MAX_REMEMBERED_ORDERS = 32;
/**
 * History timestamps are naive local time of the Bazarr host, so the `since` cutoff is
 * widened by this margin to absorb timezone differences. Re-read rows are deduplicated
 * by their stable activity id.
 */
const HISTORY_SINCE_MARGIN_MS = 24 * 60 * 60 * 1000;

/** Anything with an explicit UTC offset can be parsed natively */
const ISO_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Result of fetching one activity source */
interface SourceResult {
  items: readonly NormalizedActivity[];
  /** Set when history paging was capped: rows newer than this must not advance the cursor */
  cursorCeiling?: Date;
}

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
  /** Slash-date order learned per Bazarr URL, used when a response is all-ambiguous */
  private readonly slashOrders = new Map<string, SlashDateOrder>();

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
          (rec, parsed) => this.normalizeEpisodeHistory(rec, parsed),
          since
        )
      ),
      this.safely('movie history', () =>
        this.collectHistory(
          (length, start) => client.getMovieHistory(length, start),
          (rec, parsed) => this.normalizeMovieHistory(rec, parsed),
          since
        )
      ),
      this.safely('health', async () => ({
        items: (await client.getHealth()).map((issue) => this.normalizeHealthIssue(issue)),
      })),
      this.safely('jobs', async () => {
        const cutoff = since !== undefined ? since.getTime() - HISTORY_SINCE_MARGIN_MS : undefined;
        return {
          items: (await client.getJobs('failed'))
            .map((job) => this.normalizeFailedJob(job))
            .filter((activity) => cutoff === undefined || activity.timestamp.getTime() >= cutoff),
        };
      }),
    ]);

    // Partial failure is tolerated; if every source failed, surface the first error so the
    // poll marks the server unhealthy instead of reporting "connected, no activity".
    const failures = sections.filter((section) => section.error !== undefined);
    if (failures.length === sections.length) {
      throw failures[0]?.error;
    }

    // If paging was capped, only rows at or before the oldest fetched history row may move
    // the sync cursor, so the next poll still reaches the events that were not fetched.
    const ceilings = sections.flatMap((section) =>
      section.cursorCeiling !== undefined ? [section.cursorCeiling.getTime()] : []
    );
    const ceiling = ceilings.length > 0 ? Math.min(...ceilings) : undefined;

    return sections
      .flatMap((section) => section.items)
      .map((activity) =>
        ceiling !== undefined &&
        activity.advancesSyncCursor !== false &&
        activity.timestamp.getTime() > ceiling
          ? { ...activity, advancesSyncCursor: false }
          : activity
      )
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
    run: () => Promise<SourceResult>
  ): Promise<SourceResult & { error?: unknown }> {
    try {
      return await run();
    } catch (error) {
      console.error(`[${this.id}] Failed to get ${source}:`, error);
      return { items: [], error };
    }
  }

  /** Slash-date order for one response: inferred from its rows, else the one learned earlier */
  private resolveSlashOrder(records: readonly BazarrHistoryBase[]): SlashDateOrder | undefined {
    const key = this.config?.url ?? '';
    const inferred = inferSlashDateOrder(records);

    if (inferred !== undefined) {
      if (!this.slashOrders.has(key) && this.slashOrders.size >= MAX_REMEMBERED_ORDERS) {
        const oldest = this.slashOrders.keys().next();
        if (oldest.done !== true) this.slashOrders.delete(oldest.value);
      }
      this.slashOrders.set(key, inferred);
      return inferred;
    }

    return this.slashOrders.get(key);
  }

  /**
   * Page through newest-first history until the oldest parseable row on a page is older
   * than the cutoff (`since` minus a timezone margin, or 7 days back on the first poll), a
   * page is short, or the safety cap is hit.
   *
   * Rows whose time could not be parsed fall back to "now" and never move the sync cursor or
   * the paging cutoff. If the cap is hit first, `cursorCeiling` is the oldest fetched
   * history time: rows newer than it must not advance the cursor.
   */
  private async collectHistory<T extends BazarrHistoryBase>(
    fetchPage: (length: number, start: number) => Promise<readonly T[]>,
    normalize: (record: T, parsed: Date | undefined) => NormalizedActivity,
    since: Date | undefined
  ): Promise<SourceResult> {
    const cutoff =
      since !== undefined
        ? since.getTime() - HISTORY_SINCE_MARGIN_MS
        : Date.now() - HISTORY_INITIAL_WINDOW_MS;
    const items: NormalizedActivity[] = [];
    let oldestFetched: number | undefined;
    let reachedEnd = false;

    for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
      const records = await fetchPage(HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);
      const order = this.resolveSlashOrder(records);

      let oldestOnPage: number | undefined;
      for (const record of records) {
        const parsed = parseBazarrTimestamp(record, order);
        if (parsed !== undefined) {
          const time = parsed.getTime();
          oldestOnPage = oldestOnPage === undefined ? time : Math.min(oldestOnPage, time);
          oldestFetched = oldestFetched === undefined ? time : Math.min(oldestFetched, time);
        }
        // Unparseable rows are kept (stable ids dedupe them) but are not trusted for the cutoff
        if (parsed === undefined || parsed.getTime() >= cutoff) {
          items.push(normalize(record, parsed));
        }
      }

      if (records.length < HISTORY_PAGE_SIZE) {
        reachedEnd = true;
        break;
      }
      if (oldestOnPage === undefined) {
        // Nothing on this page has a usable time, so the cutoff can never be proven
        console.warn(`[${this.id}] Could not parse any history timestamp; stopped paging`);
        reachedEnd = true;
        break;
      }
      if (oldestOnPage < cutoff) {
        reachedEnd = true;
        break;
      }
    }

    if (reachedEnd) {
      return { items };
    }

    console.warn(
      `[${this.id}] History paging stopped after ${HISTORY_MAX_PAGES} pages; older events are picked up on later polls`
    );
    return oldestFetched !== undefined
      ? { items, cursorCeiling: new Date(oldestFetched) }
      : { items };
  }

  private historyId(
    kind: 'episode' | 'movie',
    record: BazarrHistoryBase,
    parsed: Date | undefined,
    ref: unknown
  ): string {
    const prefix = `bazarr-${kind}-history-`;
    if (typeof record.id === 'number') {
      return `${prefix}${record.id}`;
    }

    // Bazarr's API model omits the row id: derive a stable one from the record content.
    // The humanised `timestamp` changes over time, so only an absolute time is used.
    const when = parsed?.toISOString() ?? null;
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

  private normalizeEpisodeHistory(
    record: BazarrEpisodeHistory,
    parsed: Date | undefined
  ): NormalizedActivity {
    const name =
      record.seriesTitle !== undefined
        ? `${record.seriesTitle} ${record.episode_number ?? ''}`.trim()
        : 'Unknown';

    return {
      id: this.historyId('episode', record, parsed, [
        record.sonarrSeriesId,
        record.sonarrEpisodeId,
      ]),
      type: this.historyType(record.action),
      name,
      overview: record.description,
      severity: record.blacklisted === true ? 'warn' : 'info',
      itemId: record.sonarrEpisodeId !== undefined ? String(record.sonarrEpisodeId) : undefined,
      timestamp: parsed ?? new Date(),
      advancesSyncCursor: parsed !== undefined,
      metadata: {
        kind: 'episode',
        ...this.commonHistoryMetadata(record),
        episodeTitle: record.episodeTitle,
        sonarrSeriesId: record.sonarrSeriesId,
        sonarrEpisodeId: record.sonarrEpisodeId,
      },
    };
  }

  private normalizeMovieHistory(
    record: BazarrMovieHistory,
    parsed: Date | undefined
  ): NormalizedActivity {
    return {
      id: this.historyId('movie', record, parsed, [record.radarrId]),
      type: this.historyType(record.action),
      name: record.title ?? 'Unknown',
      overview: record.description,
      severity: record.blacklisted === true ? 'warn' : 'info',
      itemId: record.radarrId !== undefined ? String(record.radarrId) : undefined,
      timestamp: parsed ?? new Date(),
      advancesSyncCursor: parsed !== undefined,
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
      // Stamped with the detection time, so it must not move the sync cursor
      advancesSyncCursor: false,
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
      // Failed jobs are state (the queue keeps them), not a history stream: never move the cursor
      advancesSyncCursor: false,
      metadata: {
        jobId: job.job_id,
        jobName: job.job_name,
        status: job.status,
        lastRunTime: job.last_run_time,
      },
    };
  }
}
