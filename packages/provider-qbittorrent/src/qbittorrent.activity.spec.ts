import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QBittorrentProvider } from './qbittorrent.provider.js';

const mockFetch = vi.fn();

let counter = 0;
function uniqueUrl(): string {
  counter += 1;
  return `http://qba-${counter}.local:8080`;
}

type Route = (url: URL) => Response;

function routeFetch(routes: Record<string, Route>): void {
  mockFetch.mockImplementation((input: unknown) => {
    const url = new URL(String(input));
    const route = routes[url.pathname.replace('/api/v2', '')];
    return Promise.resolve(route ? route(url) : new Response('not found', { status: 404 }));
  });
}

const text =
  (body: string): Route =>
  () =>
    new Response(body);
const json =
  (body: unknown, status = 200): Route =>
  () =>
    new Response(JSON.stringify(body), { status });

function logRequests(): string[] {
  return mockFetch.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/log/main'));
}

const lastKnownIds = (): string[] =>
  logRequests().map((url) => new URL(url).searchParams.get('last_known_id') ?? '');

const SERVER = {
  '/app/version': text('v5.2.4'),
  '/app/webapiVersion': text('2.15.1'),
  '/torrents/info': json([]),
  '/transfer/info': json({ connection_status: 'connected' }),
};

const entry = (
  id: number,
  timestamp: number,
  type = 4,
  message = `m${id}`
): { id: number; message: string; timestamp: number; type: number } => ({
  id,
  message,
  timestamp,
  type,
});

describe('QBittorrentProvider activity edge cases', () => {
  let provider: QBittorrentProvider;
  let baseUrl: string;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    provider = new QBittorrentProvider();
    baseUrl = uniqueUrl();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const connect = (logPath?: string): Promise<void> =>
    provider.connect({ url: baseUrl, apiKey: '', logPath });

  describe('log cursor after a qBittorrent restart (ids go backwards)', () => {
    it('recovers when the restarted instance reuses lower ids', async () => {
      // fake qBittorrent: honours last_known_id against its in-memory buffer
      let buffer = [entry(998, 1_790_000_000), entry(999, 1_790_000_001, 8)];
      routeFetch({
        ...SERVER,
        '/log/main': (url) => {
          const last = Number(url.searchParams.get('last_known_id'));
          return json(buffer.filter((e) => e.id > last))(url);
        },
      });
      await connect();

      const first = await provider.getActivity();
      expect(first.map((a) => a.id)).toEqual([
        'qbittorrent-log-1790000000-998',
        'qbittorrent-log-1790000001-999',
      ]);

      // qBittorrent restarts: empty buffer, ids start from 0 again
      buffer = [];
      vi.advanceTimersByTime(60_000);
      expect(await provider.getActivity()).toEqual([]);
      expect(lastKnownIds()).toEqual(['-1', '999']);

      // new warnings arrive after the restart but with ids far below the cursor
      buffer = [entry(0, 1_790_001_000), entry(1, 1_790_001_001, 8)];
      vi.advanceTimersByTime(60_000);
      expect(await provider.getActivity()).toEqual([]);
      expect(lastKnownIds()).toEqual(['-1', '999', '999']);

      // 10+ minutes since the last full sync: empty answer triggers the resync
      vi.advanceTimersByTime(10 * 60_000);
      const afterRestart = await provider.getActivity();
      expect(lastKnownIds()).toEqual(['-1', '999', '999', '999', '-1']);
      expect(afterRestart.map((a) => a.id)).toEqual([
        'qbittorrent-log-1790001000-0',
        'qbittorrent-log-1790001001-1',
      ]);

      // cursor now follows the new (lower) id space
      await provider.getActivity();
      expect(lastKnownIds().at(-1)).toBe('1');
    });

    it('does not re-ingest old buffer entries that were already seen before the restart', async () => {
      const queue: unknown[][] = [
        [entry(5, 1_790_000_100)],
        [],
        // resync returns the same entry (no restart happened, id space unchanged)
        [entry(5, 1_790_000_100)],
      ];
      routeFetch({ ...SERVER, '/log/main': () => json(queue.shift() ?? [])(new URL(baseUrl)) });
      await connect();
      await provider.getActivity();

      vi.advanceTimersByTime(11 * 60_000);
      const again = await provider.getActivity();

      expect(again).toEqual([]);
      expect(lastKnownIds()).toEqual(['-1', '5', '-1']);
    });

    it('never resyncs while the first response was empty (cursor id -1)', async () => {
      routeFetch({ ...SERVER, '/log/main': json([]) });
      await connect();

      await provider.getActivity();
      vi.advanceTimersByTime(60 * 60_000);
      await provider.getActivity();

      expect(lastKnownIds()).toEqual(['-1', '-1']);
    });
  });

  describe('full-resync timer', () => {
    const setup = async (): Promise<void> => {
      const queue: unknown[][] = [[entry(1, 1_790_000_000)], [], []];
      routeFetch({ ...SERVER, '/log/main': () => json(queue.shift() ?? [])(new URL(baseUrl)) });
      await connect();
      await provider.getActivity();
    };

    it('does not resync at exactly 10 minutes', async () => {
      await setup();
      vi.advanceTimersByTime(10 * 60_000);
      await provider.getActivity();
      expect(lastKnownIds()).toEqual(['-1', '1']);
    });

    it('resyncs one millisecond after 10 minutes', async () => {
      await setup();
      vi.advanceTimersByTime(10 * 60_000 + 1);
      await provider.getActivity();
      expect(lastKnownIds()).toEqual(['-1', '1', '-1']);
    });

    it('is not postponed by regular non-empty polls', async () => {
      const queue: unknown[][] = [[entry(1, 1_790_000_000)], [entry(2, 1_790_000_100)], [], []];
      routeFetch({ ...SERVER, '/log/main': () => json(queue.shift() ?? [])(new URL(baseUrl)) });
      await connect();
      await provider.getActivity();
      vi.advanceTimersByTime(9 * 60_000);
      await provider.getActivity(); // non-empty poll at t=9min
      vi.advanceTimersByTime(2 * 60_000);
      await provider.getActivity(); // empty at t=11min since the FIRST full sync

      expect(lastKnownIds()).toEqual(['-1', '1', '2', '-1']);
    });

    it('keeps the previous cursor when the resync request itself fails', async () => {
      const queue: Array<Route> = [
        json([entry(1, 1_790_000_000)]),
        json([]),
        () => new Response('boom', { status: 500 }),
        json([]),
      ];
      routeFetch({
        ...SERVER,
        '/log/main': (url) => (queue.shift() ?? json([]))(url),
      });
      await connect();
      await provider.getActivity();
      vi.advanceTimersByTime(11 * 60_000);

      await expect(provider.getActivity()).resolves.toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        '[qbittorrent] Failed to get log messages:',
        expect.objectContaining({ message: expect.stringContaining('HTTP 500') })
      );

      // next poll tries the plain cursor again and the resync again
      await provider.getActivity();
      expect(lastKnownIds().slice(-2)).toEqual(['1', '-1']);
    });
  });

  describe('cursor isolation', () => {
    it('keeps independent cursors per base URL', async () => {
      const other = uniqueUrl();
      const second = new QBittorrentProvider();
      routeFetch({
        ...SERVER,
        '/log/main': (url) =>
          json(url.origin === new URL(baseUrl).origin ? [entry(10, 1_790_000_000)] : [])(url),
      });
      await connect();
      await second.connect({ url: other, apiKey: '' });

      await provider.getActivity();
      await second.getActivity();
      await provider.getActivity();

      const byHost = mockFetch.mock.calls
        .map(([url]) => String(url))
        .filter((url) => url.includes('/log/main'))
        .map((url) => [new URL(url).host, new URL(url).searchParams.get('last_known_id')]);
      expect(byHost).toEqual([
        [new URL(baseUrl).host, '-1'],
        [new URL(other).host, '-1'],
        [new URL(baseUrl).host, '10'],
      ]);
    });

    it('survives disconnect and reconnect (cursor is module-level)', async () => {
      routeFetch({ ...SERVER, '/log/main': json([entry(7, 1_790_000_000)]) });
      await connect();
      await provider.getActivity();
      await provider.disconnect();
      await connect();
      await provider.getActivity();

      expect(lastKnownIds()).toEqual(['-1', '7']);
    });
  });

  describe('log filtering', () => {
    it('ignores normal and info entries even if the server returns them', async () => {
      routeFetch({
        ...SERVER,
        '/log/main': json([
          entry(1, 1_790_000_000, 1),
          entry(2, 1_790_000_001, 2),
          entry(3, 1_790_000_002, 4),
        ]),
      });
      await connect();

      const activities = await provider.getActivity();

      expect(activities.map((a) => a.metadata?.['qbId'])).toEqual([3]);
    });

    it('still advances the cursor past ignored entries', async () => {
      routeFetch({ ...SERVER, '/log/main': json([entry(41, 1_790_000_000, 1)]) });
      await connect();
      await provider.getActivity();
      await provider.getActivity();

      expect(lastKnownIds()).toEqual(['-1', '41']);
    });

    it('truncates long messages in the name but keeps the full overview', async () => {
      const message = 'x'.repeat(100_000);
      routeFetch({ ...SERVER, '/log/main': json([entry(1, 1_790_000_000, 8, message)]) });
      await connect();

      const [activity] = await provider.getActivity();

      expect(activity?.name).toHaveLength(120);
      expect(activity?.name.endsWith('…')).toBe(true);
      expect(activity?.overview).toBe(message);
    });

    it('applies the since filter to millisecond timestamps (qBittorrent < 4.5)', async () => {
      routeFetch({
        ...SERVER,
        '/log/main': json([entry(1, 1_790_000_000_000), entry(2, 1_790_000_100_000)]),
      });
      await connect();

      const activities = await provider.getActivity(new Date(1_790_000_050_000));

      expect(activities.map((a) => a.metadata?.['qbId'])).toEqual([2]);
    });

    it('drops entries at exactly the since timestamp (strictly newer only)', async () => {
      routeFetch({
        ...SERVER,
        '/log/main': json([entry(1, 1_790_000_000), entry(2, 1_790_000_001)]),
      });
      await connect();

      const activities = await provider.getActivity(new Date(1_790_000_000_000));

      expect(activities.map((a) => a.metadata?.['qbId'])).toEqual([2]);
    });

    it('keeps the newest 500 warnings ordered oldest to newest when the buffer is unsorted', async () => {
      const entries = Array.from({ length: 700 }, (_, i) => entry(i, 1_790_000_000 + i));
      routeFetch({ ...SERVER, '/log/main': json([...entries].reverse()) });
      await connect();

      const activities = await provider.getActivity();

      expect(activities).toHaveLength(500);
      expect(activities[0]?.metadata?.['qbId']).toBe(200);
      expect(activities.at(-1)?.metadata?.['qbId']).toBe(699);
    });

    it('does not cap subsequent polls', async () => {
      const first = [entry(0, 1_790_000_000)];
      const next = Array.from({ length: 800 }, (_, i) => entry(i + 1, 1_790_000_001 + i));
      const queue: unknown[][] = [first, next];
      routeFetch({ ...SERVER, '/log/main': () => json(queue.shift() ?? [])(new URL(baseUrl)) });
      await connect();
      await provider.getActivity();

      expect(await provider.getActivity()).toHaveLength(800);
    });

    it('produces unique ids for same-second entries', async () => {
      routeFetch({
        ...SERVER,
        '/log/main': json([entry(1, 1_790_000_000), entry(2, 1_790_000_000)]),
      });
      await connect();

      const ids = (await provider.getActivity()).map((a) => a.id);

      expect(new Set(ids).size).toBe(2);
    });
  });

  describe('malformed payloads', () => {
    it.each([
      ['an object instead of an array', { error: 'nope' }],
      ['null', null],
      ['a string', 'Ok.'],
    ])('survives %s from /log/main and keeps the other sources', async (_label, payload) => {
      routeFetch({
        ...SERVER,
        '/log/main': json(payload),
        '/torrents/info': json([{ hash: 'h', name: 'N', state: 'error' }]),
      });
      await connect();

      const activities = await provider.getActivity();

      expect(activities.map((a) => a.type)).toEqual(['torrent_error']);
      expect(console.error).toHaveBeenCalledWith(
        '[qbittorrent] Failed to get log messages:',
        expect.any(Error)
      );
    });

    it('survives a non-JSON /transfer/info body', async () => {
      routeFetch({
        ...SERVER,
        '/log/main': json([entry(1, 1_790_000_000)]),
        '/transfer/info': text('<html>proxy error</html>'),
      });
      await connect('');

      const activities = await provider.getActivity();

      expect(activities.map((a) => a.type)).toEqual(['log_warning']);
      expect(console.error).toHaveBeenCalledWith(
        '[qbittorrent] Failed to get connection status:',
        expect.objectContaining({ message: 'Unexpected response from qBittorrent' })
      );
    });

    it.each([{}, { connection_status: 'weird' }, { connection_status: null }])(
      'ignores unknown or missing connection_status %j',
      async (info) => {
        routeFetch({ ...SERVER, '/log/main': json([]), '/transfer/info': json(info) });
        await connect();

        expect(await provider.getActivity()).toEqual([]);
      }
    );

    it('tolerates a torrent without optional fields', async () => {
      routeFetch({
        ...SERVER,
        '/log/main': json([]),
        '/torrents/info': json([{ hash: 'h', name: 'N', state: 'error', category: '' }]),
      });
      await connect();

      const [activity] = await provider.getActivity();

      expect(activity?.overview).toBe('N is in state "error"');
      expect(activity?.metadata?.['savePath']).toBeUndefined();
    });
  });

  describe('errored torrent id stability', () => {
    const torrents = (state: string): Route =>
      json([{ hash: 'abc', name: 'Show.S01', state, category: 'tv' }]);

    it('keeps the id within a day but re-fires with a new id the next day', async () => {
      routeFetch({ ...SERVER, '/log/main': json([]), '/torrents/info': torrents('error') });
      await connect();

      const [first] = await provider.getActivity();
      vi.advanceTimersByTime(60 * 60_000);
      const [sameDay] = await provider.getActivity();
      vi.advanceTimersByTime(24 * 60 * 60_000);
      const [nextDay] = await provider.getActivity();

      expect(sameDay?.id).toBe(first?.id);
      expect(nextDay?.id).not.toBe(first?.id);
      expect(nextDay?.timestamp.getTime()).toBeGreaterThan(first?.timestamp.getTime() ?? 0);
    });

    it('issues a new id when the same torrent changes error state', async () => {
      routeFetch({ ...SERVER, '/log/main': json([]), '/torrents/info': torrents('error') });
      await connect();
      const [error] = await provider.getActivity();

      routeFetch({ ...SERVER, '/log/main': json([]), '/torrents/info': torrents('missingFiles') });
      const [missing] = await provider.getActivity();

      expect(error?.id).toBe('qbittorrent-torrent-error-abc-error-2026-10-10');
      expect(missing?.id).toBe('qbittorrent-torrent-error-abc-missing-files-2026-10-10');
    });

    it('emits nothing once the torrent is no longer errored', async () => {
      routeFetch({ ...SERVER, '/log/main': json([]), '/torrents/info': torrents('error') });
      await connect();
      await provider.getActivity();

      routeFetch({ ...SERVER, '/log/main': json([]), '/torrents/info': json([]) });

      expect(await provider.getActivity()).toEqual([]);
    });
  });

  describe('connection status buckets', () => {
    const status = (connection_status: string): Route => json({ connection_status, dht_nodes: 0 });

    it('rolls over exactly at the day boundary', async () => {
      vi.setSystemTime(new Date('2026-10-10T23:59:59.999Z'));
      routeFetch({ ...SERVER, '/log/main': json([]), '/transfer/info': status('firewalled') });
      await connect();
      const [before] = await provider.getActivity();

      vi.setSystemTime(new Date('2026-10-11T00:00:00.000Z'));
      const [after] = await provider.getActivity();

      expect(before?.id).toBe('qbittorrent-connection-firewalled-2026-10-10');
      expect(after?.id).toBe('qbittorrent-connection-firewalled-2026-10-11');
    });

    it('does not collide across days with the same hour', async () => {
      routeFetch({ ...SERVER, '/log/main': json([]), '/transfer/info': status('disconnected') });
      await connect();
      const [today] = await provider.getActivity();
      vi.advanceTimersByTime(24 * 60 * 60_000);
      const [tomorrow] = await provider.getActivity();

      expect(tomorrow?.id).not.toBe(today?.id);
    });

    it('uses different ids for firewalled and disconnected in the same hour', async () => {
      routeFetch({ ...SERVER, '/log/main': json([]), '/transfer/info': status('firewalled') });
      await connect();
      const [firewalled] = await provider.getActivity();
      routeFetch({ ...SERVER, '/log/main': json([]), '/transfer/info': status('disconnected') });
      const [disconnected] = await provider.getActivity();

      expect(firewalled?.id).not.toBe(disconnected?.id);
    });
  });
});
