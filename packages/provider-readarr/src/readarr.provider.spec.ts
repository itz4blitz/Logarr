/**
 * Tests for Readarr provider
 */

import { READARR_LOG_FILE_CONFIG } from '@logarr/provider-arr';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';

import { ReadarrProvider } from './readarr.provider.js';
import { ReadarrEventTypes, ReadarrEventTypeNames } from './readarr.types.js';

import type { ParsedLogEntry } from '@logarr/core';

const BASE_URL = 'http://readarr:8787';
const API_KEY = 'key';

const STATUS = {
  appName: 'Readarr',
  instanceName: 'Readarr',
  version: '0.4.18.2805',
  branch: 'develop',
};

interface MockResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Headers;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

type FetchFn = (input: string, init?: { headers: Record<string, string> }) => Promise<MockResponse>;
type FetchMock = Mock<FetchFn>;

/** Minimal Response stand-in for what httpRequest reads */
function response(
  body: unknown,
  init: { ok?: boolean; status?: number; statusText?: string } = {}
): MockResponse {
  const ok = init.ok ?? true;
  return {
    ok,
    status: init.status ?? (ok ? 200 : 500),
    statusText: init.statusText ?? (ok ? 'OK' : 'Error'),
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

interface Routes {
  status?: unknown;
  health?: unknown;
  history?: unknown;
  historySince?: unknown;
  queue?: unknown;
}

/** URL-based fetch mock (call order must not matter) */
function routeFetch(mockFetch: FetchMock, routes: Routes = {}): void {
  mockFetch.mockImplementation((input: string) => {
    const url = new URL(input);
    switch (url.pathname) {
      case '/api/v1/system/status':
        return Promise.resolve(response(routes.status ?? STATUS));
      case '/api/v1/health':
        return Promise.resolve(response(routes.health ?? []));
      case '/api/v1/history/since':
        return Promise.resolve(response(routes.historySince ?? []));
      case '/api/v1/history':
        return Promise.resolve(response(routes.history ?? { records: [] }));
      case '/api/v1/queue':
        return Promise.resolve(response(routes.queue ?? { records: [] }));
      default:
        return Promise.resolve(response('not found', { ok: false, status: 404 }));
    }
  });
}

function historyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 101,
    date: '2026-10-10T12:00:00Z',
    eventType: 'bookFileImported',
    sourceTitle: 'Frank Herbert - Dune (2019) [epub]',
    quality: { quality: { id: 1, name: 'EPUB' } },
    authorId: 7,
    bookId: 42,
    downloadId: 'ABC123',
    data: { indexer: 'MyIdx', downloadClient: 'qBit' },
    author: { id: 7, authorName: 'Frank Herbert' },
    book: { id: 42, authorId: 7, title: 'Dune' },
    ...overrides,
  };
}

describe('ReadarrProvider', () => {
  let provider: ReadarrProvider;
  let mockFetch: FetchMock;

  beforeEach(() => {
    provider = new ReadarrProvider();
    mockFetch = vi.fn<FetchFn>();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('provider identity', () => {
    it('should have correct id', () => {
      expect(provider.id).toBe('readarr');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('Readarr');
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

    it('should not expose sessions or users', async () => {
      await expect(provider.getSessions()).resolves.toEqual([]);
      await expect(provider.getUsers()).resolves.toEqual([]);
    });
  });

  describe('getLogPaths', () => {
    it('should return default log paths when no config', async () => {
      const paths = await provider.getLogPaths();

      expect(paths).toContain('/readarr-logs');
      expect(paths).toContain('/config/logs');
      expect(paths).toContain('~/.config/Readarr/logs');
      expect(paths).toContain('/var/lib/readarr/logs');
      expect(paths).toContain('C:\\ProgramData\\Readarr\\logs');
    });

    it('should return only the configured log path after connect', async () => {
      routeFetch(mockFetch);
      await provider.connect({ url: BASE_URL, apiKey: API_KEY, logPath: '/x' });

      await expect(provider.getLogPaths()).resolves.toEqual(['/x']);
    });
  });

  describe('getLogFileConfig', () => {
    it('should return Readarr log file config', () => {
      expect(provider.getLogFileConfig()).toBe(READARR_LOG_FILE_CONFIG);
    });
  });

  describe('log parsing', () => {
    it('should parse a warning line from the error pipeline', () => {
      const entry = provider.parseLogLine(
        '2026-10-10 12:03:44.1|Warn|ReadarrErrorPipeline|Invalid request Validation failed: -- Title: Must not be empty'
      );

      expect(entry).not.toBeNull();
      expect(entry?.level).toBe('warn');
      expect(entry?.source).toBe('ReadarrErrorPipeline');
      expect(entry?.message.startsWith('Invalid request')).toBe(true);
    });

    it('should parse a BookInfo metadata error', () => {
      const entry = provider.parseLogLine(
        "2025-06-20 08:00:01.5|Error|BookInfoProxy|Search for 'x' failed. Invalid response received from BookInfo."
      );

      expect(entry?.level).toBe('error');
      expect(entry?.source).toBe('BookInfoProxy');
      expect(entry?.message).toContain('BookInfo');
    });

    it('should parse the startup line', () => {
      const entry = provider.parseLogLine(
        '2026-10-10 12:00:01.2|Info|Bootstrap|Starting Readarr - /app/readarr/bin/Readarr - Version 0.4.18.2805'
      );

      expect(entry?.level).toBe('info');
      expect(entry?.source).toBe('Bootstrap');
      expect(entry?.message).toContain('Version 0.4.18.2805');
    });

    it('should keep extra pipes in the message', () => {
      const entry = provider.parseLogLine('2026-10-10 12:00:01.2|Warn|X|a|b|c');

      expect(entry?.source).toBe('X');
      expect(entry?.message).toBe('a|b|c');
    });

    it('should return null for a non-log line', () => {
      expect(provider.parseLogLine('this is not a log line')).toBeNull();
    });

    it('should detect continuation lines', () => {
      expect(
        provider.isLogContinuation(
          "[v0.4.18.2805] System.IO.DirectoryNotFoundException: Could not find a part of the path '/downloads/books/Book'."
        )
      ).toBe(true);
      expect(
        provider.isLogContinuation(
          '   at System.IO.Enumeration.FileSystemEnumerator`1.CreateDirectoryHandle(String path, Boolean ignoreNotFound)'
        )
      ).toBe(true);
      expect(provider.isLogContinuation('2026-10-10 12:01:22.7|Info|Next|Message')).toBe(false);
    });

    it('should return the current entry for header lines and flag continuations', () => {
      const context = {
        continuationLines: [] as string[],
        filePath: '/readarr-logs/readarr.txt',
        lineNumber: 1,
      };

      const header = provider.parseLogLineWithContext(
        '2026-10-10 12:01:22.7|Error|DownloadedBooksImportService|Import failed, path does not exist or is not accessible by Readarr: /downloads/books/Book',
        context
      );
      const blank = provider.parseLogLineWithContext('', context);
      const exceptionLine = provider.parseLogLineWithContext(
        "[v0.4.18.2805] System.IO.DirectoryNotFoundException: Could not find a part of the path '/downloads/books/Book'.",
        context
      );
      const stackLine = provider.parseLogLineWithContext(
        '   at System.IO.Enumeration.FileSystemEnumerator`1.CreateDirectoryHandle(String path, Boolean ignoreNotFound)',
        context
      );

      expect(header.isContinuation).toBe(false);
      expect(header.entry?.level).toBe('error');
      expect(header.entry?.source).toBe('DownloadedBooksImportService');
      expect(blank).toEqual({ entry: null, isContinuation: false, previousComplete: false });
      expect(exceptionLine.isContinuation).toBe(true);
      expect(exceptionLine.entry).toBeNull();
      expect(stackLine.isContinuation).toBe(true);
    });

    it('should populate exception from a version-prefixed continuation line', () => {
      const entry = provider.parseLogLine(
        '2026-10-10 12:01:22.7|Error|DownloadedBooksImportService|Import failed'
      );
      expect(entry).not.toBeNull();

      const finalized = provider.finalizeLogEntry(entry as ParsedLogEntry, [
        "[v0.4.18.2805] System.IO.DirectoryNotFoundException: Could not find a part of the path '/downloads/books/Book'.",
        '   at System.IO.Enumeration.FileSystemEnumerator`1.CreateDirectoryHandle(String path, Boolean ignoreNotFound)',
      ]);

      expect(finalized.exception).toBe('System.IO.DirectoryNotFoundException');
      expect(finalized.message).toBe(
        "Import failed - Could not find a part of the path '/downloads/books/Book'."
      );
    });

    it('should leave the entry unchanged when continuation lines hold no exception', () => {
      const entry = provider.parseLogLine('2026-10-10 12:01:22.7|Error|X|Something failed');

      const finalized = provider.finalizeLogEntry(entry as ParsedLogEntry, ['   at Foo.Bar()']);

      expect(finalized.exception).toBeUndefined();
      expect(finalized.message).toBe('Something failed');
    });
  });

  describe('connection and HTTP behaviour', () => {
    it('should test the connection against the v1 status endpoint with the API key', async () => {
      routeFetch(mockFetch);

      await provider.connect({ url: BASE_URL, apiKey: API_KEY });
      const status = await provider.testConnection();

      expect(status).toEqual({
        connected: true,
        serverInfo: { name: 'Readarr', version: '0.4.18.2805', id: 'Readarr-develop' },
      });

      const [firstUrl, firstInit] = mockFetch.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(firstUrl).toBe('http://readarr:8787/api/v1/system/status');
      expect(firstInit.headers['X-Api-Key']).toBe(API_KEY);
      expect(mockFetch.mock.calls.every(([url]) => !(url as string).includes('/api/v3'))).toBe(
        true
      );
    });

    it('should normalise a trailing slash in the base URL', async () => {
      routeFetch(mockFetch);

      await provider.connect({ url: `${BASE_URL}///`, apiKey: API_KEY });

      expect(mockFetch.mock.calls[0]?.[0]).toBe('http://readarr:8787/api/v1/system/status');
    });

    it('should fall back to appName when instanceName is empty', async () => {
      routeFetch(mockFetch, { status: { ...STATUS, instanceName: '' } });

      await provider.connect({ url: BASE_URL, apiKey: API_KEY });
      const info = await provider.getServerInfo();

      expect(info.name).toBe('Readarr');
    });

    it('should reject connect on 401 without retrying', async () => {
      mockFetch.mockResolvedValue(
        response('Unauthorized', { ok: false, status: 401, statusText: 'Unauthorized' })
      );

      await expect(provider.connect({ url: BASE_URL, apiKey: 'bad' })).rejects.toThrow(
        /Arr API error/
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should report not connected when the client never initialised', async () => {
      const status = await provider.testConnection();

      expect(status.connected).toBe(false);
    });

    it('should retry server errors then reject', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(
        response('boom', { ok: false, status: 500, statusText: 'Internal Server Error' })
      );

      const result = expect(provider.connect({ url: BASE_URL, apiKey: API_KEY })).rejects.toThrow(
        /Arr API error/
      );
      await vi.runAllTimersAsync();
      await result;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('getActivity', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('should request history with author and book included', async () => {
      routeFetch(mockFetch);
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      await provider.getActivity();

      const urls = mockFetch.mock.calls.map(([url]) => url as string);
      const historyUrl = urls.find((url) => new URL(url).pathname === '/api/v1/history');
      expect(historyUrl).toBeDefined();
      expect(historyUrl).toContain('includeAuthor=true');
      expect(historyUrl).toContain('includeBook=true');
      expect(historyUrl).toContain('sortKey=date');
      expect(historyUrl).toContain('pageSize=50');
    });

    it('should use history/since when a since date is given', async () => {
      routeFetch(mockFetch);
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      await provider.getActivity(new Date('2026-10-10T00:00:00.000Z'));

      const urls = mockFetch.mock.calls.map(([url]) => url as string);
      expect(urls).toContain(
        'http://readarr:8787/api/v1/history/since?date=2026-10-10T00%3A00%3A00.000Z&includeAuthor=true&includeBook=true'
      );
    });

    it('should normalise an imported book record', async () => {
      routeFetch(mockFetch, { history: { records: [historyRecord()] } });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();

      expect(activities).toContainEqual({
        id: 'readarr-history-101',
        type: 'bookFileImported',
        name: 'Imported: Frank Herbert - Dune',
        overview: 'Book file imported: Frank Herbert - Dune (2019) [epub]',
        severity: 'info',
        itemId: '42',
        timestamp: new Date('2026-10-10T12:00:00Z'),
        metadata: {
          authorId: 7,
          bookId: 42,
          mediaType: 'book',
          quality: 'EPUB',
          downloadId: 'ABC123',
          indexer: 'MyIdx',
          downloadClient: 'qBit',
          releaseGroup: undefined,
        },
      });
    });

    it('should normalise records returned by history/since', async () => {
      routeFetch(mockFetch, { historySince: [historyRecord({ id: 202 })] });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity(new Date('2026-10-10T00:00:00.000Z'));

      expect(activities.map((a) => a.id)).toContain('readarr-history-202');
    });

    it.each([
      // [eventType, expected type, name prefix, severity]
      ['grabbed', 'grabbed', 'Grabbed:', 'info'],
      [1, 'grabbed', 'Grabbed:', 'info'],
      ['bookFileImported', 'bookFileImported', 'Imported:', 'info'],
      [3, 'bookFileImported', 'Imported:', 'info'],
      ['downloadImported', 'downloadImported', 'Download Imported:', 'info'],
      [8, 'downloadImported', 'Download Imported:', 'info'],
      ['downloadFailed', 'downloadFailed', 'Download Failed:', 'error'],
      [4, 'downloadFailed', 'Download Failed:', 'error'],
      ['bookImportIncomplete', 'bookImportIncomplete', 'Import Incomplete:', 'warn'],
      [7, 'bookImportIncomplete', 'Import Incomplete:', 'warn'],
      ['bookFileDeleted', 'bookFileDeleted', 'Deleted:', 'info'],
      [5, 'bookFileDeleted', 'Deleted:', 'info'],
      ['bookFileRenamed', 'bookFileRenamed', 'Renamed:', 'info'],
      [6, 'bookFileRenamed', 'Renamed:', 'info'],
      ['bookFileRetagged', 'bookFileRetagged', 'Retagged:', 'info'],
      [9, 'bookFileRetagged', 'Retagged:', 'info'],
      ['downloadIgnored', 'downloadIgnored', 'Download Ignored:', 'info'],
      [10, 'downloadIgnored', 'Download Ignored:', 'info'],
      ['3', 'bookFileImported', 'Imported:', 'info'],
    ] as const)(
      'should map eventType %j to type %s (%s, %s)',
      async (eventType, type, prefix, severity) => {
        routeFetch(mockFetch, { history: { records: [historyRecord({ eventType })] } });
        await provider.connect({ url: BASE_URL, apiKey: API_KEY });

        const activities = await provider.getActivity();
        const activity = activities.find((a) => a.id === 'readarr-history-101');

        expect(activity?.type).toBe(type);
        expect(activity?.name.startsWith(prefix)).toBe(true);
        expect(activity?.severity).toBe(severity);
      }
    );

    it('should use the failure message for downloadFailed when present', async () => {
      routeFetch(mockFetch, {
        history: {
          records: [
            historyRecord({ eventType: 'downloadFailed', data: { message: 'Unable to connect' } }),
          ],
        },
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();
      const activity = activities.find((a) => a.id === 'readarr-history-101');

      expect(activity?.severity).toBe('error');
      expect(activity?.overview).toBe('Unable to connect');
    });

    it('should fall back to the source title for downloadFailed without a message', async () => {
      routeFetch(mockFetch, {
        history: { records: [historyRecord({ eventType: 'downloadFailed', data: {} })] },
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();
      const activity = activities.find((a) => a.id === 'readarr-history-101');

      expect(activity?.overview).toBe('Failed to download: Frank Herbert - Dune (2019) [epub]');
    });

    it.each([
      [2, 'unknown'],
      ['2', 'unknown'],
      [0, 'unknown'],
      [99, 'unknown'],
      ['unknown', 'unknown'],
    ] as const)(
      'should map unknown/gap eventType %j to %s with info severity',
      async (eventType, type) => {
        routeFetch(mockFetch, { history: { records: [historyRecord({ eventType })] } });
        await provider.connect({ url: BASE_URL, apiKey: API_KEY });

        const activities = await provider.getActivity();
        const activity = activities.find((a) => a.id === 'readarr-history-101');

        expect(activity?.type).toBe(type);
        expect(activity?.severity).toBe('info');
        expect(activity?.name).toBe('Unknown: Frank Herbert - Dune');
      }
    );

    it('should keep unrecognised string event names', async () => {
      routeFetch(mockFetch, {
        history: { records: [historyRecord({ eventType: 'somethingNew' })] },
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();
      const activity = activities.find((a) => a.id === 'readarr-history-101');

      expect(activity?.type).toBe('somethingNew');
      expect(activity?.name).toBe('Something New: Frank Herbert - Dune');
      expect(activity?.severity).toBe('info');
    });

    it.each([
      ['importFailed', 'error'],
      ['SomethingFAILED', 'error'],
      ['somethingNew', 'info'],
    ] as const)(
      'should set severity for unrecognised event %s to %s',
      async (eventType, severity) => {
        routeFetch(mockFetch, { history: { records: [historyRecord({ eventType })] } });
        await provider.connect({ url: BASE_URL, apiKey: API_KEY });

        const activities = await provider.getActivity();
        const activity = activities.find((a) => a.id === 'readarr-history-101');

        expect(activity?.type).toBe(eventType);
        expect(activity?.severity).toBe(severity);
      }
    );

    it.each([
      [0, undefined],
      [-1, undefined],
      [42, '42'],
    ] as const)('should set itemId only for positive bookId (%j)', async (bookId, itemId) => {
      routeFetch(mockFetch, { history: { records: [historyRecord({ bookId })] } });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();
      const activity = activities.find((a) => a.id === 'readarr-history-101');

      expect(activity?.itemId).toBe(itemId);
    });

    it('should not treat unknown events as grabs', async () => {
      routeFetch(mockFetch, { history: { records: [historyRecord({ eventType: 2 })] } });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();
      const activity = activities.find((a) => a.id === 'readarr-history-101');

      expect(activity?.name.startsWith('Grabbed')).toBe(false);
    });

    it('should tolerate records without author and book', async () => {
      routeFetch(mockFetch, {
        history: {
          records: [historyRecord({ eventType: 'grabbed', author: undefined, book: undefined })],
        },
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();
      const activity = activities.find((a) => a.id === 'readarr-history-101');

      expect(activity?.name).toBe('Grabbed: Unknown Author');
    });

    it('should normalise health warnings and errors and skip ok checks', async () => {
      routeFetch(mockFetch, {
        health: [
          { source: 'IndexerStatusCheck', type: 'warning', message: 'Indexers unavailable' },
          { source: 'MetadataCheck', type: 'error', message: 'BookInfo unreachable' },
          { source: 'X', type: 'ok', message: 'fine' },
        ],
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();
      const health = activities.filter((a) => a.type.startsWith('health_'));

      expect(health.map((a) => [a.type, a.severity])).toEqual([
        ['health_warning', 'warn'],
        ['health_error', 'error'],
      ]);
    });

    it('should normalise queue warnings', async () => {
      routeFetch(mockFetch, {
        queue: {
          records: [
            {
              id: 1,
              title: 'Dune',
              downloadId: 'ABC123',
              trackedDownloadStatus: 'warning',
              statusMessages: [{ title: 't', messages: ['No files found'] }],
            },
          ],
        },
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();
      const queue = activities.find((a) => a.type === 'queue_warning');

      expect(queue?.name).toBe('Queue issue: Dune');
      expect(queue?.overview).toBe('No files found');
    });

    it('should still return history when the health request fails', async () => {
      mockFetch.mockImplementation((input: string) => {
        const pathname = new URL(input).pathname;
        if (pathname === '/api/v1/health') {
          return Promise.reject(new TypeError('boom'));
        }
        if (pathname === '/api/v1/history') {
          return Promise.resolve(response({ records: [historyRecord()] }));
        }
        if (pathname === '/api/v1/queue') {
          return Promise.resolve(response({ records: [] }));
        }
        return Promise.resolve(response(STATUS));
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const activities = await provider.getActivity();

      expect(activities.map((a) => a.id)).toContain('readarr-history-101');
      expect(console.error).toHaveBeenCalled();
    });

    it('should produce stable history ids across polls', async () => {
      routeFetch(mockFetch, { history: { records: [historyRecord()] } });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const first = await provider.getActivity();
      const second = await provider.getActivity();
      const ids = (list: typeof first): string[] =>
        list.filter((a) => a.id.startsWith('readarr-history-')).map((a) => a.id);

      expect(ids(first)).toEqual(['readarr-history-101']);
      expect(ids(second)).toEqual(ids(first));
    });

    async function activityFor(overrides: Record<string, unknown>): Promise<object> {
      routeFetch(mockFetch, { history: { records: [historyRecord(overrides)] } });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });
      const activities = await provider.getActivity();
      return activities.find((a) => a.id === 'readarr-history-101') as object;
    }

    it('should describe a grab with the release title', async () => {
      const activity = (await activityFor({ eventType: 'grabbed' })) as { overview: string };

      expect(activity.overview).toBe('Release grabbed: Frank Herbert - Dune (2019) [epub]');
    });

    it('should use the message for bookImportIncomplete and fall back to the source title', async () => {
      const withMsg = (await activityFor({
        eventType: 'bookImportIncomplete',
        data: { message: 'Missing tracks' },
      })) as { overview: string };
      const without = (await activityFor({
        eventType: 'bookImportIncomplete',
        data: {},
      })) as { overview: string };

      expect(withMsg.overview).toBe('Missing tracks');
      expect(without.overview).toBe('Book import incomplete: Frank Herbert - Dune (2019) [epub]');
    });

    it('should describe an ignored download without a message', async () => {
      const activity = (await activityFor({ eventType: 'downloadIgnored', data: {} })) as {
        overview: string;
      };

      expect(activity.overview).toBe('Download ignored: Frank Herbert - Dune (2019) [epub]');
    });

    it.each([
      ['bookFileImported', 'Book file imported'],
      ['bookFileDeleted', 'Book file deleted'],
      ['bookFileRenamed', 'Book file renamed'],
      ['bookFileRetagged', 'Book file retagged'],
      ['downloadImported', 'Download imported'],
    ] as const)(
      'should describe %s as "<thing> <verb>: <sourceTitle>"',
      async (eventType, text) => {
        const activity = (await activityFor({ eventType })) as { overview: string; name: string };
        const withoutBook = (await activityFor({ eventType, book: undefined })) as {
          overview: string;
          name: string;
        };

        expect(activity.overview).toBe(`${text}: Frank Herbert - Dune (2019) [epub]`);
        expect(withoutBook.overview).toBe(activity.overview);
        expect(withoutBook.name.endsWith(': Frank Herbert')).toBe(true);
      }
    );

    it('should append the deletion reason when present', async () => {
      const activity = (await activityFor({
        eventType: 'bookFileDeleted',
        data: { reason: 'Manual' },
      })) as { overview: string };

      expect(activity.overview).toBe(
        'Book file deleted: Frank Herbert - Dune (2019) [epub] (Manual)'
      );
    });

    it('should canonicalise the case of the event type', async () => {
      const activity = (await activityFor({
        eventType: 'DownloadFailed',
        data: {},
      })) as { type: string; overview: string; severity: string };

      expect(activity.type).toBe('downloadFailed');
      expect(activity.severity).toBe('error');
      expect(activity.overview).toBe('Failed to download: Frank Herbert - Dune (2019) [epub]');
    });

    it('should emit mediaType and releaseGroup in metadata', async () => {
      const activity = (await activityFor({
        data: { indexer: 'MyIdx', releaseGroup: 'GRP' },
      })) as { metadata: Record<string, unknown> };

      expect(activity.metadata['mediaType']).toBe('book');
      expect(activity.metadata['releaseGroup']).toBe('GRP');
    });

    it('should treat an empty-string eventType as unknown', async () => {
      const activity = (await activityFor({ eventType: '' })) as { type: string };

      expect(activity.type).toBe('unknown');
    });

    it('should leave itemId undefined when bookId is missing', async () => {
      const activity = (await activityFor({ bookId: undefined })) as { itemId?: string };

      expect(activity.itemId).toBeUndefined();
    });

    it('should degrade to the other sources when the history request fails', async () => {
      mockFetch.mockImplementation((input: string) => {
        const pathname = new URL(input).pathname;
        if (pathname === '/api/v1/history') {
          return Promise.resolve(response('nope', { ok: false, status: 404 }));
        }
        return Promise.resolve(response(pathname === '/api/v1/health' ? [] : STATUS));
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      await expect(provider.getActivity()).resolves.toEqual([]);
      expect(console.error).toHaveBeenCalled();
    });

    it('should give distinct ids to distinct history records', async () => {
      routeFetch(mockFetch, {
        history: { records: [historyRecord({ id: 1 }), historyRecord({ id: 2 })] },
      });
      await provider.connect({ url: BASE_URL, apiKey: API_KEY });

      const ids = (await provider.getActivity())
        .map((a) => a.id)
        .filter((id) => id.startsWith('readarr-history-'));

      expect(ids).toEqual(['readarr-history-1', 'readarr-history-2']);
    });
  });
});

describe('ReadarrEventTypes', () => {
  it('should have correct event type values', () => {
    expect(ReadarrEventTypes.Unknown).toBe(0);
    expect(ReadarrEventTypes.Grabbed).toBe(1);
    expect(ReadarrEventTypes.BookFileImported).toBe(3);
    expect(ReadarrEventTypes.DownloadFailed).toBe(4);
    expect(ReadarrEventTypes.BookFileDeleted).toBe(5);
    expect(ReadarrEventTypes.BookFileRenamed).toBe(6);
    expect(ReadarrEventTypes.BookImportIncomplete).toBe(7);
    expect(ReadarrEventTypes.DownloadImported).toBe(8);
    expect(ReadarrEventTypes.BookFileRetagged).toBe(9);
    expect(ReadarrEventTypes.DownloadIgnored).toBe(10);
  });

  it('should not define value 2 (gap in the upstream enum)', () => {
    expect(Object.values(ReadarrEventTypes)).not.toContain(2);
    expect(ReadarrEventTypeNames[2]).toBeUndefined();
  });

  it('should have matching event type names', () => {
    expect(ReadarrEventTypeNames[ReadarrEventTypes.Unknown]).toBe('unknown');
    expect(ReadarrEventTypeNames[ReadarrEventTypes.Grabbed]).toBe('grabbed');
    expect(ReadarrEventTypeNames[ReadarrEventTypes.BookFileImported]).toBe('bookFileImported');
    expect(ReadarrEventTypeNames[ReadarrEventTypes.DownloadFailed]).toBe('downloadFailed');
    expect(ReadarrEventTypeNames[ReadarrEventTypes.BookFileDeleted]).toBe('bookFileDeleted');
    expect(ReadarrEventTypeNames[ReadarrEventTypes.BookFileRenamed]).toBe('bookFileRenamed');
    expect(ReadarrEventTypeNames[ReadarrEventTypes.BookImportIncomplete]).toBe(
      'bookImportIncomplete'
    );
    expect(ReadarrEventTypeNames[ReadarrEventTypes.DownloadImported]).toBe('downloadImported');
    expect(ReadarrEventTypeNames[ReadarrEventTypes.BookFileRetagged]).toBe('bookFileRetagged');
    expect(ReadarrEventTypeNames[ReadarrEventTypes.DownloadIgnored]).toBe('downloadIgnored');
  });
});

describe('READARR_LOG_FILE_CONFIG', () => {
  it('should match real Readarr log file names', () => {
    expect(READARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
    expect(READARR_LOG_FILE_CONFIG.filePatterns).toContain('readarr.txt');
    expect(READARR_LOG_FILE_CONFIG.filePatterns).toContain('readarr.*.txt');
    expect(READARR_LOG_FILE_CONFIG.encoding).toBe('utf-8');
  });
});
