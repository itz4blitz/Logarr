import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QBittorrentClient } from './qbittorrent.client.js';
import { QBittorrentProvider } from './qbittorrent.provider.js';
import { resetQBittorrentState } from './qbittorrent.state.js';

const mockFetch = vi.fn();

let counter = 0;
function uniqueUrl(): string {
  counter += 1;
  return `http://login-resp-${counter}.local:8080`;
}

function cookieOfCall(index: number): string | undefined {
  const init = mockFetch.mock.calls[index]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.['Cookie'];
}

/** qBittorrent 5.2.x: 204 No Content, empty body, session cookie */
function login204(): Response {
  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': 'QBT_SID_8080=abc123; HttpOnly; SameSite=Strict; path=/' },
  });
}

describe('login response variants', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    resetQBittorrentState();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts 204 No Content with a session cookie (qBittorrent 5.2.3) and sends the cookie', async () => {
    mockFetch.mockResolvedValueOnce(login204()).mockResolvedValueOnce(new Response('v5.2.3'));
    const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

    await expect(client.getVersion()).resolves.toBe('v5.2.3');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(cookieOfCall(1)).toBe('QBT_SID_8080=abc123');
  });

  it('reuses the 204 session without logging in again', async () => {
    mockFetch
      .mockResolvedValueOnce(login204())
      .mockResolvedValueOnce(new Response('v5.2.3'))
      .mockResolvedValueOnce(new Response('2.15.1'));
    const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

    await client.getVersion();
    await client.getWebApiVersion();

    expect(
      mockFetch.mock.calls.filter(([url]) => String(url).endsWith('/auth/login'))
    ).toHaveLength(1);
    expect(cookieOfCall(2)).toBe('QBT_SID_8080=abc123');
  });

  it('accepts 200 with an empty body and a session cookie', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('', { status: 200, headers: { 'set-cookie': 'SID=x' } }))
      .mockResolvedValueOnce(new Response('v5.2.4'));
    const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

    await expect(client.getVersion()).resolves.toBe('v5.2.4');
    expect(cookieOfCall(1)).toBe('SID=x');
  });

  it('still accepts 200 "Ok." with a cookie', async () => {
    mockFetch
      .mockResolvedValueOnce(new Response('Ok.', { headers: { 'set-cookie': 'SID=y' } }))
      .mockResolvedValueOnce(new Response('v4.6.7'));
    const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

    await expect(client.getVersion()).resolves.toBe('v4.6.7');
  });

  it('rejects an empty 2xx login response without a cookie as unexpected (no escalation)', async () => {
    const base = uniqueUrl();
    const creds = { username: 'admin', secret: 'pw' };
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(
      'Unexpected login response'
    );

    // no cooldown: the next attempt reaches the server
    mockFetch.mockResolvedValueOnce(login204()).mockResolvedValueOnce(new Response('v5.2.3'));
    await expect(new QBittorrentClient(base, creds).getVersion()).resolves.toBe('v5.2.3');
  });

  it('requires a fresh cookie: a stale jar entry plus an empty 204 is not a successful login', async () => {
    const base = uniqueUrl();
    const creds = { username: 'admin', secret: 'pw' };
    const client = new QBittorrentClient(base, creds);
    (client as unknown as { jar: Map<string, string> }).jar.set('QBT_SID_8080', 'stale');
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect((client as unknown as { login: () => Promise<void> }).login()).rejects.toThrow(
      'Unexpected login response'
    );

    // the stale cookie was not sent with the login request and no cooldown was recorded
    expect(cookieOfCall(0)).toBeUndefined();
    mockFetch.mockResolvedValueOnce(login204()).mockResolvedValueOnce(new Response('v5.2.3'));
    await expect(new QBittorrentClient(base, creds).getVersion()).resolves.toBe('v5.2.3');
  });

  it('still treats 200 "Fails." as bad credentials with cooldown escalation', async () => {
    const base = uniqueUrl();
    const creds = { username: 'admin', secret: 'wrong' };
    mockFetch.mockResolvedValueOnce(new Response('Fails.'));
    await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(
      'Invalid qBittorrent username or password'
    );
    await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(/retrying in/);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('still rejects a non-empty unexpected 2xx body without escalation', async () => {
    mockFetch.mockResolvedValueOnce(new Response('<html>proxy</html>', { status: 200 }));
    await expect(
      new QBittorrentClient(uniqueUrl(), { username: 'a', secret: 'b' }).getVersion()
    ).rejects.toThrow('Unexpected login response');
  });

  it('does not treat a 204 login with a body-less non-2xx as success', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(
      new QBittorrentClient(uniqueUrl(), { username: 'a', secret: 'b' }).getVersion()
    ).rejects.toThrow();
  });

  it('API key and bypass paths accept any 2xx without requiring a body', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(new QBittorrentClient(uniqueUrl(), { secret: 'key' }).getVersion()).resolves.toBe(
      ''
    );
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(new QBittorrentClient(uniqueUrl(), { secret: '' }).getVersion()).resolves.toBe('');
  });

  it('connects and tests the connection through the provider with a 204 login', async () => {
    mockFetch.mockImplementation((url: unknown) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith('/auth/login')) return Promise.resolve(login204());
      return Promise.resolve(new Response(path.endsWith('version') ? 'v5.2.3' : '2.15.1'));
    });
    const provider = new QBittorrentProvider();

    await provider.connect({ url: uniqueUrl(), apiKey: 'pw', username: 'admin' });

    await expect(provider.testConnection()).resolves.toEqual({
      connected: true,
      serverInfo: { name: 'qBittorrent', version: '5.2.3', id: 'qbittorrent-webapi-2.15.1' },
    });
  });
});
