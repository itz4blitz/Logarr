/**
 * Tests for Lidarr provider
 */

import { LIDARR_LOG_FILE_CONFIG } from '@logarr/provider-arr';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { LidarrProvider } from './lidarr.provider.js';
import { LidarrEventTypes, LidarrEventTypeNames } from './lidarr.types.js';

import type { LidarrHistoryRecord } from './lidarr.types.js';
import type { NormalizedActivity } from '@logarr/core';

const mockFetch = vi.fn();

const BASE_URL = 'http://lidarr:8686';

const STATUS = {
  appName: 'Lidarr',
  instanceName: 'Lidarr',
  version: '3.1.0.4875',
  branch: 'master',
};

const ok = (data: unknown): Record<string, unknown> => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(data),
});

const fail = (status: number, statusText: string): Record<string, unknown> => ({
  ok: false,
  status,
  statusText,
  text: () => Promise.resolve('bad'),
});

interface RouteTable {
  status?: unknown;
  health?: unknown;
  history?: unknown;
  historySince?: unknown;
  queue?: unknown;
}

/** Route mocked fetch responses by request path */
function routeFetch(routes: RouteTable): void {
  mockFetch.mockImplementation((input: string) => {
    const path = new URL(input).pathname;
    const pick = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
    switch (path) {
      case '/api/v1/system/status':
        return Promise.resolve(pick(routes.status ?? ok(STATUS)));
      case '/api/v1/health':
        return Promise.resolve(pick(routes.health ?? ok([])));
      case '/api/v1/history':
        return Promise.resolve(
          pick(
            routes.history ??
              ok({
                page: 1,
                pageSize: 50,
                sortKey: 'date',
                sortDirection: 'descending',
                totalRecords: 0,
                records: [],
              })
          )
        );
      case '/api/v1/history/since':
        return Promise.resolve(pick(routes.historySince ?? ok([])));
      case '/api/v1/queue':
        return Promise.resolve(pick(routes.queue ?? ok({ records: [] })));
      default:
        return Promise.resolve(fail(404, 'Not Found'));
    }
  });
}

function paged(records: unknown[]): Record<string, unknown> {
  return ok({
    page: 1,
    pageSize: 50,
    sortKey: 'date',
    sortDirection: 'descending',
    totalRecords: records.length,
    records,
  });
}

const baseRecord = {
  id: 42,
  albumId: 7,
  artistId: 3,
  trackId: 99,
  sourceTitle: 'Artist - Album [FLAC]',
  date: '2026-10-10T11:22:33Z',
  downloadId: 'DL123',
  quality: { quality: { id: 6, name: 'FLAC' } },
  data: { indexer: 'NZBgeek', downloadClient: 'SABnzbd', releaseGroup: 'GRP' },
  artist: { id: 3, artistName: 'Daft Punk' },
  album: { id: 7, artistId: 3, title: 'Discovery' },
};

function record(overrides: Record<string, unknown> = {}): LidarrHistoryRecord {
  return { ...baseRecord, eventType: 'grabbed', ...overrides } as unknown as LidarrHistoryRecord;
}

describe('LidarrProvider', () => {
  let provider: LidarrProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    provider = new LidarrProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Connect with mocked routes and return the provider */
  async function connected(routes: RouteTable = {}): Promise<LidarrProvider> {
    routeFetch(routes);
    await provider.connect({ url: BASE_URL, apiKey: 'key' });
    mockFetch.mockClear();
    return provider;
  }

  /** Normalize a single history record by driving getActivity() */
  async function normalize(rec: LidarrHistoryRecord): Promise<NormalizedActivity> {
    await connected({ history: paged([rec]) });
    const activities = await provider.getActivity();
    const found = activities.find((a) => a.id.startsWith('lidarr-history-'));
    if (!found) throw new Error('no history activity returned');
    return found;
  }

  describe('provider identity', () => {
    it('should have correct id', () => {
      expect(provider.id).toBe('lidarr');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('Lidarr');
    });

    it('should use the artist media type', () => {
      expect((provider as unknown as { getMediaType(): string }).getMediaType()).toBe('artist');
    });
  });

  describe('capabilities', () => {
    it('should have correct capabilities', () => {
      expect(provider.capabilities).toEqual({
        supportsRealTimeLogs: false,
        supportsActivityLog: true,
        supportsSessions: false,
        supportsWebhooks: true,
        supportsPlaybackHistory: false,
      });
    });

    it('should return no sessions or users', async () => {
      await expect(provider.getSessions()).resolves.toEqual([]);
      await expect(provider.getUsers()).resolves.toEqual([]);
    });
  });

  describe('getLogPaths', () => {
    it('should return default log paths when no config', async () => {
      const paths = await provider.getLogPaths();

      expect(paths).toContain('/lidarr-logs');
      expect(paths).toContain('/config/logs');
      expect(paths).toContain('~/.config/Lidarr/logs');
      expect(paths).toContain('/var/lib/lidarr/logs');
      expect(paths).toContain('C:\\ProgramData\\Lidarr\\logs');
    });

    it('should return only the configured log path when set', async () => {
      await connected();
      // reconnect with a custom log path
      await provider.connect({ url: BASE_URL, apiKey: 'key', logPath: '/custom' });

      await expect(provider.getLogPaths()).resolves.toEqual(['/custom']);
    });
  });

  describe('getLogFileConfig', () => {
    it('should return Lidarr log file config', () => {
      expect(provider.getLogFileConfig()).toBe(LIDARR_LOG_FILE_CONFIG);
    });

    it('should describe real Lidarr log files', () => {
      const config = provider.getLogFileConfig();

      expect(config.defaultPaths.docker).toContain('/config/logs');
      expect(config.filePatterns).toContain('lidarr.txt');
      expect(config.filePatterns).toContain('lidarr.*.txt');
      expect(config.filePatterns).toContain('*.log');
      expect(config.encoding).toBe('utf-8');
    });
  });

  describe('log parsing', () => {
    const START =
      '2026-10-10 12:00:01.2|Info|Bootstrap|Starting Lidarr - /app/lidarr/bin/Lidarr - Version 3.1.0.4875';
    const WARN =
      "2026-10-10 12:00:09.4|Warn|ImportApprovedTracks|Couldn't import track /downloads/music/Artist/01 Track.flac";
    const ERROR =
      '2026-10-10 12:01:22.7|Error|DownloadedTracksImportService|Import failed, path does not exist or is not accessible by Lidarr: /downloads/music/Album';
    const NEXT = '2026-10-10 12:01:30.0|Info|Foo|next';

    it('should parse an info line with a one-digit fractional second', () => {
      const entry = provider.parseLogLine(START);

      expect(entry).toMatchObject({
        level: 'info',
        source: 'Bootstrap',
        message: 'Starting Lidarr - /app/lidarr/bin/Lidarr - Version 3.1.0.4875',
      });
      expect(entry?.timestamp).toBeInstanceOf(Date);
    });

    it('should parse warn and error levels', () => {
      expect(provider.parseLogLine(WARN)).toMatchObject({
        level: 'warn',
        source: 'ImportApprovedTracks',
      });
      expect(provider.parseLogLine(ERROR)).toMatchObject({
        level: 'error',
        source: 'DownloadedTracksImportService',
      });
    });

    it('should preserve pipes inside the message', () => {
      const entry = provider.parseLogLine('2026-10-10 12:00:02.0|Info|Foo|a|b|c');

      expect(entry?.source).toBe('Foo');
      expect(entry?.message).toBe('a|b|c');
    });

    it('should return null for non-log lines', () => {
      expect(provider.parseLogLine('   at System.IO.Foo()')).toBeNull();
      expect(provider.parseLogLine('')).toBeNull();
    });

    it('should detect continuation lines', () => {
      expect(
        provider.isLogContinuation(
          '   at NzbDrone.Core.MediaFiles.DiskScanService.GetAudioFiles(String path)'
        )
      ).toBe(true);
      expect(
        provider.isLogContinuation(
          "[v3.1.0.4875] System.IO.DirectoryNotFoundException: Could not find a part of the path '/x'."
        )
      ).toBe(true);
      expect(provider.isLogContinuation(START)).toBe(false);
      expect(provider.isLogContinuation('')).toBe(false);
    });

    it('should return header entries, flag continuations and ignore blank lines', () => {
      const context = { continuationLines: [] as string[], filePath: 'lidarr.txt', lineNumber: 0 };
      const exceptionLine =
        "[v3.1.0.4875] System.IO.DirectoryNotFoundException: Could not find a part of the path '/downloads/music/Album'.";
      const lines = [
        ERROR,
        '',
        exceptionLine,
        '   at System.IO.Enumeration.FileSystemEnumerator`1.CreateDirectoryHandle(String path, Boolean ignoreNotFound)',
        '   at NzbDrone.Core.MediaFiles.DiskScanService.GetAudioFiles(String path, Boolean allDirectories)',
        NEXT,
      ];

      const results = lines.map((line, index) => {
        context.lineNumber = index + 1;
        return provider.parseLogLineWithContext(line, context);
      });

      // header -> current entry; blank -> ignored; exception/stack lines -> continuation
      expect(results.map((r) => r.isContinuation)).toEqual([false, false, true, true, true, false]);
      expect(results[0]?.entry).toMatchObject({
        level: 'error',
        source: 'DownloadedTracksImportService',
      });
      expect(results[1]?.entry).toBeNull();
      expect(results[2]?.entry).toBeNull();
      expect(results[5]?.entry).toMatchObject({ level: 'info', source: 'Foo', message: 'next' });
    });

    it('should populate exception from the [vX] prefixed continuation via finalizeLogEntry', () => {
      const header = provider.parseLogLine(ERROR);
      if (!header) throw new Error('header did not parse');
      const continuation = [
        "[v3.1.0.4875] System.IO.DirectoryNotFoundException: Could not find a part of the path '/downloads/music/Album'.",
        '   at NzbDrone.Core.MediaFiles.DiskScanService.GetAudioFiles(String path, Boolean allDirectories)',
      ];

      const finalized = provider.finalizeLogEntry(header, continuation);

      expect(finalized.exception).toBe('System.IO.DirectoryNotFoundException');
      expect(finalized.level).toBe('error');
      expect(finalized.message).toContain('Import failed, path does not exist');
      expect(finalized.message).toContain('Could not find a part of the path');
    });

    it('should provide correlation patterns', () => {
      const names = provider.getCorrelationPatterns().map((p) => p.name);

      expect(names).toContain('downloadId');
      expect(names).toContain('indexer');
    });
  });

  describe('HTTP behaviour', () => {
    it('should call API v1 system status with X-Api-Key and strip trailing slash', async () => {
      routeFetch({});

      await provider.connect({ url: `${BASE_URL}/`, apiKey: 'key' });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://lidarr:8686/api/v1/system/status');
      expect((init.headers as Record<string, string>)['X-Api-Key']).toBe('key');
    });

    it('should report a successful connection test', async () => {
      await connected();

      await expect(provider.testConnection()).resolves.toEqual({
        connected: true,
        serverInfo: { name: 'Lidarr', version: '3.1.0.4875', id: 'Lidarr-master' },
      });
    });

    it('should prefer a custom instance name and fall back to appName when empty', async () => {
      await connected({ status: ok({ ...STATUS, instanceName: 'Music' }) });
      const named = await provider.testConnection();
      expect(named.serverInfo?.name).toBe('Music');

      await connected({ status: ok({ ...STATUS, instanceName: '' }) });
      const fallback = await provider.testConnection();
      expect(fallback.serverInfo?.name).toBe('Lidarr');
    });

    it('should return server info', async () => {
      await connected();

      await expect(provider.getServerInfo()).resolves.toEqual({
        name: 'Lidarr',
        version: '3.1.0.4875',
        id: 'Lidarr-master',
      });
    });

    it('should reject connect() on 401 with an Arr API error', async () => {
      routeFetch({ status: fail(401, 'Unauthorized') });

      await expect(provider.connect({ url: BASE_URL, apiKey: 'wrong' })).rejects.toThrow(
        /Arr API error.*HTTP 401/s
      );
    });

    it('should report not connected from testConnection after a failed connect', async () => {
      routeFetch({ status: fail(401, 'Unauthorized') });
      await provider.connect({ url: BASE_URL, apiKey: 'wrong' }).catch(() => undefined);

      const result = await provider.testConnection();

      expect(result.connected).toBe(false);
    });

    it('should report not connected when the status call fails later', async () => {
      await connected();
      routeFetch({ status: fail(401, 'Unauthorized') });

      const result = await provider.testConnection();

      expect(result.connected).toBe(false);
      expect(result.error).toContain('HTTP 401');
    });

    it('should throw when used before connecting', async () => {
      await expect(provider.getActivity()).rejects.toThrow('Not connected');
    });

    describe('network failures', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('should retry twice and then reject', async () => {
        mockFetch.mockRejectedValue(new TypeError('fetch failed'));

        const promise = provider.connect({ url: BASE_URL, apiKey: 'key' });
        const assertion = expect(promise).rejects.toThrow(/Network error/);
        await vi.runAllTimersAsync();
        await assertion;

        expect(mockFetch).toHaveBeenCalledTimes(3);
      });
    });
  });

  describe('getActivity requests', () => {
    it('should request recent history with artist and album included', async () => {
      await connected({ history: paged([]) });

      await provider.getActivity();

      const historyCall = mockFetch.mock.calls
        .map(([url]) => new URL(url as string))
        .find((u) => u.pathname === '/api/v1/history');
      expect(historyCall).toBeDefined();
      const params = historyCall?.searchParams;
      expect(params?.get('page')).toBe('1');
      expect(params?.get('pageSize')).toBe('50');
      expect(params?.get('sortKey')).toBe('date');
      expect(params?.get('sortDirection')).toBe('descending');
      expect(params?.get('includeArtist')).toBe('true');
      expect(params?.get('includeAlbum')).toBe('true');
    });

    it('should use history/since when a since date is given', async () => {
      await connected({ historySince: ok([record()]) });

      const activities = await provider.getActivity(new Date('2026-10-10T10:00:00Z'));

      const urls = mockFetch.mock.calls.map(([url]) => new URL(url as string));
      const sinceCall = urls.find((u) => u.pathname === '/api/v1/history/since');
      expect(sinceCall).toBeDefined();
      expect(sinceCall?.searchParams.get('date')).toBe('2026-10-10T10:00:00.000Z');
      expect(sinceCall?.searchParams.get('includeArtist')).toBe('true');
      expect(sinceCall?.searchParams.get('includeAlbum')).toBe('true');
      expect(urls.some((u) => u.pathname === '/api/v1/history')).toBe(false);
      expect(activities.filter((a) => a.id === 'lidarr-history-42')).toHaveLength(1);
    });

    it('should never call API v3', async () => {
      await connected();

      await provider.getActivity();

      for (const [url] of mockFetch.mock.calls) {
        expect(url as string).toContain('/api/v1/');
        expect(url as string).not.toContain('/api/v3/');
      }
    });
  });

  describe('health and queue activities', () => {
    it('should convert warning and error health checks, ignoring ok', async () => {
      await connected({
        health: ok([
          {
            source: 'IndexerStatusCheck',
            type: 'warning',
            message: 'Indexers unavailable due to failures: X',
            wikiUrl: '',
          },
          { source: 'RootFolderCheck', type: 'error', message: 'Missing root folder: /music' },
          { source: 'UpdateCheck', type: 'ok', message: 'fine' },
        ]),
      });

      const activities = await provider.getActivity();

      expect(activities).toHaveLength(2);
      expect(activities[0]).toMatchObject({ type: 'health_warning', severity: 'warn' });
      expect(activities[1]).toMatchObject({ type: 'health_error', severity: 'error' });
    });

    it('should convert queue warnings and exclude healthy items', async () => {
      await connected({
        queue: ok({
          records: [
            {
              downloadId: 'ABC',
              title: 'Artist - Album',
              trackedDownloadStatus: 'warning',
              statusMessages: [
                { title: 't', messages: ['No files found are eligible for import'] },
              ],
            },
            { downloadId: 'DEF', title: 'Fine', trackedDownloadStatus: 'ok', statusMessages: [] },
          ],
        }),
      });

      const activities = await provider.getActivity();

      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        type: 'queue_warning',
        severity: 'warn',
        name: 'Queue issue: Artist - Album',
        overview: 'No files found are eligible for import',
      });
    });

    it('should still return history and queue when health fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await connected({
        health: fail(401, 'Unauthorized'),
        history: paged([record()]),
        queue: ok({
          records: [
            { downloadId: 'ABC', title: 'T', trackedDownloadStatus: 'warning', statusMessages: [] },
          ],
        }),
      });

      const activities = await provider.getActivity();

      expect(activities.map((a) => a.type)).toEqual(['grabbed', 'queue_warning']);
      errorSpy.mockRestore();
    });

    it('should still return health and queue when history fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await connected({
        health: ok([{ source: 'S', type: 'error', message: 'm' }]),
        history: fail(404, 'Not Found'),
        queue: ok({
          records: [
            { downloadId: 'ABC', title: 'T', trackedDownloadStatus: 'warning', statusMessages: [] },
          ],
        }),
      });

      const activities = await provider.getActivity();

      expect(activities.map((a) => a.type)).toEqual(['health_error', 'queue_warning']);
      errorSpy.mockRestore();
    });
  });

  describe('history normalization', () => {
    it('should normalize a grabbed event completely', async () => {
      const activity = await normalize(record({ eventType: 'grabbed' }));

      expect(activity).toEqual({
        id: 'lidarr-history-42',
        type: 'grabbed',
        name: 'Grabbed: Daft Punk - Discovery',
        overview: 'Release grabbed: Artist - Album [FLAC]',
        severity: 'info',
        timestamp: new Date('2026-10-10T11:22:33Z'),
        itemId: '7',
        metadata: {
          artistId: 3,
          albumId: 7,
          trackId: 99,
          mediaType: 'artist',
          quality: 'FLAC',
          downloadId: 'DL123',
          indexer: 'NZBgeek',
          downloadClient: 'SABnzbd',
          releaseGroup: 'GRP',
        },
      });
    });

    const table: readonly [number, string, 'info' | 'warn' | 'error', string][] = [
      [1, 'grabbed', 'info', 'Grabbed:'],
      [2, 'artistFolderImported', 'info', 'Artist Folder Imported:'],
      [3, 'trackFileImported', 'info', 'Imported:'],
      [4, 'downloadFailed', 'error', 'Download Failed:'],
      [5, 'trackFileDeleted', 'info', 'Deleted:'],
      [6, 'trackFileRenamed', 'info', 'Renamed:'],
      [7, 'albumImportIncomplete', 'warn', 'Import Incomplete:'],
      [8, 'downloadImported', 'info', 'Download Imported:'],
      [9, 'trackFileRetagged', 'info', 'Retagged:'],
      [10, 'downloadIgnored', 'info', 'Download Ignored:'],
    ];

    it.each(table)('should map string eventType %i (%s)', async (_n, name, severity, prefix) => {
      const activity = await normalize(record({ eventType: name }));

      expect(activity.type).toBe(name);
      expect(activity.severity).toBe(severity);
      expect(activity.name.startsWith(prefix)).toBe(true);
    });

    it.each(table)('should map numeric eventType %i (%s)', async (n, name, severity, prefix) => {
      const activity = await normalize(record({ eventType: n }));

      expect(activity.type).toBe(name);
      expect(activity.severity).toBe(severity);
      expect(activity.name.startsWith(prefix)).toBe(true);
    });

    it.each(table)('should map numeric-string eventType "%i" (%s)', async (n, name, severity) => {
      const activity = await normalize(record({ eventType: String(n) }));

      expect(activity.type).toBe(name);
      expect(activity.severity).toBe(severity);
    });

    it('should not default imported tracks to grab', async () => {
      const activity = await normalize(record({ eventType: 'trackFileImported' }));

      expect(activity.type).toBe('trackFileImported');
      expect(activity.name).toBe('Imported: Daft Punk - Discovery');
      expect(activity.overview).toBe('Track imported: Artist - Album [FLAC]');
    });

    it('should resolve event types case-insensitively', async () => {
      const activity = await normalize(record({ eventType: 'DownloadFailed' }));

      expect(activity.type).toBe('downloadFailed');
      expect(activity.severity).toBe('error');
    });

    it('should use data.message for failed downloads when present', async () => {
      const withMessage = await normalize(
        record({
          eventType: 'downloadFailed',
          data: { message: 'Unable to connect to download client' },
        })
      );
      expect(withMessage.overview).toBe('Unable to connect to download client');

      const without = await normalize(record({ eventType: 'downloadFailed' }));
      expect(without.overview).toBe('Failed to download: Artist - Album [FLAC]');
    });

    it('should use data.message for incomplete imports as a warning', async () => {
      const activity = await normalize(
        record({ eventType: 'albumImportIncomplete', data: { message: 'Missing 2 tracks' } })
      );

      expect(activity.severity).toBe('warn');
      expect(activity.overview).toBe('Missing 2 tracks');
    });

    it('should append the reason on deleted track files', async () => {
      const activity = await normalize(
        record({ eventType: 'trackFileDeleted', data: { reason: 'Upgrade' } })
      );

      expect(activity.overview).toContain('Track file deleted: Artist - Album [FLAC]');
      expect(activity.overview).toContain('Upgrade');
    });

    it('should fall back for missing artist and album', async () => {
      const noBoth = await normalize(record({ artist: undefined, album: undefined }));
      expect(noBoth.name).toBe('Grabbed: Unknown Artist');

      const noAlbum = await normalize(record({ album: undefined }));
      expect(noAlbum.name).toBe('Grabbed: Daft Punk');
    });

    it('should keep unrecognised string event types as info', async () => {
      const activity = await normalize(record({ eventType: 'somethingNew' }));

      expect(activity.type).toBe('somethingNew');
      expect(activity.severity).toBe('info');
      expect(activity.name).toBe('Something New: Daft Punk - Discovery');
      expect(activity.overview).toBe('Artist - Album [FLAC]');
    });

    it.each([0, 'unknown', 99, 'somethingElse'])(
      'should treat unknown-ish eventType %j as info and never as grab',
      async (eventType) => {
        const activity = await normalize(record({ eventType }));

        expect(activity.severity).toBe('info');
        expect(activity.type).not.toBe('grabbed');
        expect(activity.type).not.toBe('grab');
      }
    );

    it.each([
      [0, undefined],
      [-1, undefined],
      [42, '42'],
    ])('should map albumId %i to itemId %s', async (albumId, expected) => {
      const activity = await normalize(record({ albumId, album: undefined }));

      expect(activity.itemId).toBe(expected);
    });

    it.each(['importFailed', 'SomethingFAILED'])(
      'should treat unknown event type %s containing "fail" as error',
      async (eventType) => {
        const activity = await normalize(record({ eventType }));

        expect(activity.type).toBe(eventType);
        expect(activity.severity).toBe('error');
      }
    );

    it('should keep other unknown event types as info', async () => {
      const activity = await normalize(record({ eventType: 'somethingNew' }));

      expect(activity.severity).toBe('info');
    });

    it('should map eventType 0 to unknown', async () => {
      const activity = await normalize(record({ eventType: 0 }));

      expect(activity.type).toBe('unknown');
    });

    it('should produce stable, unique ids', async () => {
      await connected({
        history: paged([record({ id: 1 }), record({ id: 2 })]),
      });

      const first = await provider.getActivity();
      const second = await provider.getActivity();
      const ids = (list: readonly NormalizedActivity[]): string[] => list.map((a) => a.id);

      expect(ids(first)).toEqual(['lidarr-history-1', 'lidarr-history-2']);
      expect(ids(second)).toEqual(ids(first));
    });

    it.each([
      [1, 'grabbed', 'info'],
      [2, 'artistFolderImported', 'info'],
      [3, 'trackFileImported', 'info'],
      [4, 'downloadFailed', 'error'],
      [5, 'trackFileDeleted', 'info'],
      [6, 'trackFileRenamed', 'info'],
      [7, 'albumImportIncomplete', 'warn'],
      [8, 'downloadImported', 'info'],
      [9, 'trackFileRetagged', 'info'],
      [10, 'downloadIgnored', 'info'],
    ])('should resolve numeric eventType %i to %s with %s severity', async (id, type, severity) => {
      const fromNumber = await normalize(record({ eventType: id }));
      const fromNumericString = await normalize(record({ eventType: String(id) }));

      expect(fromNumber.type).toBe(type);
      expect(fromNumber.severity).toBe(severity);
      expect(fromNumericString.type).toBe(type);
      expect(fromNumericString.severity).toBe(severity);
    });

    it.each([undefined, '', '   '])(
      'should treat blank eventType %j as unknown',
      async (eventType) => {
        const activity = await normalize(record({ eventType }));

        expect(activity.type).toBe('unknown');
        expect(activity.severity).toBe('info');
      }
    );

    it('should fall back to default text when data.message is empty or null', async () => {
      const emptyMessage = await normalize(
        record({ eventType: 'downloadFailed', data: { message: '' } })
      );
      const nullMessage = await normalize(
        record({ eventType: 'albumImportIncomplete', data: { message: null } })
      );

      expect(emptyMessage.overview).toBe('Failed to download: Artist - Album [FLAC]');
      expect(nullMessage.overview).toBe('Album import incomplete: Artist - Album [FLAC]');
    });

    it('should omit an empty album title and leave itemId unset without albumId', async () => {
      const activity = await normalize(
        record({ album: { id: 7, artistId: 3, title: '' }, albumId: undefined })
      );

      expect(activity.name).toBe('Grabbed: Daft Punk');
      expect(activity.itemId).toBeUndefined();
    });

    it('should expose the album id as itemId and a Date timestamp', async () => {
      const activity = await normalize(record());

      expect(activity.itemId).toBe('7');
      expect(activity.timestamp).toBeInstanceOf(Date);
      expect(activity.timestamp.toISOString()).toBe('2026-10-10T11:22:33.000Z');
    });

    it('should tolerate missing optional data', async () => {
      const activity = await normalize(
        record({ data: undefined, quality: undefined, downloadId: undefined, trackId: undefined })
      );

      expect(activity.id).toBe('lidarr-history-42');
      expect(activity.metadata).toMatchObject({
        artistId: 3,
        albumId: 7,
        mediaType: 'artist',
        quality: undefined,
        indexer: undefined,
        downloadClient: undefined,
        releaseGroup: undefined,
      });
    });
  });
});

describe('LidarrEventTypes', () => {
  it('should have correct event type values', () => {
    expect(LidarrEventTypes.Unknown).toBe(0);
    expect(LidarrEventTypes.Grabbed).toBe(1);
    expect(LidarrEventTypes.ArtistFolderImported).toBe(2);
    expect(LidarrEventTypes.TrackFileImported).toBe(3);
    expect(LidarrEventTypes.DownloadFailed).toBe(4);
    expect(LidarrEventTypes.TrackFileDeleted).toBe(5);
    expect(LidarrEventTypes.TrackFileRenamed).toBe(6);
    expect(LidarrEventTypes.AlbumImportIncomplete).toBe(7);
    expect(LidarrEventTypes.DownloadImported).toBe(8);
    expect(LidarrEventTypes.TrackFileRetagged).toBe(9);
    expect(LidarrEventTypes.DownloadIgnored).toBe(10);
  });

  it('should have matching event type names', () => {
    expect(LidarrEventTypeNames[LidarrEventTypes.Unknown]).toBe('unknown');
    expect(LidarrEventTypeNames[LidarrEventTypes.Grabbed]).toBe('grabbed');
    expect(LidarrEventTypeNames[LidarrEventTypes.ArtistFolderImported]).toBe(
      'artistFolderImported'
    );
    expect(LidarrEventTypeNames[LidarrEventTypes.TrackFileImported]).toBe('trackFileImported');
    expect(LidarrEventTypeNames[LidarrEventTypes.DownloadFailed]).toBe('downloadFailed');
    expect(LidarrEventTypeNames[LidarrEventTypes.TrackFileDeleted]).toBe('trackFileDeleted');
    expect(LidarrEventTypeNames[LidarrEventTypes.TrackFileRenamed]).toBe('trackFileRenamed');
    expect(LidarrEventTypeNames[LidarrEventTypes.AlbumImportIncomplete]).toBe(
      'albumImportIncomplete'
    );
    expect(LidarrEventTypeNames[LidarrEventTypes.DownloadImported]).toBe('downloadImported');
    expect(LidarrEventTypeNames[LidarrEventTypes.TrackFileRetagged]).toBe('trackFileRetagged');
    expect(LidarrEventTypeNames[LidarrEventTypes.DownloadIgnored]).toBe('downloadIgnored');
  });
});

describe('LIDARR_LOG_FILE_CONFIG', () => {
  it('should have valid default paths', () => {
    expect(LIDARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
    expect(LIDARR_LOG_FILE_CONFIG.defaultPaths.linux.length).toBeGreaterThan(0);
    expect(LIDARR_LOG_FILE_CONFIG.defaultPaths.windows.length).toBeGreaterThan(0);
    expect(LIDARR_LOG_FILE_CONFIG.defaultPaths.macos.length).toBeGreaterThan(0);
  });
});
