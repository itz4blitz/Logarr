import { BazarrClient } from './bazarr.client.js';
import { readHistory } from './bazarr.history.js';
import {
  BAZARR_CORRELATION_PATTERNS,
  BAZARR_LOG_FILE_CONFIG,
  isBazarrLogContinuation,
  parseBazarrLogLine,
  parseBazarrLogLineWithContext,
} from './bazarr.parser.js';
import { BazarrHistoryActions } from './bazarr.types.js';
import { inferSlashDateOrder, parseBazarrTimestamp, stableHash } from './bazarr.utils.js';

import type { HistoryRead } from './bazarr.history.js';
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
  error?: unknown;
}

/** Raw history rows seen during one poll, shared by both history sources */
class HistoryPoll {
  readonly records: BazarrHistoryBase[] = [];
  private cachedLength = -1;
  private cachedOrder: SlashDateOrder | undefined;

  constructor(private readonly learned: SlashDateOrder | undefined) {}

  /** Slash-date order inferred from every row seen so far, else the one learned earlier */
  order(): SlashDateOrder | undefined {
    if (this.cachedLength !== this.records.length) {
      this.cachedOrder = inferSlashDateOrder(this.records);
      this.cachedLength = this.records.length;
    }
    return this.cachedOrder ?? this.learned;
  }
}

/** A timestamp string that carries a calendar date (not "2 hours ago") */
const ABSOLUTE_TIMESTAMP = /\d{4}[/.-]\d{1,2}[/.-]\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/;

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
    const poll = new HistoryPoll(this.slashOrders.get(this.config?.url ?? ''));
    const cutoffMs =
      since !== undefined
        ? since.getTime() - HISTORY_SINCE_MARGIN_MS
        : Date.now() - HISTORY_INITIAL_WINDOW_MS;

    const [episodeRead, movieRead, health, jobs] = await Promise.all([
      this.attempt('episode history', () =>
        this.readSource<BazarrEpisodeHistory>(
          'episode',
          (length, start) => client.getEpisodeHistory(length, start),
          (rec) => [rec.sonarrSeriesId, rec.sonarrEpisodeId],
          poll,
          cutoffMs,
          since
        )
      ),
      this.attempt('movie history', () =>
        this.readSource<BazarrMovieHistory>(
          'movie',
          (length, start) => client.getMovieHistory(length, start),
          (rec) => [rec.radarrId],
          poll,
          cutoffMs,
          since
        )
      ),
      this.safely('health', async () => ({
        items: (await client.getHealth()).map((issue) => this.normalizeHealthIssue(issue)),
      })),
      this.safely('jobs', async () => ({
        items: (await client.getJobs('failed'))
          .map((job) => this.normalizeFailedJob(job))
          .filter((activity) => activity.timestamp.getTime() >= cutoffMs || since === undefined),
      })),
    ]);

    // Partial failure is tolerated; if every source failed, surface the first error so the
    // poll marks the server unhealthy instead of reporting "connected, no activity".
    const errors = [episodeRead.error, movieRead.error, health.error, jobs.error].filter(
      (error) => error !== undefined
    );
    if (errors.length === 4) {
      throw errors[0];
    }

    const order = this.rememberSlashOrder(poll);
    const episodes =
      episodeRead.value !== undefined
        ? this.finishHistory(
            episodeRead.value,
            (rec, parsed) => this.normalizeEpisodeHistory(rec, parsed),
            order,
            cutoffMs,
            since
          )
        : undefined;
    const movies =
      movieRead.value !== undefined
        ? this.finishHistory(
            movieRead.value,
            (rec, parsed) => this.normalizeMovieHistory(rec, parsed),
            order,
            cutoffMs,
            since
          )
        : undefined;

    // If either history source failed, its rows are missing: the other source must not move the
    // cursor past that gap. If paging was capped, only rows at or before the oldest ceiling may.
    const historyFailed = episodeRead.error !== undefined || movieRead.error !== undefined;
    const ceilings = [episodes?.cursorCeiling, movies?.cursorCeiling].flatMap((c) =>
      c !== undefined ? [c.getTime()] : []
    );
    const ceiling = ceilings.length > 0 ? Math.min(...ceilings) : undefined;

    return [episodes, movies, health, jobs]
      .flatMap((section) => section?.items ?? [])
      .map((activity) =>
        activity.advancesSyncCursor !== false &&
        (historyFailed || (ceiling !== undefined && activity.timestamp.getTime() > ceiling))
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

  /** Run one source; a failing endpoint must not drop the others */
  private async attempt<R>(
    source: string,
    run: () => Promise<R>
  ): Promise<{ value?: R; error?: unknown }> {
    try {
      return { value: await run() };
    } catch (error) {
      console.error(`[${this.id}] Failed to get ${source}:`, error);
      return { error };
    }
  }

  private async safely(
    source: string,
    run: () => Promise<{ items: readonly NormalizedActivity[] }>
  ): Promise<SourceResult> {
    const result = await this.attempt(source, run);
    return result.value ?? { items: [], error: result.error };
  }

  /** Slash-date order of the whole poll (every row of both sources); learned per server */
  private rememberSlashOrder(poll: HistoryPoll): SlashDateOrder | undefined {
    const key = this.config?.url ?? '';
    const inferred = inferSlashDateOrder(poll.records);

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

  private readSource<T extends BazarrHistoryBase>(
    kind: 'episode' | 'movie',
    fetchPage: (length: number, start: number) => Promise<readonly T[]>,
    refOf: (record: T) => unknown,
    poll: HistoryPoll,
    cutoffMs: number,
    since: Date | undefined
  ): Promise<HistoryRead<T>> {
    return readHistory<T>({
      fetchPage: async (length, start) => {
        const rows = await fetchPage(length, start);
        poll.records.push(...rows);
        return rows;
      },
      keyOf: (record) => this.historyId(kind, record, refOf(record)),
      timeOf: (record) => parseBazarrTimestamp(record, poll.order()),
      cutoffMs,
      sinceMs: since?.getTime(),
      warn: (message) => console.warn(`[${this.id}] ${message}`),
    });
  }

  /**
   * Turn raw rows into activities using the final slash-date order of the poll.
   * Only rows with a readable time may advance the cursor, never backwards past `since`, and in
   * a capped read never past its newest certain row. Unsafe reads never move the cursor.
   */
  private finishHistory<T extends BazarrHistoryBase>(
    read: HistoryRead<T>,
    normalize: (record: T, parsed: Date | undefined) => NormalizedActivity,
    order: SlashDateOrder | undefined,
    cutoffMs: number,
    since: Date | undefined
  ): SourceResult {
    const ceiling =
      read.mode === 'capped' && read.edge !== undefined
        ? parseBazarrTimestamp(read.edge, order)
        : undefined;
    const trusted = read.mode === 'complete' || (read.mode === 'capped' && ceiling !== undefined);
    const items: NormalizedActivity[] = [];

    for (const record of read.rows) {
      const parsed = parseBazarrTimestamp(record, order);
      if (parsed !== undefined && parsed.getTime() < cutoffMs) continue;

      const advances =
        trusted &&
        parsed !== undefined &&
        (since === undefined || parsed.getTime() >= since.getTime()) &&
        (ceiling === undefined || parsed.getTime() <= ceiling.getTime());
      items.push({ ...normalize(record, parsed), advancesSyncCursor: advances });
    }

    return ceiling !== undefined ? { items, cursorCeiling: ceiling } : { items };
  }

  /**
   * Stable id of a history row. It hashes the RAW timestamp text, never an interpreted Date, so
   * the same row always gets the same id whatever date order was inferred or learned.
   * The humanised `timestamp` ("2 hours ago") changes over time and is only used if it looks absolute.
   */
  private historyId(kind: 'episode' | 'movie', record: BazarrHistoryBase, ref: unknown): string {
    const prefix = `bazarr-${kind}-history-`;
    if (typeof record.id === 'number') {
      return `${prefix}${record.id}`;
    }

    const stamp =
      record.parsed_timestamp ??
      (record.timestamp !== undefined && ABSOLUTE_TIMESTAMP.test(record.timestamp)
        ? record.timestamp
        : null);
    return `${prefix}${stableHash(
      JSON.stringify([
        ref,
        record.action ?? null,
        stamp,
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
      id: this.historyId('episode', record, [record.sonarrSeriesId, record.sonarrEpisodeId]),
      type: this.historyType(record.action),
      name,
      overview: record.description,
      severity: record.blacklisted === true ? 'warn' : 'info',
      itemId: record.sonarrEpisodeId !== undefined ? String(record.sonarrEpisodeId) : undefined,
      timestamp: parsed ?? new Date(),
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
      id: this.historyId('movie', record, [record.radarrId]),
      type: this.historyType(record.action),
      name: record.title ?? 'Unknown',
      overview: record.description,
      severity: record.blacklisted === true ? 'warn' : 'info',
      itemId: record.radarrId !== undefined ? String(record.radarrId) : undefined,
      timestamp: parsed ?? new Date(),
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
