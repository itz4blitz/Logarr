import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BazarrClient } from './bazarr.client.js';

const mockFetch = vi.fn();

function ok(body: unknown): unknown {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

function fail(status: number, statusText: string): unknown {
  return { ok: false, status, statusText, text: () => Promise.resolve('x') };
}

function requestedUrl(call = 0): URL {
  return new URL(String(mockFetch.mock.calls[call]?.[0]));
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

describe('BazarrClient', () => {
  it('sends the API key in X-API-KEY and unwraps the data envelope', async () => {
    mockFetch.mockResolvedValue(ok({ data: { bazarr_version: '1.6.2' } }));
    const client = new BazarrClient('http://bazarr:6767', 'secret');

    await expect(client.getSystemStatus()).resolves.toEqual({ bazarr_version: '1.6.2' });

    const init = mockFetch.mock.calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers['X-API-KEY']).toBe('secret');
    expect(requestedUrl().pathname).toBe('/api/system/status');
  });

  it('strips multiple trailing slashes from the base URL', async () => {
    mockFetch.mockResolvedValue(ok({ data: [] }));

    await new BazarrClient('http://bazarr:6767///', 'k').getHealth();

    expect(requestedUrl().href).toBe('http://bazarr:6767/api/system/health');
  });

  it('passes start and length for history endpoints', async () => {
    mockFetch.mockResolvedValue(ok({ data: [], total: 0 }));
    const client = new BazarrClient('http://bazarr:6767', 'k');

    await client.getEpisodeHistory(25, 50);
    await client.getMovieHistory();

    expect(requestedUrl(0).pathname).toBe('/api/episodes/history');
    expect(requestedUrl(0).searchParams.get('start')).toBe('50');
    expect(requestedUrl(0).searchParams.get('length')).toBe('25');
    expect(requestedUrl(1).pathname).toBe('/api/movies/history');
    expect(requestedUrl(1).searchParams.get('start')).toBe('0');
    expect(requestedUrl(1).searchParams.get('length')).toBe('50');
  });

  it('adds the status filter only when requested for jobs', async () => {
    mockFetch.mockResolvedValue(ok({ data: [] }));
    const client = new BazarrClient('http://bazarr:6767', 'k');

    await client.getJobs();
    await client.getJobs('failed');

    expect(requestedUrl(0).search).toBe('');
    expect(requestedUrl(1).searchParams.get('status')).toBe('failed');
  });

  it('testConnection resolves true on success', async () => {
    mockFetch.mockResolvedValue(ok({ data: { bazarr_version: '1.6.2' } }));

    await expect(new BazarrClient('http://bazarr:6767', 'k').testConnection()).resolves.toBe(true);
  });

  it('wraps HTTP errors with the status and a suggestion, without leaking the API key', async () => {
    mockFetch.mockResolvedValue(fail(401, 'Unauthorized'));
    const client = new BazarrClient('http://bazarr:6767', 'super-secret-key');

    const error = await client.getSystemStatus().catch((e: unknown) => e as Error);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/^Bazarr API error: /);
    expect(error.message).toMatch(/401/);
    expect(error.message).toMatch(/Authentication failed/);
    expect(error.message).not.toContain('super-secret-key');
  });

  it('does not retry on 401', async () => {
    mockFetch.mockResolvedValue(fail(401, 'Unauthorized'));

    await new BazarrClient('http://bazarr:6767', 'k').getHealth().catch(() => undefined);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries transient 5xx responses and recovers', async () => {
    vi.useFakeTimers();
    try {
      mockFetch
        .mockResolvedValueOnce(fail(503, 'Service Unavailable'))
        .mockResolvedValueOnce(ok({ data: [{ object: 'a', issue: 'b' }] }));

      const pending = new BazarrClient('http://bazarr:6767', 'k').getHealth();
      await vi.runAllTimersAsync();

      await expect(pending).resolves.toEqual([{ object: 'a', issue: 'b' }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after the retry budget on persistent 5xx', async () => {
    vi.useFakeTimers();
    try {
      mockFetch.mockResolvedValue(fail(500, 'Internal Server Error'));

      const pending = new BazarrClient('http://bazarr:6767', 'k').getHealth().then(
        () => new Error('expected rejection'),
        (e: unknown) => e as Error
      );
      await vi.runAllTimersAsync();

      const error = await pending;
      expect(error.message).toMatch(/^Bazarr API error: /);
      expect(error.message).toMatch(/500/);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces network failures as a Bazarr API error', async () => {
    vi.useFakeTimers();
    try {
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      const pending = new BazarrClient('http://bazarr:6767', 'k')
        .getSystemStatus()
        .catch((e: unknown) => e as Error);
      await vi.runAllTimersAsync();

      const error = await pending;
      expect(error.message).toMatch(/Bazarr API error: .*bazarr:6767/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects non-object and null bodies', async () => {
    const client = new BazarrClient('http://bazarr:6767', 'k');

    mockFetch.mockResolvedValueOnce(ok(null));
    await expect(client.getHealth()).rejects.toThrow('Unexpected Bazarr response');

    mockFetch.mockResolvedValueOnce(ok('<html>login</html>'));
    await expect(client.getHealth()).rejects.toThrow('Unexpected Bazarr response');
  });

  it('rejects an envelope-less object such as a bare error payload', async () => {
    mockFetch.mockResolvedValue(ok({ message: 'nope' }));

    await expect(new BazarrClient('http://bazarr:6767', 'k').getJobs()).rejects.toThrow(
      'Unexpected Bazarr response'
    );
  });

  it('returns data as-is when the envelope carries a null payload', async () => {
    mockFetch.mockResolvedValue(ok({ data: null }));

    await expect(new BazarrClient('http://bazarr:6767', 'k').getHealth()).resolves.toBeNull();
  });
});
