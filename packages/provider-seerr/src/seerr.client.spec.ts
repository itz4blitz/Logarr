import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SeerrClient } from './seerr.client.js';

const mockFetch = vi.fn();

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const fail = (status: number, text = 'err') => ({
  ok: false,
  status,
  statusText: 'x',
  text: async () => text,
});

function calledUrl(index = 0): URL {
  return new URL(String(mockFetch.mock.calls[index]?.[0]));
}

describe('SeerrClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('calls /api/v1 with the X-Api-Key header', async () => {
    mockFetch.mockResolvedValueOnce(ok({ version: '3.5.0' }));
    await new SeerrClient('http://h:5055/', 'K').getAbout();
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe('http://h:5055/api/v1/settings/about');
    expect(mockFetch.mock.calls[0]?.[1]?.headers).toMatchObject({ 'X-Api-Key': 'K' });
  });

  it('keeps reverse proxy sub-paths and strips trailing slashes', async () => {
    mockFetch.mockResolvedValueOnce(ok({ version: '3.5.0' }));
    await new SeerrClient('http://h/seerr//', 'K').getAbout();
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe('http://h/seerr/api/v1/settings/about');
  });

  it('getRequests builds the paging query', async () => {
    mockFetch.mockResolvedValueOnce(ok({ pageInfo: {}, results: [] }));
    await new SeerrClient('http://h', 'K').getRequests({ take: 50, skip: 0 });
    expect(calledUrl().pathname).toBe('/api/v1/request');
    expect(calledUrl().search).toBe('?take=50&skip=0&sort=modified&sortDirection=desc&filter=all');
  });

  it('getIssues builds the paging query', async () => {
    mockFetch.mockResolvedValueOnce(ok({ results: [] }));
    await new SeerrClient('http://h', 'K').getIssues({ take: 50, skip: 50 });
    expect(calledUrl().pathname).toBe('/api/v1/issue');
    expect(calledUrl().search).toBe('?take=50&skip=50&sort=modified&filter=all');
  });

  describe('envelope variants', () => {
    const item = { id: 1, status: 2, updatedAt: '2026-10-10T12:00:00.000Z' };

    it.each([
      [
        'paged envelope',
        { pageInfo: { pages: 1, pageSize: 50, results: 1, page: 1 }, results: [item] },
      ],
      ['envelope without pageInfo', { results: [item] }],
      ['bare array', [item]],
    ])('getRequests accepts %s', async (_name, body) => {
      mockFetch.mockResolvedValueOnce(ok(body));
      await expect(
        new SeerrClient('http://h', 'K').getRequests({ take: 50, skip: 0 })
      ).resolves.toEqual([item]);
    });

    it.each([
      ['paged envelope', { pageInfo: {}, results: [{ id: 5, issueType: 1 }] }],
      ['bare array', [{ id: 5, issueType: 1 }]],
    ])('getIssues accepts %s', async (_name, body) => {
      mockFetch.mockResolvedValueOnce(ok(body));
      await expect(
        new SeerrClient('http://h', 'K').getIssues({ take: 50, skip: 0 })
      ).resolves.toEqual([{ id: 5, issueType: 1 }]);
    });

    it.each([[null], [{}], [{ results: 'nope' }], ['str']])(
      'returns [] for unusable body %j',
      async (body) => {
        mockFetch.mockResolvedValueOnce(ok(body));
        await expect(
          new SeerrClient('http://h', 'K').getRequests({ take: 50, skip: 0 })
        ).resolves.toEqual([]);
      }
    );
  });

  describe('errors', () => {
    it.each([401, 403])('maps %s to an admin API key hint without retrying', async (status) => {
      mockFetch.mockResolvedValue(fail(status));
      await expect(new SeerrClient('http://h', 'K').getAbout()).rejects.toThrow(/ADMIN API key/);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('wraps other HTTP errors', async () => {
      mockFetch.mockResolvedValue(fail(404, 'nf'));
      await expect(new SeerrClient('http://h', 'K').getAbout()).rejects.toThrow(/Seerr API error/);
    });

    it('does not leak the API key in thrown error messages', async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue(fail(500, 'boom'));
      const promise = new SeerrClient('http://h', 'SECRET-KEY').getAbout().catch((e) => e);
      await vi.advanceTimersByTimeAsync(10000);
      const error = await promise;
      expect(error).toBeInstanceOf(Error);
      expect(String(error.message)).not.toContain('SECRET-KEY');
    });
  });

  describe('list normalisation', () => {
    it.each([[null], [{}], [{ results: 'nope' }], ['text'], [42]])(
      'returns an empty list for malformed body %j',
      async (body) => {
        mockFetch.mockResolvedValue(ok(body));
        await expect(
          new SeerrClient('http://h', 'K').getIssues({ take: 1, skip: 0 })
        ).resolves.toEqual([]);
      }
    );

    it('requests newest-modified requests first', async () => {
      mockFetch.mockResolvedValue(ok({ results: [] }));
      await new SeerrClient('http://h', 'K').getRequests({ take: 50, skip: 100 });
      const params = calledUrl().searchParams;
      expect(params.get('sort')).toBe('modified');
      expect(params.get('sortDirection')).toBe('desc');
      expect(params.get('take')).toBe('50');
      expect(params.get('skip')).toBe('100');
    });
  });
});
