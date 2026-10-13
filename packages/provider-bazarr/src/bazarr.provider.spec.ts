import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BAZARR_LOG_FILE_CONFIG } from './bazarr.parser.js';
import { BazarrProvider } from './bazarr.provider.js';

import type { BazarrEpisodeHistory, BazarrMovieHistory } from './bazarr.types.js';
import type { NormalizedActivity } from '@logarr/core';

const mockFetch = vi.fn();

function ok(body: unknown): { ok: true; status: number; json: () => Promise<unknown> } {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function fail(status: number, statusText: string): unknown {
  return { ok: false, status, statusText, text: () => Promise.resolve('x') };
}

type RouteValue = unknown;

interface Routes {
  status?: RouteValue;
  episodes?: RouteValue;
  movies?: RouteValue;
  health?: RouteValue;
  jobs?: RouteValue;
}

/** Route fetch by path, since the four activity sections run concurrently */
function route(routes: Routes): void {
  mockFetch.mockImplementation((input: unknown) => {
    const url = new URL(String(input));
    const path = url.pathname;
    const pick = (value: unknown): unknown => (typeof value === 'function' ? value(url) : value);

    if (path.endsWith('/system/status'))
      return Promise.resolve(pick(routes.status ?? ok({ data: { bazarr_version: '1.6.2' } })));
    if (path.endsWith('/episodes/history'))
      return Promise.resolve(pick(routes.episodes ?? ok({ data: [], total: 0 })));
    if (path.endsWith('/movies/history'))
      return Promise.resolve(pick(routes.movies ?? ok({ data: [], total: 0 })));
    if (path.endsWith('/system/health'))
      return Promise.resolve(pick(routes.health ?? ok({ data: [] })));
    if (path.endsWith('/system/jobs'))
      return Promise.resolve(pick(routes.jobs ?? ok({ data: [] })));
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const episode: BazarrEpisodeHistory = {
  id: 11,
  seriesTitle: 'Show',
  episode_number: '1x2',
  episodeTitle: 'Pilot',
  description: 'English subtitles downloaded from opensubtitlescom with a score of 95%.',
  action: 1,
  provider: 'opensubtitlescom',
  score: '95%',
  language: { name: 'English', code2: 'en', forced: false, hi: false },
  sonarrSeriesId: 5,
  sonarrEpisodeId: 7,
  parsed_timestamp: '2026-10-09 12:00:00',
};

const movie: BazarrMovieHistory = {
  id: 3,
  title: 'Film',
  radarrId: 9,
  description: 'Czech subtitles upgraded from podnapisi with a score of 99%.',
  action: 3,
  provider: 'podnapisi',
  score: '99%',
  language: { name: 'Czech', code2: 'cs' },
  parsed_timestamp: '10/10/26 11:30:00',
};

async function connected(url = 'http://bazarr:6767'): Promise<BazarrProvider> {
  const provider = new BazarrProvider();
  await provider.connect({ url, apiKey: 'key' });
  return provider;
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  // Pin "now" (Date only) so the first-poll window (7 days) is deterministic
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 10, 13, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockFetch.mockReset();
});

describe('BazarrProvider identity', () => {
  const provider = new BazarrProvider();

  it('has id and name', () => {
    expect(provider.id).toBe('bazarr');
    expect(provider.name).toBe('Bazarr');
  });

  it('declares only implemented capabilities', () => {
    expect(provider.capabilities).toEqual({
      supportsRealTimeLogs: false,
      supportsActivityLog: true,
      supportsSessions: false,
      supportsWebhooks: false,
      supportsPlaybackHistory: false,
    });
  });

  it('returns no sessions or users', async () => {
    await expect(provider.getSessions()).resolves.toEqual([]);
    await expect(provider.getUsers()).resolves.toEqual([]);
  });

  it('exposes log file config and correlation patterns', () => {
    expect(provider.getLogFileConfig()).toBe(BAZARR_LOG_FILE_CONFIG);
    expect(Array.isArray(provider.getCorrelationPatterns())).toBe(true);
  });

  it('delegates log line parsing', () => {
    const line = '2026-10-10 12:00:01|INFO    |root                            |hello|';

    expect(provider.parseLogLine(line)?.message).toBe('hello');
    expect(provider.isLogContinuation('more|')).toBe(true);
    expect(provider.isLogContinuation(line)).toBe(false);
    expect(
      provider.parseLogLineWithContext(line, {
        continuationLines: [],
        filePath: 'f',
        lineNumber: 1,
      }).entry?.message
    ).toBe('hello');
  });

  it('returns default log paths', async () => {
    const paths = await provider.getLogPaths();

    expect(paths).toContain('/bazarr-logs');
    expect(paths).toContain('/config/log');
  });

  it('honours a configured log path', async () => {
    const custom = new BazarrProvider();
    mockFetch.mockResolvedValue(ok({ data: { bazarr_version: '1.6.2' } }));
    await custom.connect({ url: 'http://bazarr:6767', apiKey: 'key', logPath: '/my/logs' });

    await expect(custom.getLogPaths()).resolves.toEqual(['/my/logs']);
  });
});

describe('BazarrProvider connection', () => {
  it('tests connection against the authenticated status endpoint', async () => {
    route({
      status: ok({ data: { bazarr_version: '1.6.2', bazarr_config_directory: '/config' } }),
    });
    const provider = await connected();
    const result = await provider.testConnection();

    expect(result).toEqual({
      connected: true,
      serverInfo: { name: 'Bazarr', version: '1.6.2', id: '/config' },
    });
    const [url, init] = mockFetch.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe('http://bazarr:6767/api/system/status');
    expect(init.headers['X-API-KEY']).toBe('key');
  });

  it('does not double the slash for a trailing-slash URL', async () => {
    route({});
    await connected('http://bazarr:6767/');

    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://bazarr:6767/api/system/status');
  });

  it('supports a base_url sub-path', async () => {
    route({});
    await connected('http://h/bazarr');

    expect(mockFetch.mock.calls[0]?.[0]).toBe('http://h/bazarr/api/system/status');
  });

  it('falls back to a generic id when no config directory is reported', async () => {
    route({});
    const provider = await connected();

    await expect(provider.getServerInfo()).resolves.toEqual({
      name: 'Bazarr',
      version: '1.6.2',
      id: 'bazarr',
    });
  });

  it('reports an authentication failure on 401', async () => {
    mockFetch.mockResolvedValue(fail(401, 'Unauthorized'));
    const provider = new BazarrProvider();

    await expect(provider.connect({ url: 'http://bazarr:6767', apiKey: 'bad' })).rejects.toThrow(
      /401/
    );
    await expect(provider.connect({ url: 'http://bazarr:6767', apiKey: 'bad' })).rejects.toThrow(
      /Authentication failed/
    );
  });

  it('returns connected:false when the status call fails after connect', async () => {
    route({});
    const provider = await connected();
    route({ status: fail(401, 'Unauthorized') });
    const result = await provider.testConnection();

    expect(result.connected).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  it('rejects a response without a data envelope', async () => {
    mockFetch.mockResolvedValue(ok({ bazarr_version: '1.6.2' }));
    const provider = new BazarrProvider();

    await expect(provider.connect({ url: 'http://bazarr:6767', apiKey: 'key' })).rejects.toThrow(
      /Unexpected Bazarr response/
    );
  });

  it('is not initialised before connect', async () => {
    const provider = new BazarrProvider();

    await expect(provider.testConnection()).resolves.toEqual({
      connected: false,
      error: 'Not initialized',
    });
    await expect(provider.getActivity()).rejects.toThrow(new Error('Not connected'));
    await expect(provider.getServerInfo()).rejects.toThrow(new Error('Not connected'));
  });

  it('forgets the client on disconnect', async () => {
    route({});
    const provider = await connected();
    await provider.disconnect();

    await expect(provider.testConnection()).resolves.toEqual({
      connected: false,
      error: 'Not initialized',
    });
  });
});

describe('BazarrProvider.getActivity', () => {
  const allRoutes: Routes = {
    episodes: ok({ data: [episode], total: 1 }),
    movies: ok({ data: [movie], total: 1 }),
    health: ok({ data: [{ object: '/tv', issue: 'Path does not exist' }] }),
    jobs: ok({
      data: [
        {
          job_id: 42,
          job_name: 'Update Series',
          status: 'failed',
          last_run_time: '2026-10-10 11:00:00',
        },
      ],
    }),
  };

  it('normalizes history, health and failed jobs', async () => {
    route(allRoutes);
    const provider = await connected();
    const activity = await provider.getActivity();
    const byId = new Map(activity.map((a) => [a.id, a]));

    const ep = byId.get('bazarr-episode-history-11');
    expect(ep).toMatchObject({
      type: 'subtitle_download',
      name: 'Show 1x2',
      overview: episode.description,
      severity: 'info',
      itemId: '7',
    });
    expect(ep?.timestamp).toEqual(new Date(2026, 9, 9, 12, 0, 0));
    expect(ep?.metadata).toMatchObject({
      kind: 'episode',
      language: 'English',
      provider: 'opensubtitlescom',
      sonarrSeriesId: 5,
      sonarrEpisodeId: 7,
    });

    const mv = byId.get('bazarr-movie-history-3');
    expect(mv).toMatchObject({
      type: 'subtitle_upgrade',
      name: 'Film',
      severity: 'info',
      itemId: '9',
    });
    expect(mv?.timestamp).toEqual(new Date(2026, 9, 10, 11, 30, 0));

    const health = activity.find((a) => a.type === 'health_warning');
    expect(health?.id).toMatch(/^bazarr-health-[0-9a-f]+$/);
    expect(health).toMatchObject({
      name: 'Health issue: /tv',
      overview: 'Path does not exist',
      severity: 'warn',
    });

    expect(byId.get('bazarr-job-42-2026-10-10-11-00-00')).toMatchObject({
      type: 'job_failed',
      name: 'Job failed: Update Series',
      severity: 'error',
    });
    expect(activity).toHaveLength(4);
  });

  it('sorts newest first', async () => {
    route(allRoutes);
    const provider = await connected();
    const activity = await provider.getActivity();
    const times = activity.map((a) => a.timestamp.getTime());

    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('produces identical ids across polls (dedupe contract)', async () => {
    route(allRoutes);
    const provider = await connected();
    const first = (await provider.getActivity()).map((a) => a.id).sort();
    const second = (await provider.getActivity()).map((a) => a.id).sort();

    expect(second).toEqual(first);
  });

  it('requests failed jobs and 50-row history pages', async () => {
    route(allRoutes);
    const provider = await connected();
    await provider.getActivity();
    const urls = mockFetch.mock.calls.map((c) => new URL(String(c[0])));

    const jobs = urls.find((u) => u.pathname.endsWith('/system/jobs'));
    expect(jobs?.searchParams.get('status')).toBe('failed');
    const eps = urls.find((u) => u.pathname.endsWith('/episodes/history'));
    expect(eps?.searchParams.get('start')).toBe('0');
    expect(eps?.searchParams.get('length')).toBe('50');
  });

  it('flags blacklisted history as warn and labels unknown actions', async () => {
    route({
      episodes: ok({ data: [{ ...episode, blacklisted: true, action: 99 }] }),
    });
    const provider = await connected();
    const [item] = await provider.getActivity();

    expect(item?.severity).toBe('warn');
    expect(item?.type).toBe('subtitle_event');
  });

  it('labels the verified action codes', async () => {
    const records = [0, 1, 2, 3, 4, 5, 6].map((action) => ({
      ...episode,
      id: 100 + action,
      action,
    }));
    route({ episodes: ok({ data: records }) });
    const provider = await connected();
    const types = (await provider.getActivity()).map((a) => a.type).sort();

    expect(types).toEqual([
      'subtitle_delete',
      'subtitle_download',
      'subtitle_manual',
      'subtitle_sync',
      'subtitle_translated',
      'subtitle_upgrade',
      'subtitle_upload',
    ]);
  });

  it('derives a stable id when Bazarr does not expose the row id', async () => {
    const { id: _id, parsed_timestamp: _parsed, ...noId } = episode;
    const rec = { ...noId, timestamp: '2 hours ago', parsed_timestamp: '10/10/26 10:00:00' };
    route({ episodes: ok({ data: [rec] }) });
    const provider = await connected();
    const first = await provider.getActivity();
    route({ episodes: ok({ data: [{ ...rec, timestamp: '3 hours ago' }] }) });
    const second = await provider.getActivity();

    expect(first[0]?.id).toMatch(/^bazarr-episode-history-[0-9a-f]{16}$/);
    expect(second[0]?.id).toBe(first[0]?.id);
    expect(first[0]?.timestamp).toEqual(new Date(2026, 9, 10, 10, 0, 0));
  });

  it('derives different ids for different events', async () => {
    const { id: _id, parsed_timestamp: _parsed, ...noId } = episode;
    route({
      episodes: ok({
        data: [
          { ...noId, parsed_timestamp: '10/10/26 10:00:00' },
          { ...noId, parsed_timestamp: '10/10/26 10:05:00' },
        ],
      }),
    });
    const provider = await connected();
    const ids = (await provider.getActivity()).map((a) => a.id);

    expect(new Set(ids).size).toBe(2);
  });

  it('falls back to now for unparseable timestamps', async () => {
    const { parsed_timestamp: _parsed, ...rest } = episode;
    route({ episodes: ok({ data: [{ ...rest, timestamp: 'garbage' }] }) });
    const provider = await connected();
    const before = Date.now();
    const [item] = await provider.getActivity();

    expect(item?.timestamp.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('keeps other sections when one endpoint fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    route({ ...allRoutes, health: fail(404, 'Not Found') });
    const provider = await connected();
    const activity = await provider.getActivity();

    expect(activity.map((a) => a.type).sort()).toEqual([
      'job_failed',
      'subtitle_download',
      'subtitle_upgrade',
    ]);
    expect(errorSpy).toHaveBeenCalledWith('[bazarr] Failed to get health:', expect.any(Error));
  });

  it('rethrows the first error when every source fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = fail(404, 'Not Found');
    route({ episodes: down, movies: down, health: down, jobs: down });
    const provider = await connected();

    await expect(provider.getActivity()).rejects.toThrow(/Bazarr API error/);
    for (const source of ['episode history', 'movie history', 'health', 'jobs']) {
      expect(errorSpy).toHaveBeenCalledWith(`[bazarr] Failed to get ${source}:`, expect.any(Error));
    }
  });

  it('warns when history paging is capped before reaching the cutoff', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    route({
      episodes: () =>
        ok({
          data: Array.from({ length: 50 }, (_, i) => ({
            id: i + 1,
            parsed_timestamp: '2026-10-10 12:00:00',
          })),
        }),
    });
    const provider = await connected();
    await provider.getActivity(new Date(2026, 9, 10, 11, 0, 0));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[bazarr] History paging stopped')
    );
  });

  it('filters history older than since (with a timezone safety margin)', async () => {
    const old: BazarrEpisodeHistory = {
      ...episode,
      id: 12,
      parsed_timestamp: '2026-10-01 10:00:00',
    };
    const fresh: BazarrEpisodeHistory = {
      ...episode,
      id: 13,
      parsed_timestamp: '10/10/26 12:30:00',
    };
    route({ episodes: ok({ data: [fresh, old] }) });
    const provider = await connected();
    const activity = await provider.getActivity(new Date(2026, 9, 10, 12, 0, 0));
    const ids = activity.map((a) => a.id);

    expect(ids).toContain('bazarr-episode-history-13');
    expect(ids).not.toContain('bazarr-episode-history-12');
  });

  it('filters failed jobs older than since', async () => {
    route(allRoutes);
    const provider = await connected();
    const activity = await provider.getActivity(new Date(2026, 9, 20));

    expect(activity.some((a) => a.type === 'job_failed')).toBe(false);
  });

  describe('history paging', () => {
    const HOUR = 60 * 60 * 1000;
    const NOW = new Date(2026, 9, 10, 13, 0, 0).getTime();

    /** Pad a number for `YYYY-MM-DD HH:mm:ss` */
    function stamp(ms: number): string {
      const d = new Date(ms);
      const p = (n: number): string => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }

    /** Newest-first server-side history: row i happened `i * stepMs` before `from` */
    function history(total: number, stepMs: number, from = NOW): BazarrEpisodeHistory[] {
      return Array.from({ length: total }, (_, i) => ({
        ...episode,
        id: i + 1,
        parsed_timestamp: stamp(from - i * stepMs),
      }));
    }

    /** Serve `rows` honouring start/length like Bazarr */
    function serve(rows: readonly BazarrEpisodeHistory[]): (url: URL) => unknown {
      return (url: URL) => {
        const start = Number(url.searchParams.get('start'));
        const length = Number(url.searchParams.get('length'));
        return ok({ data: rows.slice(start, start + length), total: rows.length });
      };
    }

    function historyCalls(): URL[] {
      return mockFetch.mock.calls
        .map((c) => new URL(String(c[0])))
        .filter((u) => u.pathname.endsWith('/episodes/history'));
    }

    function downloads(activity: readonly { type: string }[]): number {
      return activity.filter((a) => a.type === 'subtitle_download').length;
    }

    it('pages back over a 7 day window on the first poll', async () => {
      route({ episodes: serve(history(120, HOUR)) });
      const provider = await connected();
      const activity = await provider.getActivity();

      expect(historyCalls().map((u) => u.searchParams.get('start'))).toEqual(['0', '50', '100']);
      expect(downloads(activity)).toBe(120);
    });

    it('stops the first poll at the 7 day window', async () => {
      route({ episodes: serve(history(400, HOUR)) });
      const provider = await connected();
      const activity = await provider.getActivity();

      // 168h = row 168 is exactly at the cutoff (kept); page 4 (rows 150-199) holds it
      expect(historyCalls()).toHaveLength(4);
      expect(downloads(activity)).toBe(169);
    });

    it('keeps paging with since until a row is older than the cutoff', async () => {
      const since = new Date(NOW - 30 * HOUR);
      route({ episodes: serve(history(500, 10 * 60 * 1000)) });
      const provider = await connected();
      const activity = await provider.getActivity(since);

      // cutoff = since - 24h = 54h back = 324 rows at 10 minute spacing -> 7 pages
      expect(historyCalls()).toHaveLength(7);
      expect(downloads(activity)).toBe(325);
    });

    it('stops on a short page', async () => {
      route({ episodes: serve(history(60, HOUR)) });
      const provider = await connected();
      await provider.getActivity(new Date(NOW - 100 * HOUR));

      expect(historyCalls()).toHaveLength(2);
    });

    it('stops once the oldest record is older than the cutoff', async () => {
      route({ episodes: ok({ data: history(50, 24 * HOUR) }) });
      const provider = await connected();
      await provider.getActivity(new Date(NOW - HOUR));

      expect(historyCalls()).toHaveLength(1);
    });

    it('stops after the first page when no row on it has a parseable time', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      route({
        episodes: ok({
          data: Array.from({ length: 50 }, (_, i) => ({ id: i + 1, timestamp: 'recently' })),
        }),
      });
      const provider = await connected();
      const activity = await provider.getActivity(new Date(NOW - HOUR));

      expect(historyCalls()).toHaveLength(1);
      expect(downloads(activity)).toBe(0);
      expect(activity.filter((a) => a.type === 'subtitle_event')).toHaveLength(50);
    });

    describe('when the safety cap is hit', () => {
      it('caps at 40 pages, warns and keeps rows newer than the oldest fetched row off the cursor', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const rows = history(3000, 60 * 1000);
        route({
          episodes: serve(rows),
          health: ok({ data: [{ object: '/tv', issue: 'Path does not exist' }] }),
        });
        const provider = await connected();
        const activity = await provider.getActivity(new Date(NOW - 10 * 24 * HOUR));

        expect(historyCalls()).toHaveLength(40);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[bazarr] History paging stopped')
        );

        const oldestFetched = NOW - 1999 * 60 * 1000;
        const advancing = activity.filter((a) => a.advancesSyncCursor !== false);
        expect(advancing).toHaveLength(1);
        expect(advancing[0]?.timestamp.getTime()).toBe(oldestFetched);
        expect(activity.filter((a) => a.advancesSyncCursor === false)).toHaveLength(
          activity.length - 1
        );
      });

      it('applies the lowest ceiling of any capped source to rows from the other sources', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        route({
          episodes: serve(history(3000, 60 * 1000)),
          movies: ok({ data: [{ ...movie, parsed_timestamp: stamp(NOW - 1000) }] }),
        });
        const provider = await connected();
        const activity = await provider.getActivity(new Date(NOW - 10 * 24 * HOUR));
        const film = activity.find((a) => a.id === 'bazarr-movie-history-3');

        expect(film?.advancesSyncCursor).toBe(false);
      });
    });

    it('lets every parsed history row advance the cursor when paging completes', async () => {
      route({ episodes: ok({ data: history(5, HOUR) }) });
      const provider = await connected();
      const activity = await provider.getActivity();

      expect(activity.every((a) => a.advancesSyncCursor === true)).toBe(true);
    });

    it('never lets health, failed-job or unparsed rows advance the cursor', async () => {
      route({
        episodes: ok({
          data: [
            { ...episode, id: 1, parsed_timestamp: stamp(NOW - HOUR) },
            { id: 2, timestamp: 'recently' },
          ],
        }),
        health: ok({ data: [{ object: '/tv', issue: 'Path does not exist' }] }),
        jobs: ok({
          data: [{ job_id: 1, job_name: 'x', status: 'failed', last_run_time: stamp(NOW - HOUR) }],
        }),
      });
      const provider = await connected();
      const activity = await provider.getActivity();
      const flag = (id: string): boolean | undefined =>
        activity.find((a) => a.id.startsWith(id))?.advancesSyncCursor;

      expect(flag('bazarr-episode-history-1')).toBe(true);
      expect(flag('bazarr-episode-history-2')).toBe(false);
      expect(flag('bazarr-health-')).toBe(false);
      expect(flag('bazarr-job-1-')).toBe(false);
    });
  });

  describe('slash date order', () => {
    function rows(...stamps: string[]): BazarrEpisodeHistory[] {
      return stamps.map((parsed_timestamp, i) => ({ ...episode, id: i + 1, parsed_timestamp }));
    }

    it('reads 05/10/26 as 5 October when the response is day-first', async () => {
      route({ episodes: ok({ data: rows('05/10/26 08:00:00', '30/09/26 10:00:00') }) });
      const provider = await connected();
      const activity = await provider.getActivity(new Date(2026, 8, 1));
      const byId = new Map(activity.map((a) => [a.id, a]));

      expect(byId.get('bazarr-episode-history-1')?.timestamp).toEqual(
        new Date(2026, 9, 5, 8, 0, 0)
      );
      expect(byId.get('bazarr-episode-history-2')?.timestamp).toEqual(
        new Date(2026, 8, 30, 10, 0, 0)
      );
      expect(byId.get('bazarr-episode-history-1')?.advancesSyncCursor).toBe(true);
    });

    it('reads 05/10/26 as 10 May when the response is month-first', async () => {
      route({ episodes: ok({ data: rows('05/10/26 08:00:00', '05/13/26 10:00:00') }) });
      const provider = await connected();
      const activity = await provider.getActivity(new Date(2026, 3, 1));
      const first = activity.find((a) => a.id === 'bazarr-episode-history-1');

      expect(first?.timestamp).toEqual(new Date(2026, 4, 10, 8, 0, 0));
    });

    it('treats an all-ambiguous response as unparsed: fallback time, off the cursor and cutoff', async () => {
      route({ episodes: ok({ data: rows('05/10/26 08:00:00', '04/10/26 08:00:00') }) });
      const provider = await connected();
      const activity = await provider.getActivity(new Date(2026, 9, 9));

      expect(activity).toHaveLength(2);
      for (const a of activity) {
        expect(a.timestamp).toEqual(new Date(new Date(2026, 9, 10, 13, 0, 0).getTime()));
        expect(a.advancesSyncCursor).toBe(false);
      }
    });

    it('reuses the order learned from an earlier response of the same server', async () => {
      route({ episodes: ok({ data: rows('05/10/26 08:00:00', '30/09/26 10:00:00') }) });
      const provider = await connected();
      await provider.getActivity(new Date(2026, 8, 1));

      route({ episodes: ok({ data: rows('06/10/26 09:00:00') }) });
      const [later] = await provider.getActivity(new Date(2026, 9, 1));

      expect(later?.timestamp).toEqual(new Date(2026, 9, 6, 9, 0, 0));
      expect(later?.advancesSyncCursor).toBe(true);
    });

    it('does not apply an order learned from another server', async () => {
      route({ episodes: ok({ data: rows('05/10/26 08:00:00', '30/09/26 10:00:00') }) });
      const first = await connected('http://one:6767');
      await first.getActivity(new Date(2026, 8, 1));

      route({ episodes: ok({ data: rows('06/10/26 09:00:00') }) });
      const second = await connected('http://two:6767');
      const [row] = await second.getActivity(new Date(2026, 9, 1));

      expect(row?.advancesSyncCursor).toBe(false);
    });
  });
});

describe('BazarrProvider.getServerInfo', () => {
  it('returns name, version and config directory as id', async () => {
    route({
      status: ok({ data: { bazarr_version: '1.6.2', bazarr_config_directory: '/config' } }),
    });
    const provider = await connected();

    await expect(provider.getServerInfo()).resolves.toEqual({
      name: 'Bazarr',
      version: '1.6.2',
      id: '/config',
    });
  });

  it('falls back to a generic id', async () => {
    route({});
    const provider = await connected();

    await expect(provider.getServerInfo()).resolves.toMatchObject({ id: 'bazarr' });
  });
});

describe('BazarrProvider.getActivity robustness', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  async function activity(routes: Routes, since?: Date): Promise<readonly NormalizedActivity[]> {
    route(routes);
    const provider = await connected();
    return provider.getActivity(since);
  }

  it('returns an empty list when Bazarr has nothing to report', async () => {
    await expect(activity({})).resolves.toEqual([]);
  });

  it('drops a section whose payload is not an array but keeps the others', async () => {
    const result = await activity({
      episodes: ok({ data: { unexpected: true } }),
      movies: ok({ data: [movie] }),
      health: ok({ data: null }),
    });

    expect(result.map((a) => a.id)).toEqual(['bazarr-movie-history-3']);
  });

  it('keeps history when every other endpoint fails', async () => {
    vi.useFakeTimers();
    try {
      route({
        episodes: ok({ data: [episode] }),
        movies: fail(401, 'Unauthorized'),
        health: fail(401, 'Unauthorized'),
        jobs: fail(401, 'Unauthorized'),
      });
      const provider = await connected();
      const pending = provider.getActivity();
      await vi.runAllTimersAsync();

      const result = await pending;
      expect(result.map((a) => a.id)).toEqual(['bazarr-episode-history-11']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('names episodes without a title or number sensibly', async () => {
    const result = await activity({
      episodes: ok({
        data: [
          { id: 1, seriesTitle: 'Show', parsed_timestamp: '2026-10-09 12:00:00' },
          { id: 2, parsed_timestamp: '2026-10-09 12:00:01' },
        ],
      }),
    });

    expect(result.find((a) => a.id.endsWith('-1'))?.name).toBe('Show');
    expect(result.find((a) => a.id.endsWith('-2'))?.name).toBe('Unknown');
    expect(result.find((a) => a.id.endsWith('-2'))?.itemId).toBeUndefined();
  });

  it('names movies without a title Unknown and omits itemId without radarrId', async () => {
    const [entry] = await activity({
      movies: ok({ data: [{ id: 9, parsed_timestamp: '2026-10-09 12:00:00' }] }),
    });

    expect(entry?.name).toBe('Unknown');
    expect(entry?.itemId).toBeUndefined();
    expect(entry?.type).toBe('subtitle_event');
  });

  it('does not filter health issues by since (they are state)', async () => {
    const result = await activity(
      { health: ok({ data: [{ object: '/tv', issue: 'Path does not exist' }] }) },
      new Date(Date.now() + 60_000)
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.type).toBe('health_warning');
  });

  it('gives different health issues different ids, and the same issue the same id', async () => {
    const result = await activity({
      health: ok({
        data: [
          { object: '/tv', issue: 'Path does not exist' },
          { object: '/movies', issue: 'Path does not exist' },
          { object: '/tv', issue: 'Path does not exist' },
        ],
      }),
    });

    expect(new Set(result.map((a) => a.id)).size).toBe(2);
  });

  describe('failed jobs', () => {
    const job = (extra: Record<string, unknown>): Record<string, unknown> => ({
      job_id: 1,
      job_name: 'Sync',
      status: 'failed',
      ...extra,
    });

    it('parses an ISO job time with a UTC designator natively', async () => {
      const [entry] = await activity({
        jobs: ok({ data: [job({ last_run_time: '2026-10-10T11:00:00Z' })] }),
      });

      expect(entry?.timestamp).toEqual(new Date('2026-10-10T11:00:00Z'));
    });

    it('honours a numeric offset such as +02:00', async () => {
      const [entry] = await activity({
        jobs: ok({ data: [job({ last_run_time: '2026-10-10T11:00:00+02:00' })] }),
      });

      expect(entry?.timestamp).toEqual(new Date('2026-10-10T09:00:00Z'));
    });

    it('treats a zone-less job time as naive local time', async () => {
      const [entry] = await activity({
        jobs: ok({ data: [job({ last_run_time: '2026-10-10 11:00:00' })] }),
      });

      expect(entry?.timestamp).toEqual(new Date(2026, 9, 10, 11, 0, 0));
    });

    // parseJobTime() only trusts strict ISO-8601 values with an offset; garbage that merely
    // ends in an offset-looking suffix must fall back to "now" instead of a bogus V8 date.
    it('falls back to now for an unparseable job time with an offset-looking suffix', async () => {
      const before = Date.now();
      const [entry] = await activity({
        jobs: ok({ data: [job({ last_run_time: 'nonsense+0200' })] }),
      });

      expect(entry?.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    });

    it('uses the progress message as overview and a default otherwise', async () => {
      const result = await activity({
        jobs: ok({
          data: [
            job({ job_id: 1, progress_message: 'disk full' }),
            job({ job_id: 2, progress_message: null }),
          ],
        }),
      });

      expect(result.find((a) => a.id.startsWith('bazarr-job-1'))?.overview).toBe('disk full');
      expect(result.find((a) => a.id.startsWith('bazarr-job-2'))?.overview).toBe(
        'Background job failed'
      );
    });

    it('builds a stable id with "unknown" when there is no run time, and supports string ids', async () => {
      const result = await activity({
        jobs: ok({ data: [job({ job_id: 'abc', last_run_time: null }), job({ job_id: 'abc' })] }),
      });

      expect(result.map((a) => a.id)).toEqual(['bazarr-job-abc-unknown', 'bazarr-job-abc-unknown']);
    });

    it('gives a re-run of the same job a new id when last_run_time changes', async () => {
      const result = await activity({
        jobs: ok({
          data: [
            job({ job_id: 5, last_run_time: '2026-10-10 11:00:00' }),
            job({ job_id: 5, last_run_time: '2026-10-10 12:00:00' }),
          ],
        }),
      });

      expect(new Set(result.map((a) => a.id)).size).toBe(2);
    });
  });

  describe('history timestamps and ids', () => {
    it('does not drop records with unparseable timestamps when since is set', async () => {
      const result = await activity(
        { episodes: ok({ data: [{ id: 77, timestamp: '3 hours ago' }] }) },
        new Date()
      );

      expect(result.map((a) => a.id)).toEqual(['bazarr-episode-history-77']);
    });

    it('keeps records exactly at the cutoff margin and drops one second older', async () => {
      const since = new Date(2026, 9, 10, 12, 0, 0);
      const result = await activity(
        {
          episodes: ok({
            data: [
              { id: 1, parsed_timestamp: '2026-10-09 12:00:00' },
              { id: 2, parsed_timestamp: '2026-10-09 11:59:59' },
            ],
          }),
        },
        since
      );

      expect(result.map((a) => a.id)).toEqual(['bazarr-episode-history-1']);
    });

    it('does not collide episode and movie history rows that share a numeric id', async () => {
      const result = await activity({
        episodes: ok({ data: [{ id: 1, parsed_timestamp: '2026-10-09 12:00:00' }] }),
        movies: ok({ data: [{ id: 1, parsed_timestamp: '2026-10-09 12:00:00' }] }),
      });

      expect(new Set(result.map((a) => a.id)).size).toBe(2);
    });

    it('derives content ids that ignore the changing humanised timestamp', async () => {
      const row = {
        action: 1,
        description: 'd',
        parsed_timestamp: '10/10/26 11:30:00',
        sonarrEpisodeId: 4,
      };
      const first = await activity({
        episodes: ok({ data: [{ ...row, timestamp: '1 hour ago' }] }),
      });
      const second = await activity({
        episodes: ok({ data: [{ ...row, timestamp: '2 hours ago' }] }),
      });

      expect(first[0]?.id).toBe(second[0]?.id);
      expect(first[0]?.id).toMatch(/^bazarr-episode-history-[0-9a-f]{16}$/);
    });

    it('stops after the first page when no row on it has a parseable time', async () => {
      const page = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, timestamp: 'recently' }));
      const starts: string[] = [];
      route({
        episodes: (url: URL) => {
          starts.push(url.searchParams.get('start') ?? '');
          return ok({ data: page });
        },
      });
      const provider = await connected();
      await provider.getActivity(new Date());

      expect(starts).toEqual(['0']);
    });

    it('includes the score in the content-hash id', async () => {
      const row = {
        action: 1,
        description: 'd',
        parsed_timestamp: '2026-10-10 11:30:00',
        sonarrEpisodeId: 4,
      };
      const low = await activity({ episodes: ok({ data: [{ ...row, score: '80%' }] }) });
      const high = await activity({ episodes: ok({ data: [{ ...row, score: '95%' }] }) });

      expect(low[0]?.id).not.toBe(high[0]?.id);
    });
  });
});
