import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QBittorrentClient } from './qbittorrent.client.js';
import { parseQBittorrentLogLine } from './qbittorrent.parser.js';
import { QBittorrentProvider } from './qbittorrent.provider.js';
import { redactSecrets, trackerHost } from './qbittorrent.redact.js';

const mockFetch = vi.fn();

let counter = 0;
function uniqueUrl(): string {
  counter += 1;
  return `http://hard-${counter}.local:8080`;
}

function withCookies(body: string, cookies: string[], status = 200): Response {
  const headers = new Headers();
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  return new Response(body, { status, headers });
}

function cookieOfCall(index: number): string | undefined {
  const init = mockFetch.mock.calls[index]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.['Cookie'];
}

describe('redactSecrets / trackerHost', () => {
  it.each([
    ['https://t.example/announce?passkey=abc123&x=1', 'https://t.example/announce?passkey=***&x=1'],
    ['http://t/a?authkey=ZZ&torrent_pass=YY', 'http://t/a?authkey=***&torrent_pass=***'],
    ['http://t/a?pk=secret', 'http://t/a?pk=***'],
    [
      'https://t.example/0123456789abcdef0123456789abcdef/announce',
      'https://t.example/***/announce',
    ],
    ['nothing secret here', 'nothing secret here'],
  ])('masks %s', (input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it('reduces tracker URLs to the host and tolerates invalid input', () => {
    expect(trackerHost('https://tracker.example:2710/abc/announce?passkey=1')).toBe(
      'tracker.example:2710'
    );
    expect(trackerHost('not a url')).toBeUndefined();
    expect(trackerHost('')).toBeUndefined();
    expect(trackerHost(undefined)).toBeUndefined();
  });
});

describe('QBittorrentClient hardening', () => {
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

  it('does not treat an unexpected 200 login body as bad credentials and does not escalate', async () => {
    const base = uniqueUrl();
    const creds = { username: 'admin', secret: 'pw' };
    mockFetch.mockResolvedValueOnce(new Response('<html>proxy login</html>'));
    await expect(new QBittorrentClient(base, creds).getVersion()).rejects.toThrow(
      'Unexpected login response — is this a qBittorrent WebUI (or behind an auth proxy)?'
    );

    // no cooldown: the next attempt reaches the server again
    mockFetch
      .mockResolvedValueOnce(withCookies('Ok.', ['SID=x']))
      .mockResolvedValueOnce(new Response('v5.2.4'));
    await expect(new QBittorrentClient(base, creds).getVersion()).resolves.toBe('v5.2.4');
  });

  it('only counts a trimmed "Fails." body as a credential failure', async () => {
    mockFetch.mockResolvedValueOnce(new Response('Fails.\n'));
    await expect(
      new QBittorrentClient(uniqueUrl(), { username: 'a', secret: 'b' }).getVersion()
    ).rejects.toThrow('Invalid qBittorrent username or password');
  });

  it('uses manual redirect handling and reports the redirect target origin', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://qb.example/login?next=/' } })
    );
    const client = new QBittorrentClient(uniqueUrl(), { secret: '' });

    await expect(client.getVersion()).rejects.toThrow(
      'URL redirects to https://qb.example — configure the final URL'
    );
    expect((mockFetch.mock.calls[0]?.[1] as RequestInit).redirect).toBe('manual');
  });

  it('reports a redirect on login too', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: 'https://secure.example/' } })
    );
    await expect(
      new QBittorrentClient(uniqueUrl(), { username: 'a', secret: 'b' }).getVersion()
    ).rejects.toThrow('URL redirects to https://secure.example');
  });

  it('deletes cookies with a past Expires but keeps future ones', async () => {
    mockFetch
      .mockResolvedValueOnce(withCookies('Ok.', ['a=1', 'b=2', 'c=3']))
      .mockResolvedValueOnce(
        withCookies('v5.2.4', [
          'a=9; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          'b=9; Expires=Wed, 11 Oct 2028 12:00:00 GMT',
          'c=9; Max-Age=-5',
        ])
      )
      .mockResolvedValueOnce(new Response('2.15.1'));
    const client = new QBittorrentClient(uniqueUrl(), { username: 'admin', secret: 'pw' });
    await client.getVersion();
    await client.getWebApiVersion();

    expect(cookieOfCall(2)).toBe('b=9');
  });

  it('treats Max-Age with spaces or a large positive value correctly', async () => {
    mockFetch
      .mockResolvedValueOnce(withCookies('Ok.', ['a=1; Max-Age = 3600']))
      .mockResolvedValueOnce(new Response('v5.2.4'));
    await new QBittorrentClient(uniqueUrl(), { username: 'u', secret: 'p' }).getVersion();
    expect(cookieOfCall(1)).toBe('a=1');
  });

  it('parses a pathological Max-Age attribute quickly', async () => {
    const evil = `a=1; Max-Age=${'0 '.repeat(20000)}x`;
    mockFetch
      .mockResolvedValueOnce(withCookies('Ok.', [evil]))
      .mockResolvedValueOnce(new Response('v5.2.4'));
    const started = Date.now();
    await new QBittorrentClient(uniqueUrl(), { username: 'u', secret: 'p' }).getVersion();
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('QBittorrentProvider hardening', () => {
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
  });

  const respondMixed = (json: Record<string, unknown>): void => {
    mockFetch.mockImplementation((url: unknown) => {
      const path = new URL(String(url)).pathname.replace('/api/v2', '');
      if (path === '/app/version') return Promise.resolve(new Response('v5.2.4'));
      if (path === '/app/webapiVersion') return Promise.resolve(new Response('2.15.1'));
      const value = json[path];
      return Promise.resolve(
        value === undefined
          ? new Response('nf', { status: 404 })
          : new Response(JSON.stringify(value))
      );
    });
  };

  it('keeps only the tracker host and drops the save path from torrent metadata', async () => {
    respondMixed({
      '/torrents/info': [
        {
          hash: 'h',
          name: 'N',
          state: 'error',
          save_path: '/secret/path',
          tracker: 'https://priv.example/ann/0123456789abcdef0123456789abcdef?passkey=abc',
        },
      ],
      '/transfer/info': { connection_status: 'connected' },
    });
    await provider.connect({ url: baseUrl, apiKey: '', logPath: '/logs' });

    const [activity] = await provider.getActivity();

    expect(activity?.metadata?.['tracker']).toBe('priv.example');
    expect(activity?.metadata).not.toHaveProperty('savePath');
    expect(JSON.stringify(activity)).not.toContain('abc');
    expect(JSON.stringify(activity)).not.toContain('secret/path');
  });

  it('redacts secrets in API log messages', async () => {
    respondMixed({
      '/log/main': [
        {
          id: 1,
          message: 'Tracker error "https://t/announce?passkey=SECRETKEY&a=b"',
          timestamp: 1_790_000_000,
          type: 4,
        },
      ],
      '/torrents/info': [],
      '/transfer/info': { connection_status: 'connected' },
    });
    await provider.connect({ url: baseUrl, apiKey: '' });

    const [activity] = await provider.getActivity();

    expect(activity?.overview).toContain('passkey=***');
    expect(JSON.stringify(activity)).not.toContain('SECRETKEY');
  });

  it('emits connection activity on state change and once per day only', async () => {
    let status = 'connected';
    mockFetch.mockImplementation((url: unknown) => {
      const path = new URL(String(url)).pathname.replace('/api/v2', '');
      if (path === '/app/version') return Promise.resolve(new Response('v5.2.4'));
      if (path === '/app/webapiVersion') return Promise.resolve(new Response('2.15.1'));
      if (path === '/transfer/info')
        return Promise.resolve(new Response(JSON.stringify({ connection_status: status })));
      return Promise.resolve(new Response('[]'));
    });
    await provider.connect({ url: baseUrl, apiKey: '', logPath: '/logs' });

    expect(await provider.getActivity()).toEqual([]);
    status = 'firewalled';
    expect(await provider.getActivity()).toHaveLength(1);
    expect(await provider.getActivity()).toHaveLength(0);
    status = 'disconnected';
    expect(await provider.getActivity()).toHaveLength(1);
    status = 'connected';
    expect(await provider.getActivity()).toHaveLength(0);
    status = 'disconnected';
    // recovered and failed again the same day: same id, deduped downstream, but a state change
    const again = await provider.getActivity();
    expect(again).toHaveLength(1);
    expect(await provider.getActivity()).toHaveLength(0);
    vi.advanceTimersByTime(25 * 60 * 60_000);
    expect(await provider.getActivity()).toHaveLength(1);
  });

  it('treats ids at or below the cursor as an id regression and filters by time', async () => {
    const responses: unknown[][] = [
      [{ id: 500, message: 'old', timestamp: 1_790_000_000, type: 4 }],
      [
        { id: 3, message: 'stale buffer entry', timestamp: 1_789_999_000, type: 4 },
        { id: 4, message: 'fresh after restart', timestamp: 1_790_000_100, type: 8 },
      ],
      [],
    ];
    mockFetch.mockImplementation((url: unknown) => {
      const path = new URL(String(url)).pathname.replace('/api/v2', '');
      if (path === '/app/version') return Promise.resolve(new Response('v5.2.4'));
      if (path === '/app/webapiVersion') return Promise.resolve(new Response('2.15.1'));
      if (path === '/log/main')
        return Promise.resolve(new Response(JSON.stringify(responses.shift() ?? [])));
      if (path === '/transfer/info')
        return Promise.resolve(new Response('{"connection_status":"connected"}'));
      return Promise.resolve(new Response('[]'));
    });
    await provider.connect({ url: baseUrl, apiKey: '' });

    await provider.getActivity();
    const activities = await provider.getActivity();
    expect(activities.map((a) => a.overview)).toEqual(['fresh after restart']);

    await provider.getActivity();
    const lastCall = mockFetch.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/log/main'))
      .at(-1);
    expect(lastCall).toContain('last_known_id=4');
  });
});

describe('redactSecrets - encoded keys and opaque tokens', () => {
  it.each([
    ['https://t/a?passkey%3Dsecret123&x=1', 'https://t/a?passkey%3D***&x=1'],
    ['https://t/a%3Fpasskey%3Dsecret123%26x%3D1', 'https://t/a%3Fpasskey%3D***%26x%3D1'],
    [
      'url=https%3A%2F%2Ft%2Fa%3Fauthkey%3DSECRET%26z',
      'url=https%3A%2F%2Ft%2Fa%3Fauthkey%3D***%26z',
    ],
    ['https://t/a?PassKey=Secret&b=2', 'https://t/a?PassKey=***&b=2'],
    ['https://t/announce/ABCDEFGHIJKLMNOPQRSTUV', 'https://t/announce/***'],
    ['https://t/ABCDEFGHIJKLMNOPQRSTUV/announce', 'https://t/***/announce'],
    ['https://t/a1b2c3d4e5f6g7h8i9j0k1l2/scrape', 'https://t/***/scrape'],
    ['https%3A%2F%2Ft%2Fannounce%2Fabcdefghij0123456789xyz', 'https%3A%2F%2Ft%2Fannounce/***'],
    ['https://t/announce', 'https://t/announce'],
    ['https://t/announce/short', 'https://t/announce/short'],
    ['kpk=notakey and npk=x', 'kpk=notakey and npk=x'],
  ])('masks %s', (input, expected) => {
    expect(redactSecrets(input)).toBe(expected);
  });

  it('is applied to API log messages and file-parsed lines', () => {
    const entry = parseQBittorrentLogLine(
      '(W) 2026-10-10T12:00:00 - Tracker "https://t/announce/ABCDEFGHIJKLMNOPQRSTUV?passkey%3Dzzz" failed'
    );
    expect(entry?.message).not.toContain('ABCDEFGHIJ');
    expect(entry?.message).not.toContain('zzz');
    expect(entry?.raw).not.toContain('zzz');
  });
});

describe('QBittorrentProvider sync cursor flags', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps synthetic rows out of the sync cursor but lets real log events advance it', async () => {
    mockFetch.mockImplementation((url: unknown) => {
      const path = new URL(String(url)).pathname.replace('/api/v2', '');
      const bodies: Record<string, string> = {
        '/app/version': 'v5.2.4',
        '/app/webapiVersion': '2.15.1',
        '/log/main': JSON.stringify([
          { id: 1, message: 'real event', timestamp: 1_790_000_000, type: 4 },
        ]),
        '/torrents/info': JSON.stringify([{ hash: 'h', name: 'N', state: 'error' }]),
        '/transfer/info': JSON.stringify({ connection_status: 'firewalled' }),
      };
      return Promise.resolve(
        new Response(bodies[path] ?? 'nf', { status: bodies[path] ? 200 : 404 })
      );
    });
    const provider = new QBittorrentProvider();
    await provider.connect({ url: uniqueUrl(), apiKey: '' });

    const activities = await provider.getActivity();

    const byType = Object.fromEntries(activities.map((a) => [a.type, a.advancesSyncCursor]));
    expect(byType['torrent_error']).toBe(false);
    expect(byType['connection_status']).toBe(false);
    expect(byType['log_warning']).toBeUndefined();
  });
});
