import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QBittorrentClient } from './qbittorrent.client.js';

const mockFetch = vi.fn();

let counter = 0;
/** Unique base URL per test so module-level session/cooldown maps never leak between tests */
function uniqueUrl(): string {
  counter += 1;
  return `http://qb-${counter}.local:8080`;
}

function ok(body = 'Ok.', init: { status?: number; cookies?: string[] } = {}): Response {
  const headers = new Headers();
  for (const cookie of init.cookies ?? []) {
    headers.append('set-cookie', cookie);
  }
  return new Response(body, { status: init.status ?? 200, headers });
}

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function calls(): RecordedCall[] {
  return mockFetch.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: (init as RequestInit | undefined)?.method ?? 'GET',
    headers: ((init as RequestInit | undefined)?.headers ?? {}) as Record<string, string>,
    body: (init as RequestInit | undefined)?.body as string | undefined,
  }));
}

describe('QBittorrentClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('auth mode detection', () => {
    it('uses login mode when a username is given', () => {
      expect(new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' }).authMode).toBe(
        'login'
      );
    });

    it('uses apiKey mode without username but with a secret', () => {
      expect(new QBittorrentClient(uniqueUrl(), { secret: 'key' }).authMode).toBe('apiKey');
    });

    it('uses none mode without username and secret', () => {
      expect(new QBittorrentClient(uniqueUrl(), { secret: '' }).authMode).toBe('none');
      expect(new QBittorrentClient(uniqueUrl(), { username: '  ', secret: '' }).authMode).toBe(
        'none'
      );
    });
  });

  describe('login mode', () => {
    it('logs in with form encoded body, Referer and Origin, then sends the session cookie', async () => {
      const base = `${uniqueUrl()}/`;
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['QBT_SID_8080=abc123; HttpOnly; path=/'] }))
        .mockResolvedValueOnce(ok('v5.2.4'));
      const client = new QBittorrentClient(base, { username: 'admin', secret: 'p@ss&w=rd' });

      const version = await client.getVersion();

      expect(version).toBe('v5.2.4');
      const [login, get] = calls();
      const origin = new URL(base).origin;
      expect(login?.url).toBe(`${origin}/api/v2/auth/login`);
      expect(login?.method).toBe('POST');
      expect(login?.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(login?.headers['Referer']).toBe(origin);
      expect(login?.headers['Origin']).toBe(origin);
      expect(login?.body).toBe('username=admin&password=p%40ss%26w%3Drd');
      expect(get?.url).toBe(`${origin}/api/v2/app/version`);
      expect(get?.headers['Cookie']).toBe('QBT_SID_8080=abc123');
      expect(get?.headers['Referer']).toBe(origin);
    });

    it('merges multiple Set-Cookie headers and honours Max-Age=0 deletions', async () => {
      const base = uniqueUrl();
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['a=1; path=/', 'b=2; path=/'] }))
        .mockResolvedValueOnce(ok('v5.2.4', { cookies: ['a=; Max-Age=0; path=/', 'c=3'] }))
        .mockResolvedValueOnce(ok('2.15.1'));
      const client = new QBittorrentClient(base, { username: 'admin', secret: 'pw' });

      await client.getVersion();
      await client.getWebApiVersion();

      expect(calls()[2]?.headers['Cookie']).toBe('b=2; c=3');
    });

    it('does not log in again while the session is valid', async () => {
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=x'] }))
        .mockResolvedValueOnce(ok('v5.2.4'))
        .mockResolvedValueOnce(ok('2.15.1'));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await client.getVersion();
      await client.getWebApiVersion();

      expect(calls().filter((c) => c.url.endsWith('/auth/login'))).toHaveLength(1);
    });

    it('shares the session between client instances with identical credentials only', async () => {
      const base = uniqueUrl();
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=first'] }))
        .mockResolvedValueOnce(ok('v5.2.4'))
        .mockResolvedValueOnce(ok('v5.2.4'))
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=other'] }))
        .mockResolvedValueOnce(ok('v5.2.4'));

      await new QBittorrentClient(base, { username: 'admin', secret: 'pw' }).getVersion();
      await new QBittorrentClient(base, { username: 'admin', secret: 'pw' }).getVersion();
      // different credentials against the same URL must not reuse the cookie
      await new QBittorrentClient(base, { username: 'bob', secret: 'pw2' }).getVersion();

      const recorded = calls();
      expect(recorded).toHaveLength(5);
      expect(recorded[2]?.headers['Cookie']).toBe('SID=first');
      expect(recorded[3]?.url).toContain('/auth/login');
      expect(recorded[4]?.headers['Cookie']).toBe('SID=other');
    });

    it('does not share sessions between different servers', async () => {
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=one'] }))
        .mockResolvedValueOnce(ok('v5.2.4'))
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=two'] }))
        .mockResolvedValueOnce(ok('v5.2.4'));

      await new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' }).getVersion();
      await new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' }).getVersion();

      expect(calls()[3]?.headers['Cookie']).toBe('SID=two');
    });

    it('treats an Ok. login without cookie as auth bypass and does not re-login on every call', async () => {
      mockFetch
        .mockResolvedValueOnce(ok('Ok.'))
        .mockResolvedValueOnce(ok('v5.2.4'))
        .mockResolvedValueOnce(ok('2.15.1'));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await client.getVersion();
      await client.getWebApiVersion();

      expect(calls().filter((c) => c.url.endsWith('/auth/login'))).toHaveLength(1);
      expect(calls()[1]?.headers['Cookie']).toBeUndefined();
    });

    it('fails with a clear message on wrong credentials and stores no cookie', async () => {
      mockFetch.mockResolvedValueOnce(ok('Fails.', { cookies: ['SID=bad'] }));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'wrong' });

      await expect(client.getVersion()).rejects.toThrow('Invalid qBittorrent username or password');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('reports an IP ban when login returns 403', async () => {
      mockFetch.mockResolvedValueOnce(ok('Forbidden', { status: 403 }));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await expect(client.getVersion()).rejects.toThrow(/banned/);
    });

    it('reports a reverse proxy / CSRF hint when login returns 401', async () => {
      mockFetch.mockResolvedValueOnce(ok('Unauthorized', { status: 401 }));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await expect(client.getVersion()).rejects.toThrow(/Host header validation/);
    });

    it('reports a non-qBittorrent endpoint when login returns 404', async () => {
      mockFetch.mockResolvedValueOnce(ok('nope', { status: 404 }));
      const base = uniqueUrl();
      const client = new QBittorrentClient(base, { username: 'admin', secret: 'pw' });

      await expect(client.getVersion()).rejects.toThrow(`Not a qBittorrent WebUI at ${base}`);
    });

    it('does not count a 401 login response towards the cooldown', async () => {
      const base = uniqueUrl();
      mockFetch
        .mockResolvedValueOnce(ok('Unauthorized', { status: 401 }))
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=x'] }))
        .mockResolvedValueOnce(ok('v5.2.4'));
      const creds = { username: 'admin', secret: 'pw' };

      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow();
      await expect(new QBittorrentClient(base, creds).getVersion()).resolves.toBe('v5.2.4');
    });
  });

  describe('re-login', () => {
    it('re-logs in once and retries when a request returns 403', async () => {
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=old'] }))
        .mockResolvedValueOnce(ok('Forbidden', { status: 403 }))
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=new'] }))
        .mockResolvedValueOnce(ok('v5.2.4'));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await expect(client.getVersion()).resolves.toBe('v5.2.4');

      const recorded = calls();
      expect(recorded.map((c) => c.method)).toEqual(['POST', 'GET', 'POST', 'GET']);
      expect(recorded[3]?.headers['Cookie']).toBe('SID=new');
    });

    it('re-logs in on 401 as well', async () => {
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=old'] }))
        .mockResolvedValueOnce(ok('Unauthorized', { status: 401 }))
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=new'] }))
        .mockResolvedValueOnce(ok('v5.2.4'));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await expect(client.getVersion()).resolves.toBe('v5.2.4');
    });

    it('gives up after one re-login when the request is still rejected', async () => {
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=a'] }))
        .mockResolvedValueOnce(ok('Forbidden', { status: 403 }))
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=b'] }))
        .mockResolvedValueOnce(ok('Forbidden', { status: 403 }));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await expect(client.getVersion()).rejects.toThrow(
        'qBittorrent authentication failed after re-login'
      );
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('failure cooldown', () => {
    const failLogin = (): void => {
      mockFetch.mockResolvedValueOnce(ok('Fails.'));
    };

    it('does not contact the server again during the cooldown, then retries after 5 minutes', async () => {
      const base = uniqueUrl();
      const creds = { username: 'admin', secret: 'wrong' };
      failLogin();
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(
        'Invalid qBittorrent username or password'
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(
        /Invalid qBittorrent username or password.*retrying in \d+s/
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5 * 60 * 1000 - 1000);
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(/retrying in/);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1000);
      failLogin();
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(
        'Invalid qBittorrent username or password'
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('escalates to 15 minutes and then 60 minutes', async () => {
      const base = uniqueUrl();
      const creds = { username: 'admin', secret: 'wrong' };
      failLogin();
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow();

      vi.advanceTimersByTime(5 * 60 * 1000);
      failLogin();
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // second failure: 15 minute cooldown
      vi.advanceTimersByTime(14 * 60 * 1000);
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(/retrying in/);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(60 * 1000);
      failLogin();
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // third failure: 60 minute cooldown
      vi.advanceTimersByTime(59 * 60 * 1000);
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(/retrying in/);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      vi.advanceTimersByTime(60 * 1000);
      failLogin();
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(4);

      // fourth failure stays at 60 minutes
      vi.advanceTimersByTime(59 * 60 * 1000);
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(/retrying in/);
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('applies the cooldown after an IP ban response too', async () => {
      const base = uniqueUrl();
      const creds = { username: 'admin', secret: 'pw' };
      mockFetch.mockResolvedValueOnce(ok('Forbidden', { status: 403 }));
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(/banned/);
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(/banned/);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('is bypassed immediately when the credentials change', async () => {
      const base = uniqueUrl();
      failLogin();
      await expect(
        new QBittorrentClient(base, { username: 'admin', secret: 'wrong' }).getVersion()
      ).rejects.toThrow();

      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=x'] }))
        .mockResolvedValueOnce(ok('v5.2.4'));
      await expect(
        new QBittorrentClient(base, { username: 'admin', secret: 'right' }).getVersion()
      ).resolves.toBe('v5.2.4');
    });

    it('is cleared after a successful login', async () => {
      const base = uniqueUrl();
      const creds = { username: 'admin', secret: 'pw' };
      failLogin();
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow();

      vi.advanceTimersByTime(5 * 60 * 1000);
      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=x'] }))
        .mockResolvedValueOnce(ok('v5.2.4'));
      await expect(new QBittorrentClient(base, creds).getVersion()).resolves.toBe('v5.2.4');

      // a new failure sequence starts again at the first (5 minute) step, not at 15 minutes
      mockFetch
        .mockResolvedValueOnce(ok('Forbidden', { status: 403 }))
        .mockResolvedValueOnce(ok('Fails.'));
      await expect(new QBittorrentClient(base, creds).getWebApiVersion()).rejects.toThrow();
      mockFetch.mockClear();
      vi.advanceTimersByTime(5 * 60 * 1000);
      mockFetch.mockResolvedValueOnce(ok('Fails.'));
      await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('auth bypass (none mode)', () => {
    it('never logs in and sends no credentials', async () => {
      mockFetch.mockResolvedValueOnce(ok('v5.2.4'));
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      await client.getVersion();

      const [call] = calls();
      expect(call?.url).toContain('/api/v2/app/version');
      expect(call?.headers['Cookie']).toBeUndefined();
      expect(call?.headers['Authorization']).toBeUndefined();
    });

    it('explains that authentication is required on 403', async () => {
      mockFetch.mockResolvedValueOnce(ok('Forbidden', { status: 403 }));
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      await expect(client.getVersion()).rejects.toThrow(
        'qBittorrent requires authentication; configure username/password (or an API key for >= 5.2)'
      );
    });
  });

  describe('API key mode', () => {
    it('sends a bearer token on every request and never logs in', async () => {
      mockFetch.mockResolvedValueOnce(ok('v5.3.0')).mockResolvedValueOnce(ok('2.16.2'));
      const client = new QBittorrentClient(uniqueUrl(), { secret: 'qbt_key' });

      await client.getVersion();
      await client.getWebApiVersion();

      for (const call of calls()) {
        expect(call.headers['Authorization']).toBe('Bearer qbt_key');
        expect(call.url).not.toContain('/auth/login');
      }
    });

    it('reports a rejected key on 401 without echoing the key', async () => {
      mockFetch.mockResolvedValueOnce(ok('Unauthorized', { status: 401 }));
      const client = new QBittorrentClient(uniqueUrl(), { secret: 'qbt_supersecret' });

      const error = await client.getVersion().catch((e: unknown) => e as Error);
      expect((error as Error).message).toBe(
        'API key rejected (API keys require qBittorrent >= 5.2)'
      );
      expect((error as Error).message).not.toContain('qbt_supersecret');
    });
  });

  describe('network errors', () => {
    it('maps AbortError to a timeout message', async () => {
      mockFetch.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      await expect(client.getVersion()).rejects.toThrow('qBittorrent request timed out after 10s');
    });

    it('aborts requests that never complete after 10 seconds', async () => {
      mockFetch.mockImplementationOnce(
        (_url: unknown, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            );
          })
      );
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      const pending = client.getVersion().catch((e: unknown) => e as Error);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(((await pending) as Error).message).toBe('qBittorrent request timed out after 10s');
    });

    it('maps connection refused to a reachability message', async () => {
      const base = uniqueUrl();
      mockFetch.mockRejectedValueOnce(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      );
      const client = new QBittorrentClient(base, { secret: '' });

      await expect(client.getVersion()).rejects.toThrow(`Cannot reach qBittorrent at ${base}`);
    });

    it('maps unknown errors to a generic message', async () => {
      mockFetch.mockRejectedValueOnce(new Error('boom'));
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      await expect(client.getVersion()).rejects.toThrow('qBittorrent request failed: boom');
    });
  });

  describe('API calls', () => {
    it('requests the log with a cursor and severity filters', async () => {
      mockFetch.mockResolvedValueOnce(ok('[]'));
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      await client.getLog(-1);

      const url = calls()[0]?.url ?? '';
      expect(url).toContain('/api/v2/log/main?');
      expect(url).toContain('last_known_id=-1');
      expect(url).toContain('warning=true');
      expect(url).toContain('critical=true');
      expect(url).toContain('normal=false');
      expect(url).toContain('info=false');
    });

    it('parses errored torrents and transfer info', async () => {
      mockFetch
        .mockResolvedValueOnce(ok('[{"hash":"h","name":"n","state":"error"}]'))
        .mockResolvedValueOnce(ok('{"connection_status":"firewalled","dht_nodes":3}'));
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      await expect(client.getErroredTorrents()).resolves.toEqual([
        { hash: 'h', name: 'n', state: 'error' },
      ]);
      await expect(client.getTransferInfo()).resolves.toEqual({
        connection_status: 'firewalled',
        dht_nodes: 3,
      });
      expect(calls()[0]?.url).toContain('/api/v2/torrents/info?filter=errored');
      expect(calls()[1]?.url).toContain('/api/v2/transfer/info');
    });

    it('wraps JSON parse errors', async () => {
      mockFetch.mockResolvedValueOnce(ok('<html>'));
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      await expect(client.getTransferInfo()).rejects.toThrow(
        'Unexpected response from qBittorrent'
      );
    });

    it('reports a non-qBittorrent endpoint on 404', async () => {
      const base = uniqueUrl();
      mockFetch.mockResolvedValueOnce(ok('nope', { status: 404 }));
      const client = new QBittorrentClient(base, { secret: '' });

      await expect(client.getVersion()).rejects.toThrow(`Not a qBittorrent WebUI at ${base}`);
    });

    it('reports other HTTP errors with status and path', async () => {
      mockFetch.mockResolvedValueOnce(ok('err', { status: 500 }));
      const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

      await expect(client.getVersion()).rejects.toThrow(
        'qBittorrent API error: HTTP 500 /app/version'
      );
    });
  });

  describe('secret hygiene', () => {
    it('never leaks passwords or cookies in error messages', async () => {
      const password = 'hunter2-very-secret';
      const messages: string[] = [];

      mockFetch.mockResolvedValueOnce(ok('Fails.', { cookies: ['SID=cookievalue123'] }));
      messages.push(
        (
          (await new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: password })
            .getVersion()
            .catch((e: unknown) => e)) as Error
        ).message
      );

      mockFetch
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=cookievalue123'] }))
        .mockResolvedValueOnce(ok('Forbidden', { status: 403 }))
        .mockResolvedValueOnce(ok('Ok.', { cookies: ['SID=cookievalue456'] }))
        .mockResolvedValueOnce(ok('Forbidden', { status: 403 }));
      messages.push(
        (
          (await new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: password })
            .getVersion()
            .catch((e: unknown) => e)) as Error
        ).message
      );

      mockFetch.mockRejectedValueOnce(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
      );
      messages.push(
        (
          (await new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: password })
            .getVersion()
            .catch((e: unknown) => e)) as Error
        ).message
      );

      for (const message of messages) {
        expect(message).not.toContain(password);
        expect(message).not.toContain('cookievalue');
      }
    });
  });
  describe('network error redaction', () => {
    it('never leaks the secret when fetch rejects an invalid header value', async () => {
      const secret = 'super-secret-key\n';
      mockFetch.mockRejectedValue(
        new TypeError(`Headers.append: "Bearer ${secret}" is an invalid header value.`)
      );
      const client = new QBittorrentClient(uniqueUrl(), { secret });

      const error = await client.getVersion().catch((e: Error) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('super-secret-key');
      expect((error as Error).message).toBe(
        'qBittorrent request failed: invalid credentials format'
      );
    });

    it('hides ByteString errors and any message containing the secret', async () => {
      mockFetch.mockRejectedValueOnce(
        new TypeError('Cannot convert argument to a ByteString because of character 10')
      );
      const client = new QBittorrentClient(uniqueUrl(), { secret: 'abc123' });
      const first = await client.getVersion().catch((e: Error) => e);
      expect((first as Error).message).toBe(
        'qBittorrent request failed: invalid credentials format'
      );

      mockFetch.mockRejectedValueOnce(new Error('weird failure for Authorization: Bearer abc123'));
      const second = await client.getVersion().catch((e: Error) => e);
      expect((second as Error).message).not.toContain('abc123');
    });
  });
});
