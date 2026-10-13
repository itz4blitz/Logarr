import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SEERR_LOG_FILE_CONFIG } from './seerr.parser.js';
import { SeerrProvider } from './seerr.provider.js';

const mockFetch = vi.fn();

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, text = 'err') => ({
  ok: false,
  status,
  statusText: 'x',
  text: async () => text,
});

type Routes = Record<string, () => unknown>;

/** Route-based fetch mock keyed on pathname (after /api/v1) */
function route(routes: Routes): void {
  mockFetch.mockImplementation(async (url: string) => {
    const path = new URL(url).pathname.replace('/api/v1', '');
    const handler = routes[path];
    return handler === undefined ? fail(404, 'not found') : handler();
  });
}

const T = (s: string): number => Date.parse(s);

const requests = [
  {
    id: 12,
    status: 2,
    type: 'movie',
    createdAt: '2026-10-10T11:00:00.000Z',
    updatedAt: '2026-10-10T12:00:00.000Z',
    is4k: false,
    media: { tmdbId: 603, tvdbId: null, mediaType: 'movie', status: 3 },
    requestedBy: { id: 7, displayName: 'alice' },
  },
  {
    id: 13,
    status: 4,
    type: 'tv',
    updatedAt: '2026-10-10T12:01:00.000Z',
    is4k: true,
    media: { tmdbId: 1396, mediaType: 'tv' },
    seasons: [{ seasonNumber: 1 }, { seasonNumber: 2 }],
    requestedBy: { id: 8, username: 'bob' },
    modifiedBy: { id: 1, displayName: 'admin' },
  },
  {
    id: 14,
    status: 3,
    updatedAt: '2026-10-10T12:02:00.000Z',
    requestedBy: { id: 9, email: 'c@x' },
  },
];

const issues = [
  {
    id: 5,
    issueType: 3,
    status: 1,
    updatedAt: '2026-10-10T12:03:00.000Z',
    media: { tmdbId: 603, mediaType: 'movie' },
    createdBy: { id: 7, displayName: 'alice' },
    comments: [{ id: 1, message: 'No English subs' }],
  },
  { id: 6, issueType: 1, status: 2, createdAt: '2026-10-10T12:04:00.000Z' },
];

const paged = (results: unknown[]) => ({
  pageInfo: { pages: 1, pageSize: 50, results: results.length, page: 1 },
  results,
});

async function connected(): Promise<SeerrProvider> {
  route({ '/settings/about': () => ok({ version: '3.5.0' }) });
  const p = new SeerrProvider();
  await p.connect({ url: 'http://seerr:5055', apiKey: 'K' });
  return p;
}

describe('SeerrProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('identity', () => {
    const p = new SeerrProvider();

    it('has id, name and capabilities', () => {
      expect(p.id).toBe('seerr');
      expect(p.name).toBe('Seerr');
      expect(p.capabilities).toEqual({
        supportsRealTimeLogs: false,
        supportsActivityLog: true,
        supportsSessions: false,
        supportsWebhooks: false,
        supportsPlaybackHistory: false,
      });
    });

    it('returns empty sessions and users', async () => {
      await expect(p.getSessions()).resolves.toEqual([]);
      await expect(p.getUsers()).resolves.toEqual([]);
    });

    it('exposes file ingestion hooks', () => {
      expect(p.getLogFileConfig()).toBe(SEERR_LOG_FILE_CONFIG);
      const line = '2026-10-10T12:00:01.123Z [info][API]: hi ';
      expect(p.parseLogLine(line)?.source).toBe('API');
      expect(p.isLogContinuation('    at x')).toBe(true);
      const ctx = { continuationLines: [], filePath: 'f', lineNumber: 1 };
      expect(p.parseLogLineWithContext(line, ctx).entry?.message).toBe('hi');
    });

    it('has correlation patterns', () => {
      const names = p.getCorrelationPatterns().map((c) => c.name);
      expect(names).toEqual(['requestId', 'tmdbId', 'userId']);
      const re = p.getCorrelationPatterns()[0]?.pattern as RegExp;
      expect('Request #12 approved'.match(re)?.[1]).toBe('12');
    });

    it('returns default log paths and a custom one after connect', async () => {
      const paths = await p.getLogPaths();
      expect(paths).toContain('/seerr-logs');
      expect(paths).toContain('/app/config/logs');
      route({ '/settings/about': () => ok({ version: '3.5.0' }) });
      const q = new SeerrProvider();
      await q.connect({ url: 'http://h', apiKey: 'K', logPath: '/custom' });
      await expect(q.getLogPaths()).resolves.toEqual(['/custom']);
    });
  });

  describe('connection', () => {
    it('reports version and name when connected', async () => {
      const p = await connected();
      route({
        '/settings/about': () => ok({ version: '3.5.0' }),
      });
      await expect(p.testConnection()).resolves.toEqual({
        connected: true,
        serverInfo: { name: 'Seerr', version: '3.5.0', id: 'seerr' },
      });
      await expect(p.getServerInfo()).resolves.toEqual({
        name: 'Seerr',
        version: '3.5.0',
        id: 'seerr',
      });
    });

    it('takes the version from /settings/about and never calls /status', async () => {
      const p = await connected();
      route({ '/settings/about': () => ok({ version: '1.2.3' }) });
      mockFetch.mockClear();
      const status = await p.testConnection();
      expect(status.connected).toBe(true);
      expect(status.serverInfo?.version).toBe('1.2.3');
      expect(mockFetch.mock.calls.map((c) => new URL(String(c[0])).pathname)).toEqual([
        '/api/v1/settings/about',
      ]);
    });

    it('rejects connect with a bad key', async () => {
      route({ '/settings/about': () => fail(401) });
      await expect(new SeerrProvider().connect({ url: 'http://h', apiKey: 'bad' })).rejects.toThrow(
        /ADMIN API key/
      );
    });

    it('is not connected before connect and after disconnect', async () => {
      const p = new SeerrProvider();
      await expect(p.testConnection()).resolves.toEqual({
        connected: false,
        error: 'Not initialized',
      });
      await expect(p.getActivity()).rejects.toThrow(/^Not connected$/);
      await expect(p.getServerInfo()).rejects.toThrow(/^Not connected$/);
      const c = await connected();
      await c.disconnect();
      await expect(c.getActivity()).rejects.toThrow(/^Not connected$/);
    });

    it('returns connected:false when the key stops working', async () => {
      const p = await connected();
      route({ '/settings/about': () => fail(403) });
      const status = await p.testConnection();
      expect(status.connected).toBe(false);
      expect(status.error).toMatch(/ADMIN API key/);
    });

    it('returns connected:false on network errors', async () => {
      vi.useFakeTimers();
      const p = await connected();
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));
      const promise = p.testConnection();
      await vi.advanceTimersByTimeAsync(10000);
      const status = await promise;
      expect(status.connected).toBe(false);
      expect(status.error).toBeDefined();
    });
  });

  describe('getActivity', () => {
    it('normalizes requests without title lookups', async () => {
      const p = await connected();
      route({ '/request': () => ok(paged(requests)), '/issue': () => ok(paged([])) });
      const acts = await p.getActivity();

      expect(mockFetch.mock.calls.map((c) => new URL(String(c[0])).pathname)).not.toContain(
        '/api/v1/movie/603'
      );
      expect(acts.map((a) => a.id)).toEqual([
        'seerr-request-12-status-2',
        'seerr-request-13-status-4',
        'seerr-request-14-status-3',
      ]);
      expect(acts.map((a) => a.type)).toEqual([
        'request_approved',
        'request_failed',
        'request_declined',
      ]);
      expect(acts.map((a) => a.severity)).toEqual(['info', 'error', 'warn']);

      const [a, b, c] = acts;
      expect(a?.name).toBe('Movie request approved');
      expect(a?.overview).toContain('tmdb:603');
      expect(a?.overview).toContain('alice');
      expect(a?.itemId).toBe('tmdb:603');
      expect(a?.userId).toBe('7');
      expect(a?.timestamp.getTime()).toBe(T('2026-10-10T12:00:00.000Z'));
      expect(a?.metadata).toMatchObject({
        requestId: 12,
        status: 2,
        mediaType: 'movie',
        tmdbId: 603,
      });

      expect(b?.name).toBe('TV request failed');
      expect(b?.overview).toContain('tmdb:1396');
      expect(b?.overview).toContain('bob');
      expect(b?.overview).toContain('4K');
      expect(b?.overview).toContain('S1, S2');
      expect(b?.overview).toContain('admin');

      expect(c?.overview).toContain('user 9');
      expect(c?.overview).not.toContain('c@x');
      expect(c?.itemId).toBeUndefined();
    });

    it('is dedupe-stable and creates a new id only on status change', async () => {
      const p = await connected();
      route({ '/request': () => ok(paged(requests)), '/issue': () => ok(paged([])) });
      const first = await p.getActivity();
      const second = await p.getActivity();
      expect(second.map((a) => a.id)).toEqual(first.map((a) => a.id));

      const moved = [{ ...requests[0], updatedAt: '2026-10-10T13:00:00.000Z' }];
      route({ '/request': () => ok(paged(moved)), '/issue': () => ok(paged([])) });
      expect((await p.getActivity())[0]?.id).toBe(first[0]?.id);

      const approvedToCompleted = [{ ...requests[0], status: 5 }];
      route({ '/request': () => ok(paged(approvedToCompleted)), '/issue': () => ok(paged([])) });
      const done = await p.getActivity();
      expect(done[0]?.id).toBe('seerr-request-12-status-5');
      expect(done[0]?.type).toBe('request_completed');
    });

    it('handles unknown request statuses', async () => {
      const p = await connected();
      route({
        '/request': () => ok(paged([{ id: 1, status: 99, updatedAt: '2026-10-10T12:00:00.000Z' }])),
        '/issue': () => ok(paged([])),
      });
      const [a] = await p.getActivity();
      expect(a?.type).toBe('request_unknown');
      expect(a?.name).toContain('status 99');
      expect(a?.severity).toBe('info');
    });

    it('normalizes issues', async () => {
      const p = await connected();
      route({ '/request': () => ok(paged([])), '/issue': () => ok(paged(issues)) });
      const acts = await p.getActivity();
      expect(acts.map((a) => a.id)).toEqual(['seerr-issue-5-status-1', 'seerr-issue-6-status-2']);
      const [open, resolved] = acts;
      expect(open?.type).toBe('issue_open');
      expect(open?.severity).toBe('warn');
      expect(open?.name).toContain('Subtitles');
      expect(open?.overview).toContain('1 comment');
      expect(open?.overview).not.toContain('No English subs');
      expect(open?.overview).toContain('alice');
      expect(open?.itemId).toBe('tmdb:603');
      expect(resolved?.type).toBe('issue_resolved');
      expect(resolved?.severity).toBe('info');
      expect(resolved?.timestamp.getTime()).toBe(T('2026-10-10T12:04:00.000Z'));
    });

    it('treats a missing issue status as open and unknown types safely', async () => {
      const p = await connected();
      route({
        '/request': () => ok(paged([])),
        '/issue': () =>
          ok(
            paged([
              {
                id: 9,
                issueType: 42,
                problemSeason: 2,
                problemEpisode: 3,
                updatedAt: '2026-10-10T12:00:00.000Z',
              },
            ])
          ),
      });
      const [a] = await p.getActivity();
      expect(a?.id).toBe('seerr-issue-9-status-1');
      expect(a?.type).toBe('issue_open');
      expect(a?.name).toContain('Type 42');
      expect(a?.name).toContain('S2E3');
    });

    it('accepts bare array envelopes', async () => {
      const p = await connected();
      route({ '/request': () => ok(requests), '/issue': () => ok(issues) });
      expect(await p.getActivity()).toHaveLength(5);
    });

    it('filters by since and stops paging at older items', async () => {
      const p = await connected();
      route({
        '/request': () => ok(paged([...requests].reverse())),
        '/issue': () => ok(paged([])),
      });
      const acts = await p.getActivity(new Date('2026-10-10T12:00:30Z'));
      expect(acts.map((a) => a.metadata?.['requestId']).sort()).toEqual([13, 14]);
      const requestCalls = mockFetch.mock.calls.filter((c) =>
        String(c[0]).includes('/api/v1/request')
      );
      expect(requestCalls).toHaveLength(1);
    });

    it('pages while items are newer than since and takes only one page without since', async () => {
      const p = await connected();
      const page = (start: number, iso: string) =>
        Array.from({ length: 50 }, (_, i) => ({
          id: start + i,
          status: 2,
          updatedAt: iso,
        }));
      route({
        '/request': () => {
          const skip = Number(
            new URL(String(mockFetch.mock.calls.at(-1)?.[0])).searchParams.get('skip')
          );
          return ok(
            paged(
              skip === 0
                ? page(1, '2026-10-10T12:10:00.000Z')
                : [
                    ...page(100, '2026-10-10T12:05:00.000Z').slice(0, 1),
                    { id: 999, status: 2, updatedAt: '2026-10-09T00:00:00.000Z' },
                  ]
            )
          );
        },
        '/issue': () => ok(paged([])),
      });
      const since = new Date('2026-10-10T12:00:00Z');
      const acts = await p.getActivity(since);
      expect(acts).toHaveLength(51);
      const skips = mockFetch.mock.calls
        .map((c) => new URL(String(c[0])))
        .filter((u) => u.pathname === '/api/v1/request')
        .map((u) => u.searchParams.get('skip'));
      expect(skips).toEqual(['0', '50']);

      mockFetch.mockClear();
      await p.getActivity();
      const noSince = mockFetch.mock.calls.filter((c) => String(c[0]).includes('/api/v1/request'));
      expect(noSince).toHaveLength(1);
    });

    it('skips invalid dates', async () => {
      const p = await connected();
      route({
        '/request': () =>
          ok(
            paged([
              { id: 1, status: 2, updatedAt: 'garbage' },
              { id: 2, status: 2 },
              { id: 3, status: 2, updatedAt: '2026-10-10T12:00:00.000Z' },
            ])
          ),
        '/issue': () => ok(paged([{ id: 1, issueType: 1, updatedAt: 'nope', createdAt: 'nope' }])),
      });
      const acts = await p.getActivity();
      expect(acts.map((a) => a.id)).toEqual(['seerr-request-3-status-2']);
    });

    it('sorts ascending by timestamp', async () => {
      const p = await connected();
      route({
        '/request': () => ok(paged([...requests].reverse())),
        '/issue': () => ok(paged(issues)),
      });
      const times = (await p.getActivity()).map((a) => a.timestamp.getTime());
      expect(times).toEqual([...times].sort((x, y) => x - y));
    });

    it('returns partial results when one source fails', async () => {
      vi.useFakeTimers();
      const p = await connected();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      route({ '/request': () => ok(paged(requests)), '/issue': () => fail(500) });
      const promise = p.getActivity();
      await vi.advanceTimersByTimeAsync(10000);
      const acts = await promise;
      expect(acts).toHaveLength(3);
      expect(errorSpy).toHaveBeenCalledWith('[seerr] Failed to get issues:', expect.any(Error));
    });

    it('rejects when every source fails', async () => {
      const p = await connected();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      route({ '/request': () => fail(401), '/issue': () => fail(401) });
      await expect(p.getActivity()).rejects.toThrow(/ADMIN API key/);
    });
  });

  describe('edge cases', () => {
    const one = async (request: unknown) => {
      const p = await connected();
      route({ '/request': () => ok(paged([request])), '/issue': () => ok(paged([])) });
      const [act] = await p.getActivity();
      return act;
    };
    const oneIssue = async (issue: unknown) => {
      const p = await connected();
      route({ '/request': () => ok(paged([])), '/issue': () => ok(paged([issue])) });
      const [act] = await p.getActivity();
      return act;
    };

    it('throws when used before connect', async () => {
      const p = new SeerrProvider();
      await expect(p.getActivity()).rejects.toThrow(/^Not connected$/);
      await expect(p.getServerInfo()).rejects.toThrow(/^Not connected$/);
    });

    it('includes boundary items (timestamp === since)', async () => {
      const act = await (async () => {
        const p = await connected();
        route({
          '/request': () =>
            ok(paged([{ id: 1, status: 2, updatedAt: '2026-10-10T12:00:00.000Z' }])),
          '/issue': () => ok(paged([])),
        });
        return p.getActivity(new Date('2026-10-10T12:00:00.000Z'));
      })();
      expect(act).toHaveLength(1);
    });

    it('caps paging at three pages when everything is newer than since', async () => {
      const p = await connected();
      const full = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        status: 2,
        updatedAt: '2026-10-10T12:00:00.000Z',
      }));
      route({ '/request': () => ok(paged(full)), '/issue': () => ok(paged([])) });
      await p.getActivity(new Date('2026-01-01T00:00:00Z'));
      const skips = mockFetch.mock.calls
        .map((c) => new URL(String(c[0])))
        .filter((u) => u.pathname === '/api/v1/request')
        .map((u) => u.searchParams.get('skip'));
      expect(skips).toEqual(['0', '50', '100']);
    });

    it('tolerates a request without requestedBy or media', async () => {
      const act = await one({ id: 9, status: 99, updatedAt: '2026-10-10T12:00:00.000Z' });
      expect(act?.type).toBe('request_unknown');
      expect(act?.userId).toBeUndefined();
      expect(act?.itemId).toBeUndefined();
      expect(act?.overview).toContain('request #9');
      expect(act?.overview).toContain('unknown user');
    });

    it('ignores a string or null modifiedBy', async () => {
      for (const modifiedBy of ['system', null]) {
        const act = await one({
          id: 9,
          status: 2,
          updatedAt: '2026-10-10T12:00:00.000Z',
          requestedBy: { id: 1, displayName: 'a' },
          modifiedBy,
        });
        expect(act?.overview).not.toContain('updated by');
      }
    });

    it('falls back to the user id when no name field is set', async () => {
      const act = await one({
        id: 9,
        status: 1,
        updatedAt: '2026-10-10T12:00:00.000Z',
        requestedBy: { id: 33 },
      });
      expect(act?.overview).toContain('requested by user 33');
    });

    it('prefers a media type from the media object when type is absent', async () => {
      const act = await one({
        id: 9,
        status: 5,
        updatedAt: '2026-10-10T12:00:00.000Z',
        media: { tmdbId: 1, mediaType: 'tv' },
      });
      expect(act?.name).toBe('TV request completed');
      expect(act?.severity).toBe('info');
    });

    it('uses a stable id and maps severity per status', async () => {
      const sev = new Map<number, string>();
      for (const status of [1, 2, 3, 4, 5]) {
        const act = await one({ id: 1, status, updatedAt: '2026-10-10T12:00:00.000Z' });
        sev.set(status, `${act?.severity}:${act?.id}`);
      }
      expect([...sev.values()]).toEqual([
        'info:seerr-request-1-status-1',
        'info:seerr-request-1-status-2',
        'warn:seerr-request-1-status-3',
        'error:seerr-request-1-status-4',
        'info:seerr-request-1-status-5',
      ]);
    });

    it('formats season and episode of an issue', async () => {
      const base = { id: 1, issueType: 1, updatedAt: '2026-10-10T12:00:00.000Z' };
      expect((await oneIssue({ ...base, problemSeason: 2, problemEpisode: 5 }))?.name).toBe(
        'Video issue open S2E5'
      );
      expect((await oneIssue({ ...base, problemSeason: 2, problemEpisode: 0 }))?.name).toBe(
        'Video issue open S2'
      );
      expect((await oneIssue({ ...base, problemSeason: 0, problemEpisode: 3 }))?.name).toBe(
        'Video issue open'
      );
    });

    it('skips requests and issues with a non-numeric status', async () => {
      const p = await connected();
      route({
        '/request': () =>
          ok(
            paged([
              { id: 1, updatedAt: '2026-10-10T12:00:00.000Z' },
              { id: 2, status: '2', updatedAt: '2026-10-10T12:00:00.000Z' },
              { id: 3, status: 2, updatedAt: '2026-10-10T12:00:00.000Z' },
            ])
          ),
        '/issue': () =>
          ok(
            paged([
              { id: 1, issueType: 1, status: 'open', updatedAt: '2026-10-10T12:00:00.000Z' },
              { id: 2, issueType: 1, updatedAt: '2026-10-10T12:00:00.000Z' },
            ])
          ),
      });
      const ids = (await p.getActivity()).map((a) => a.id);
      expect(ids).toEqual(['seerr-request-3-status-2', 'seerr-issue-2-status-1']);
      expect(ids.some((id) => id.includes('undefined'))).toBe(false);
    });

    it.each([
      [
        'prefers username over displayName',
        { id: 3, username: 'carol', displayName: 'Carol C' },
        'carol',
      ],
      [
        'prefers plexUsername over displayName',
        { id: 3, plexUsername: 'plexcarol', displayName: 'Carol C' },
        'plexcarol',
      ],
      [
        'prefers jellyfinUsername over displayName',
        { id: 3, jellyfinUsername: 'jfcarol', displayName: 'Carol C' },
        'jfcarol',
      ],
      ['uses displayName when no username exists', { id: 3, displayName: 'Carol C' }, 'Carol C'],
      [
        'skips an email displayName (Seerr default)',
        { id: 3, displayName: 'carol@example.com' },
        'user 3',
      ],
      [
        'skips an email username but uses the next candidate',
        { id: 3, username: 'c@example.com', jellyfinUsername: 'jfcarol' },
        'jfcarol',
      ],
      ['skips blank names', { id: 3, username: '  ', displayName: '' }, 'user 3'],
    ])('requester name: %s', async (_name, requestedBy, expected) => {
      const p = await connected();
      route({
        '/request': () =>
          ok(paged([{ id: 1, status: 2, updatedAt: '2026-10-10T12:00:00.000Z', requestedBy }])),
        '/issue': () => ok(paged([])),
      });
      const [a] = await p.getActivity();
      expect(a?.overview).toContain(`requested by ${expected})`);
      expect(a?.overview).not.toContain('@');
    });

    it('never puts email addresses into overviews', async () => {
      const p = await connected();
      route({
        '/request': () =>
          ok(
            paged([
              {
                id: 1,
                status: 2,
                updatedAt: '2026-10-10T12:00:00.000Z',
                requestedBy: { id: 4, email: 'a@b.c' },
                modifiedBy: { id: 5, email: 'm@b.c' },
              },
            ])
          ),
        '/issue': () => ok(paged([])),
      });
      const [a] = await p.getActivity();
      expect(a?.overview).toContain('user 4');
      expect(a?.overview).not.toContain('@');
    });

    it('warns when the page cap is hit with items still newer than since', async () => {
      const p = await connected();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const full = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        status: 2,
        updatedAt: '2026-10-10T12:00:00.000Z',
      }));
      route({ '/request': () => ok(paged(full)), '/issue': () => ok(paged([])) });
      const acts = await p.getActivity(new Date('2026-10-10T00:00:00Z'));
      expect(acts).toHaveLength(150);
      expect(warn).toHaveBeenCalledWith(
        '[seerr] activity page cap reached; some changes may be skipped'
      );
    });

    it('does not warn when an older item ends paging', async () => {
      const p = await connected();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      route({ '/request': () => ok(paged(requests)), '/issue': () => ok(paged([])) });
      await p.getActivity(new Date('2026-10-10T12:00:30Z'));
      expect(warn).not.toHaveBeenCalled();
    });

    it('shows only the comment count, never the comment text', async () => {
      const act = await oneIssue({
        id: 1,
        issueType: 2,
        updatedAt: '2026-10-10T12:00:00.000Z',
        comments: [
          { id: 1, message: 'first' },
          { id: 2, message: 'x'.repeat(2000) },
        ],
      });
      expect(act?.overview).toContain('2 comments');
      expect(act?.overview).not.toContain('first');
      expect(act?.overview).not.toContain('xxx');
      expect(act?.metadata?.['commentCount']).toBe(2);
    });

    it('falls back to createdAt and reports zero comments', async () => {
      const act = await oneIssue({ id: 4, issueType: 4, createdAt: '2026-10-10T09:00:00.000Z' });
      expect(act?.timestamp.toISOString()).toBe('2026-10-10T09:00:00.000Z');
      expect(act?.overview).toContain('0 comments');
      expect(act?.overview).toContain('issue #4');
    });

    it('reports a non-Error rejection as an Error when all sources fail', async () => {
      const p = await connected();
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mockFetch.mockImplementation(() => Promise.reject('string failure'));
      vi.useFakeTimers();
      const promise = p.getActivity().catch((e) => e);
      await vi.advanceTimersByTimeAsync(10000);
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
    });

    it('tags the failing source in the error log', async () => {
      vi.useFakeTimers();
      const p = await connected();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      route({ '/request': () => fail(500), '/issue': () => ok(paged(issues)) });
      const promise = p.getActivity();
      await vi.advanceTimersByTimeAsync(10000);
      expect(await promise).toHaveLength(2);
      expect(errorSpy.mock.calls[0]?.[0]).toBe('[seerr] Failed to get requests:');
    });

    it('reports testConnection failure as connected:false with the hint', async () => {
      const p = await connected();
      route({ '/settings/about': () => fail(403) });
      const status = await p.testConnection();
      expect(status.connected).toBe(false);
      expect(status.error).toMatch(/ADMIN API key/);
    });
  });
});
