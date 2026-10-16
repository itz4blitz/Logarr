import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QBittorrentClient } from './qbittorrent.client.js';
import { QBittorrentProvider } from './qbittorrent.provider.js';
import {
  BoundedCache,
  connectionStates,
  logCursors,
  resetQBittorrentState,
  sessionCache,
} from './qbittorrent.state.js';

const mockFetch = vi.fn();

describe('BoundedCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and returns values', () => {
    const cache = new BoundedCache<number>(3, 1000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    expect(cache.has('a')).toBe(true);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts the least recently used entry beyond the size cap', () => {
    const cache = new BoundedCache<number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // a is now more recent than b
    cache.set('c', 3);

    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('expires idle entries after the TTL and refreshes the TTL on access', () => {
    const cache = new BoundedCache<number>(10, 1000);
    cache.set('a', 1);
    cache.set('b', 2);

    vi.advanceTimersByTime(800);
    expect(cache.get('a')).toBe(1); // refreshed
    vi.advanceTimersByTime(800);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
    vi.advanceTimersByTime(1001);
    expect(cache.size).toBe(0);
  });

  it('supports delete and clear', () => {
    const cache = new BoundedCache<number>(10, 1000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.delete('a');
    expect(cache.has('a')).toBe(false);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('qBittorrent process-wide state', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    resetQBittorrentState();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetQBittorrentState();
  });

  it('bounds the session cache when many servers log in', async () => {
    mockFetch.mockImplementation((url: unknown) =>
      Promise.resolve(
        String(url).endsWith('/auth/login')
          ? new Response('Ok.', { headers: { 'set-cookie': 'SID=x' } })
          : new Response('v5.2.4')
      )
    );

    for (let i = 0; i < 130; i++) {
      await new QBittorrentClient(`http://bounded-${i}.local:8080`, {
        username: 'u',
        secret: 'p',
      }).getVersion();
    }

    expect(sessionCache.size).toBe(100);
  });

  it('bounds log cursors and connection states', async () => {
    mockFetch.mockImplementation((url: unknown) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/log/main')) return Promise.resolve(new Response('[]'));
      if (path.endsWith('/transfer/info'))
        return Promise.resolve(new Response('{"connection_status":"connected"}'));
      if (path.endsWith('/torrents/info')) return Promise.resolve(new Response('[]'));
      return Promise.resolve(new Response(path.endsWith('version') ? 'v5.2.4' : '2.15.1'));
    });

    for (let i = 0; i < 120; i++) {
      const provider = new QBittorrentProvider();
      await provider.connect({ url: `http://cursor-${i}.local:8080`, apiKey: '' });
      await provider.getActivity();
    }

    expect(logCursors.size).toBe(100);
    expect(connectionStates.size).toBe(100);
  });

  it('resetQBittorrentState clears everything', () => {
    sessionCache.set('a', new Map());
    logCursors.set('a', { lastId: 1, lastTs: 1, fullSyncAt: 1 });
    resetQBittorrentState();
    expect(sessionCache.size).toBe(0);
    expect(logCursors.size).toBe(0);
  });
});

describe('QBittorrentProvider.getActivity error policy', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    resetQBittorrentState();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws "Not connected" before connect', async () => {
    await expect(new QBittorrentProvider().getActivity()).rejects.toThrow('Not connected');
  });

  it('rethrows the first error when every source fails', async () => {
    const provider = new QBittorrentProvider();
    let healthy = true;
    mockFetch.mockImplementation((url: unknown) => {
      const path = new URL(String(url)).pathname;
      if (healthy) {
        return Promise.resolve(new Response(path.endsWith('version') ? 'v5.2.4' : '2.15.1'));
      }
      return Promise.resolve(new Response('boom', { status: 500 }));
    });
    await provider.connect({ url: 'http://allfail.local:8080', apiKey: '' });
    healthy = false;

    await expect(provider.getActivity()).rejects.toThrow('qBittorrent API error: HTTP 500');
    expect(console.error).toHaveBeenCalledWith(
      '[qbittorrent] Failed to get log messages:',
      expect.any(Error)
    );
    expect(console.error).toHaveBeenCalledWith(
      '[qbittorrent] Failed to get errored torrents:',
      expect.any(Error)
    );
    expect(console.error).toHaveBeenCalledWith(
      '[qbittorrent] Failed to get connection status:',
      expect.any(Error)
    );
  });

  it('counts only attempted sources: with a logPath, two failures are a total failure', async () => {
    const provider = new QBittorrentProvider();
    let healthy = true;
    mockFetch.mockImplementation((url: unknown) => {
      const path = new URL(String(url)).pathname;
      return Promise.resolve(
        healthy
          ? new Response(path.endsWith('version') ? 'v5.2.4' : '2.15.1')
          : new Response('boom', { status: 500 })
      );
    });
    await provider.connect({ url: 'http://allfail2.local:8080', apiKey: '', logPath: '/logs' });
    healthy = false;

    await expect(provider.getActivity()).rejects.toThrow('HTTP 500');
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
