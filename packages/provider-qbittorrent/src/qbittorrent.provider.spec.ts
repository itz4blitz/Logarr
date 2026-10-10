import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QBITTORRENT_LOG_FILE_CONFIG } from './qbittorrent.parser.js';
import { QBittorrentProvider } from './qbittorrent.provider.js';

const mockFetch = vi.fn();

let counter = 0;
function uniqueUrl(): string {
  counter += 1;
  return `http://qbp-${counter}.local:8080`;
}

/** Routes unauthenticated (bypass mode) requests by path */
function routeFetch(routes: Record<string, () => Response>): void {
  mockFetch.mockImplementation((url: unknown) => {
    const path = new URL(String(url)).pathname.replace('/api/v2', '');
    const route = routes[path];
    return Promise.resolve(route ? route() : new Response('not found', { status: 404 }));
  });
}

const text =
  (body: string, status = 200) =>
  () =>
    new Response(body, { status });
const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

function logCalls(): string[] {
  return mockFetch.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes('/log/main'));
}

describe('QBittorrentProvider', () => {
  let provider: QBittorrentProvider;
  let baseUrl: string;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    provider = new QBittorrentProvider();
    baseUrl = uniqueUrl();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('identity', () => {
    it('has correct id and name', () => {
      expect(provider.id).toBe('qbittorrent');
      expect(provider.name).toBe('qBittorrent');
    });

    it('has the expected capabilities', () => {
      expect(provider.capabilities).toEqual({
        supportsRealTimeLogs: false,
        supportsActivityLog: true,
        supportsSessions: false,
        supportsWebhooks: false,
        supportsPlaybackHistory: false,
        supportsUsername: true,
        apiKeyOptional: true,
      });
    });

    it('returns empty sessions and users', async () => {
      await expect(provider.getSessions()).resolves.toEqual([]);
      await expect(provider.getUsers()).resolves.toEqual([]);
    });

    it('returns the log file config and parses lines', () => {
      expect(provider.getLogFileConfig()).toBe(QBITTORRENT_LOG_FILE_CONFIG);
      expect(provider.parseLogLine('(C) 2026-10-10T12:02:30 - boom')?.level).toBe('error');
      expect(provider.isLogContinuation('x')).toBe(false);
      expect(
        provider.parseLogLineWithContext('(W) 2026-10-10T12:02:30 - hmm', {
          continuationLines: [],
          filePath: 'f',
          lineNumber: 1,
        }).entry?.level
      ).toBe('warn');
      expect(provider.getCorrelationPatterns().length).toBeGreaterThan(0);
    });
  });

  describe('getLogPaths', () => {
    it('returns defaults including /qbittorrent-logs', async () => {
      const paths = await provider.getLogPaths();
      expect(paths).toContain('/qbittorrent-logs');
      expect(paths).toContain('/config/qBittorrent/logs');
    });

    it('honours a configured logPath', async () => {
      routeFetch({ '/app/version': text('v5.2.4'), '/app/webapiVersion': text('2.15.1') });
      await provider.connect({ url: baseUrl, apiKey: '', logPath: '/custom/logs' });
      await expect(provider.getLogPaths()).resolves.toEqual(['/custom/logs']);
    });
  });

  describe('connect / testConnection', () => {
    it('connects and reports server info (5.x)', async () => {
      routeFetch({ '/app/version': text('v5.2.4'), '/app/webapiVersion': text('2.15.1\n') });
      await provider.connect({ url: baseUrl, apiKey: '' });

      await expect(provider.testConnection()).resolves.toEqual({
        connected: true,
        serverInfo: { name: 'qBittorrent', version: '5.2.4', id: 'qbittorrent-webapi-2.15.1' },
      });
    });

    it('supports 4.x version strings', async () => {
      routeFetch({ '/app/version': text('v4.6.7'), '/app/webapiVersion': text('2.9.3') });
      await provider.connect({ url: baseUrl, apiKey: '' });
      const info = await provider.getServerInfo();
      expect(info.version).toBe('4.6.7');
    });

    it('rejects connect with the failure message', async () => {
      routeFetch({ '/app/version': text('Forbidden', 403) });
      await expect(provider.connect({ url: baseUrl, apiKey: '' })).rejects.toThrow(
        'qBittorrent requires authentication'
      );
    });

    it('passes the username through to login', async () => {
      mockFetch.mockImplementation((url: unknown) => {
        const path = new URL(String(url)).pathname;
        if (path.endsWith('/auth/login')) {
          return Promise.resolve(
            new Response('Ok.', { headers: { 'set-cookie': 'QBT_SID_8080=zzz; path=/' } })
          );
        }
        return Promise.resolve(new Response(path.endsWith('version') ? 'v5.2.4' : '2.15.1'));
      });
      await provider.connect({ url: baseUrl, apiKey: 'pw', username: 'admin' });
      const login = mockFetch.mock.calls[0];
      expect((login?.[1] as RequestInit).body).toBe('username=admin&password=pw');
    });

    it('throws when used before connect', async () => {
      await expect(provider.getServerInfo()).rejects.toThrow('Not connected');
      await provider.disconnect();
    });
  });

  describe('getActivity - log messages', () => {
    const connect = async (logPath?: string): Promise<void> => {
      await provider.connect({ url: baseUrl, apiKey: '', logPath });
    };
    const base = {
      '/app/version': text('v5.2.4'),
      '/app/webapiVersion': text('2.15.1'),
      '/torrents/info': json([]),
      '/transfer/info': json({ connection_status: 'connected' }),
    };

    it('ingests only warning and critical entries with stable ids and severities', async () => {
      routeFetch({
        ...base,
        '/log/main': json([
          { id: 1, message: 'normal', timestamp: 1_790_000_000, type: 1 },
          { id: 2, message: 'info', timestamp: 1_790_000_001, type: 2 },
          { id: 3, message: 'File error alert', timestamp: 1_790_000_002, type: 4 },
          { id: 4, message: 'I/O error', timestamp: 1_790_000_003, type: 8 },
        ]),
      });
      await connect();

      const activities = await provider.getActivity();

      expect(activities.map((a) => a.id)).toEqual([
        'qbittorrent-log-1790000002-3',
        'qbittorrent-log-1790000003-4',
      ]);
      expect(activities.map((a) => a.severity)).toEqual(['warn', 'error']);
      expect(activities[0]?.timestamp).toEqual(new Date(1_790_000_002_000));
      expect(activities.map((a) => a.type)).toEqual(['log_warning', 'log_critical']);
      expect(activities[1]?.overview).toBe('I/O error');
    });

    it('normalises millisecond timestamps from qBittorrent < 4.5', async () => {
      routeFetch({
        ...base,
        '/log/main': json([{ id: 7, message: 'old', timestamp: 1_790_000_002_000, type: 4 }]),
      });
      await connect();

      const [activity] = await provider.getActivity();

      expect(activity?.timestamp).toEqual(new Date(1_790_000_002_000));
      expect(activity?.id).toBe('qbittorrent-log-1790000002-7');
    });

    it('requests only warnings and criticals and then continues from the last id', async () => {
      let call = 0;
      routeFetch({
        ...base,
        '/log/main': () =>
          json(
            call++ === 0
              ? [
                  { id: 5, message: 'a', timestamp: 1_790_000_000, type: 4 },
                  { id: 9, message: 'b', timestamp: 1_790_000_001, type: 8 },
                ]
              : []
          )(),
      });
      await connect();

      await provider.getActivity();
      await provider.getActivity();

      const [first, second] = logCalls();
      expect(first).toContain('last_known_id=-1');
      expect(first).toContain('warning=true');
      expect(first).toContain('critical=true');
      expect(first).toContain('normal=false');
      expect(second).toContain('last_known_id=9');
    });

    it('resyncs after 10 minutes of silence and detects an id reset after a restart', async () => {
      const responses: unknown[][] = [
        [{ id: 500, message: 'before', timestamp: 1_790_000_000, type: 4 }],
        [],
        // empty answer to last_known_id=500 (ids restarted), then the full resync
        [],
        // full resync after restart: ids restarted at 0, newer timestamps
        [
          { id: 0, message: 'old buffer entry', timestamp: 1_789_999_000, type: 4 },
          { id: 1, message: 'after restart', timestamp: 1_790_000_900, type: 8 },
        ],
        // next regular poll uses the reset cursor
        [],
      ];
      routeFetch({ ...base, '/log/main': () => json(responses.shift() ?? [])() });
      await connect();

      await provider.getActivity();
      vi.advanceTimersByTime(60_000);
      expect(await provider.getActivity()).toEqual([]);
      expect(logCalls()).toHaveLength(2);

      vi.advanceTimersByTime(11 * 60_000);
      const activities = await provider.getActivity();
      expect(activities.map((a) => a.id)).toEqual(['qbittorrent-log-1790000900-1']);
      expect(logCalls()[2]).toContain('last_known_id=500');
      expect(logCalls()[3]).toContain('last_known_id=-1');

      await provider.getActivity();
      expect(logCalls()[4]).toContain('last_known_id=1');
    });

    it('does not resync again within 10 minutes of the last full sync', async () => {
      routeFetch({
        ...base,
        '/log/main': json([{ id: 5, message: 'a', timestamp: 1_790_000_000, type: 4 }]),
      });
      await connect();
      await provider.getActivity();
      mockFetch.mockClear();
      routeFetch({ ...base, '/log/main': json([]) });
      vi.advanceTimersByTime(5 * 60_000);

      await provider.getActivity();

      expect(logCalls()).toHaveLength(1);
      expect(logCalls()[0]).toContain('last_known_id=5');
    });

    it('applies the since filter on a fresh start', async () => {
      routeFetch({
        ...base,
        '/log/main': json([
          { id: 1, message: 'old', timestamp: 1_790_000_000, type: 4 },
          { id: 2, message: 'new', timestamp: 1_790_000_100, type: 4 },
        ]),
      });
      await connect();

      const activities = await provider.getActivity(new Date(1_790_000_050_000));

      expect(activities.map((a) => a.overview)).toEqual(['new']);
    });

    it('caps a fresh start without since to the newest 500 entries', async () => {
      const entries = Array.from({ length: 700 }, (_, i) => ({
        id: i,
        message: `m${i}`,
        timestamp: 1_790_000_000 + i,
        type: 4,
      }));
      routeFetch({ ...base, '/log/main': json(entries) });
      await connect();

      const activities = await provider.getActivity();

      expect(activities).toHaveLength(500);
      expect(activities[0]?.overview).toBe('m200');
      expect(activities.at(-1)?.overview).toBe('m699');
    });

    it('skips the API log feed entirely when a logPath is configured', async () => {
      routeFetch({
        ...base,
        '/log/main': json([{ id: 1, message: 'x', timestamp: 1_790_000_000, type: 8 }]),
      });
      await connect('/qbittorrent-logs');

      const activities = await provider.getActivity();

      expect(activities).toEqual([]);
      expect(logCalls()).toHaveLength(0);
    });

    it('keeps other sources when the log endpoint fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      routeFetch({
        ...base,
        '/log/main': text('boom', 500),
        '/torrents/info': json([{ hash: 'h1', name: 'T', state: 'error' }]),
      });
      await connect();

      const activities = await provider.getActivity();

      expect(activities.map((a) => a.type)).toEqual(['torrent_error']);
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('getActivity - torrents and connection', () => {
    const connect = async (): Promise<void> => {
      await provider.connect({ url: baseUrl, apiKey: '', logPath: '/logs' });
    };
    const base = {
      '/app/version': text('v5.2.4'),
      '/app/webapiVersion': text('2.15.1'),
      '/log/main': json([]),
    };

    it('maps errored torrents to stable error activities', async () => {
      routeFetch({
        ...base,
        '/torrents/info': json([
          {
            hash: 'abc',
            name: 'Some.Torrent',
            state: 'missingFiles',
            category: 'tv',
            save_path: '/dl',
            tracker: 'http://t/announce?passkey=abcdef',
            progress: 0.5,
          },
          { hash: 'def', name: 'Other', state: 'error' },
        ]),
        '/transfer/info': json({ connection_status: 'connected' }),
      });
      await connect();

      const first = await provider.getActivity();
      const second = await provider.getActivity();

      expect(first.map((a) => a.id)).toEqual([
        'qbittorrent-torrent-error-abc-missingFiles-2026-10-10',
        'qbittorrent-torrent-error-def-error-2026-10-10',
      ]);
      expect(second.map((a) => a.id)).toEqual(first.map((a) => a.id));
      expect(first[0]).toMatchObject({
        type: 'torrent_error',
        severity: 'error',
        itemId: 'abc',
        name: 'Torrent error: Some.Torrent',
        overview: 'Some.Torrent is in state "missingFiles" (category: tv)',
        metadata: { hash: 'abc', state: 'missingFiles', tracker: 't' },
      });
      expect(first[1]?.overview).toBe('Other is in state "error"');
    });

    it.each([
      ['firewalled', 'warn'],
      ['disconnected', 'error'],
    ])('reports %s connection status as %s', async (status, severity) => {
      routeFetch({
        ...base,
        '/torrents/info': json([]),
        '/transfer/info': json({ connection_status: status, dht_nodes: 12 }),
      });
      await connect();

      const [activity] = await provider.getActivity();

      expect(activity).toMatchObject({
        id: `qbittorrent-connection-${status}-2026-10-10`,
        type: 'connection_status',
        severity,
        metadata: { connectionStatus: status, dhtNodes: 12 },
      });
    });

    it('does not report a healthy connection and reports an unhealthy one once per day', async () => {
      routeFetch({
        ...base,
        '/torrents/info': json([]),
        '/transfer/info': json({ connection_status: 'connected' }),
      });
      await connect();
      expect(await provider.getActivity()).toEqual([]);

      routeFetch({
        ...base,
        '/torrents/info': json([]),
        '/transfer/info': json({ connection_status: 'firewalled' }),
      });
      const [first] = await provider.getActivity();
      vi.advanceTimersByTime(30 * 60_000);
      const sameDay = await provider.getActivity();
      vi.advanceTimersByTime(24 * 60 * 60_000);
      const [nextDay] = await provider.getActivity();

      expect(first).toBeDefined();
      expect(sameDay).toEqual([]);
      expect(nextDay?.id).not.toBe(first?.id);
    });

    it('sorts the combined result by timestamp', async () => {
      routeFetch({
        ...base,
        '/torrents/info': json([{ hash: 'h', name: 'N', state: 'error' }]),
        '/transfer/info': json({ connection_status: 'disconnected' }),
      });
      await connect();

      const activities = await provider.getActivity();

      const times = activities.map((a) => a.timestamp.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });
  });
});
