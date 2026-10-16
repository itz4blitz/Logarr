import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QBittorrentClient } from './qbittorrent.client.js';

const mockFetch = vi.fn();

let counter = 0;
function uniqueUrl(): string {
  counter += 1;
  return `http://qb-cookie-${counter}.local:8080`;
}

/**
 * Response stand-in for runtimes without Headers.getSetCookie(): all Set-Cookie values are
 * folded into one comma-joined header, exactly like Headers.get('set-cookie') does.
 */
function legacyResponse(body: string, setCookie: string | null, status = 200): Response {
  const headers = {
    get: (name: string) => (name.toLowerCase() === 'set-cookie' ? setCookie : null),
  };
  return {
    status,
    headers,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function modernResponse(body: string, cookies: string[], status = 200): Response {
  const headers = new Headers();
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie);
  }
  return new Response(body, { status, headers });
}

function cookieHeaderOfCall(index: number): string | undefined {
  const init = mockFetch.mock.calls[index]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.['Cookie'];
}

async function loginAndGetCookie(
  loginResponse: Response,
  baseUrl = uniqueUrl()
): Promise<string | undefined> {
  mockFetch.mockResolvedValueOnce(loginResponse).mockResolvedValueOnce(new Response('v5.2.4'));
  const client = new QBittorrentClient(baseUrl, { username: 'admin', secret: 'pw' });
  await client.getVersion();
  return cookieHeaderOfCall(1);
}

describe('QBittorrentClient cookie handling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('Headers.getSetCookie fallback (splitSetCookie)', () => {
    it('parses a single comma-free cookie', async () => {
      const cookie = await loginAndGetCookie(
        legacyResponse('Ok.', 'QBT_SID_8080=abc123; HttpOnly; SameSite=Strict; path=/')
      );
      expect(cookie).toBe('QBT_SID_8080=abc123');
    });

    it('splits several cookies folded into one comma-joined header', async () => {
      const cookie = await loginAndGetCookie(
        legacyResponse('Ok.', 'a=1; path=/, b=2; HttpOnly; path=/, c=3')
      );
      expect(cookie).toBe('a=1; b=2; c=3');
    });

    it('does not split on the comma inside an Expires date', async () => {
      const cookie = await loginAndGetCookie(
        legacyResponse(
          'Ok.',
          'a=1; Expires=Wed, 21 Oct 2099 07:28:00 GMT; path=/, b=2; Expires=Thu, 22 Oct 2099 07:28:00 GMT'
        )
      );
      expect(cookie).toBe('a=1; b=2');
    });

    it('does not split on the comma inside a dashed (Netscape) Expires date', async () => {
      const cookie = await loginAndGetCookie(
        legacyResponse('Ok.', 'a=1; Expires=Wed, 21-Oct-2099 07:28:00 GMT, b=2')
      );
      expect(cookie).toBe('a=1; b=2');
    });

    it('treats a missing Set-Cookie header (null) as no cookies', async () => {
      mockFetch
        .mockResolvedValueOnce(legacyResponse('Ok.', null))
        .mockResolvedValueOnce(legacyResponse('v5.2.4', null))
        .mockResolvedValueOnce(legacyResponse('2.15.1', null));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await expect(client.getVersion()).resolves.toBe('v5.2.4');
      // bypass-style login: no cookie, no re-login on the next call
      await expect(client.getWebApiVersion()).resolves.toBe('2.15.1');
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(cookieHeaderOfCall(1)).toBeUndefined();
    });

    it('treats an empty Set-Cookie header as no cookies', async () => {
      const cookie = await loginAndGetCookie(legacyResponse('Ok.', ''));
      expect(cookie).toBeUndefined();
    });

    it('honours Max-Age=0 deletions delivered through the fallback', async () => {
      mockFetch
        .mockResolvedValueOnce(legacyResponse('Ok.', 'a=1; path=/, b=2; path=/'))
        .mockResolvedValueOnce(legacyResponse('v5.2.4', 'a=; Max-Age=0; path=/'))
        .mockResolvedValueOnce(legacyResponse('2.15.1', null));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });

      await client.getVersion();
      await client.getWebApiVersion();

      expect(cookieHeaderOfCall(2)).toBe('b=2');
    });

    it('produces the same jar as the getSetCookie() path', async () => {
      const raw = ['x=1; path=/', 'y=2; HttpOnly', 'z=3; Max-Age=3600'];
      const modern = await loginAndGetCookie(modernResponse('Ok.', raw));
      mockFetch.mockReset();
      const legacy = await loginAndGetCookie(legacyResponse('Ok.', raw.join(', ')));
      expect(legacy).toBe(modern);
    });

    it('does not parse cookies at all outside login mode', async () => {
      mockFetch.mockResolvedValueOnce(legacyResponse('v5.2.4', 'SID=leak'));
      const client = new QBittorrentClient(uniqueUrl(), { secret: 'key' });
      await client.getVersion();
      mockFetch.mockResolvedValueOnce(legacyResponse('2.15.1', null));
      await client.getWebApiVersion();
      expect(cookieHeaderOfCall(1)).toBeUndefined();
    });
  });

  describe('cookie parsing edge cases', () => {
    it('keeps "=" characters inside the cookie value (base64 padding)', async () => {
      const cookie = await loginAndGetCookie(modernResponse('Ok.', ['SID=YWJj==; path=/']));
      expect(cookie).toBe('SID=YWJj==');
    });

    it('ignores cookies without a name or without "="', async () => {
      const cookie = await loginAndGetCookie(
        modernResponse('Ok.', ['=novalue', 'garbage', 'ok=1; path=/'])
      );
      expect(cookie).toBe('ok=1');
    });

    it('trims whitespace around names and values', async () => {
      const cookie = await loginAndGetCookie(modernResponse('Ok.', [' a = 1 ; path=/']));
      expect(cookie).toBe('a=1');
    });

    it('deletes a cookie that is set with an empty value', async () => {
      mockFetch
        .mockResolvedValueOnce(modernResponse('Ok.', ['a=1', 'b=2']))
        .mockResolvedValueOnce(modernResponse('v5.2.4', ['a=']))
        .mockResolvedValueOnce(new Response('2.15.1'));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });
      await client.getVersion();
      await client.getWebApiVersion();
      expect(cookieHeaderOfCall(2)).toBe('b=2');
    });

    it('treats Max-Age=0 case-insensitively and with padding zeros', async () => {
      mockFetch
        .mockResolvedValueOnce(modernResponse('Ok.', ['a=1', 'b=2', 'c=3']))
        .mockResolvedValueOnce(modernResponse('v5.2.4', ['a=1; MAX-AGE=0', 'b=2; max-age = 00']))
        .mockResolvedValueOnce(new Response('2.15.1'));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });
      await client.getVersion();
      await client.getWebApiVersion();
      expect(cookieHeaderOfCall(2)).toBe('c=3');
    });

    it('overwrites an existing cookie of the same name', async () => {
      mockFetch
        .mockResolvedValueOnce(modernResponse('Ok.', ['SID=old']))
        .mockResolvedValueOnce(modernResponse('v5.2.4', ['SID=new']))
        .mockResolvedValueOnce(new Response('2.15.1'));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });
      await client.getVersion();
      await client.getWebApiVersion();
      expect(cookieHeaderOfCall(2)).toBe('SID=new');
    });

    it('deletes a cookie with a negative Max-Age', async () => {
      mockFetch
        .mockResolvedValueOnce(modernResponse('Ok.', ['a=1', 'b=2']))
        .mockResolvedValueOnce(modernResponse('v5.2.4', ['a=1; Max-Age=-1']))
        .mockResolvedValueOnce(new Response('2.15.1'));
      const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });
      await client.getVersion();
      await client.getWebApiVersion();
      expect(cookieHeaderOfCall(2)).toBe('b=2');
    });
  });
});
