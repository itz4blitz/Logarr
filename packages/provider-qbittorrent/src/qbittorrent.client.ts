import { createHash } from 'node:crypto';

import { cooldowns, sessionCache } from './qbittorrent.state.js';

import type {
  QBittorrentAuthMode,
  QBittorrentLogEntry,
  QBittorrentTorrent,
  QBittorrentTransferInfo,
} from './qbittorrent.types.js';

const REQUEST_TIMEOUT_MS = 10_000;
const API_PREFIX = '/api/v2';

/** Escalating cooldown after authentication failures (qBittorrent bans an IP for 1h after 5) */
const COOLDOWN_STEPS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000] as const;

type CookieJar = Map<string, string>;

interface RawResponse {
  status: number;
  text: string;
}

interface QBittorrentCredentials {
  readonly username?: string | undefined;
  /** Password (with username) or API key (without username). May be empty. */
  readonly secret: string;
}

/**
 * Cache keys are a SHA-256 of base URL, username and secret, so different servers or credentials
 * never share cookies and no plaintext secret is used as a map key. The caches themselves are
 * bounded process-wide state, see qbittorrent.state.ts.
 */
function hashKey(baseUrl: string, username: string, secret: string): string {
  return createHash('sha256').update(`${baseUrl}\u0000${username}\u0000${secret}`).digest('hex');
}

/** True when a Set-Cookie attribute list marks the cookie as expired/deleted */
function isExpired(attributes: string[]): boolean {
  for (const attribute of attributes) {
    const separator = attribute.indexOf('=');
    if (separator < 0) {
      continue;
    }
    const name = attribute.slice(0, separator).trim().toLowerCase();
    const value = attribute.slice(separator + 1).trim();
    if (name === 'max-age') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds <= 0) {
        return true;
      }
    } else if (name === 'expires') {
      const time = Date.parse(value);
      if (!Number.isNaN(time) && time <= Date.now()) {
        return true;
      }
    }
  }
  return false;
}

function splitSetCookie(header: string | null): string[] {
  if (header === null || header === '') {
    return [];
  }
  return header.split(/,(?=\s*[^;,=\s]+=)/);
}

/**
 * Minimal qBittorrent WebUI API v2 client (cookie session, API key or no authentication).
 * Uses fetch directly because core httpRequest cannot send forms or manage cookies.
 */
export class QBittorrentClient {
  readonly baseUrl: string;
  readonly authMode: QBittorrentAuthMode;

  private readonly origin: string;
  private readonly username: string;
  private readonly secret: string;
  private readonly key: string;
  private jar: CookieJar;
  private sessionReady: boolean;

  constructor(baseUrl: string, credentials: QBittorrentCredentials) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, '');
    this.origin = new URL(this.baseUrl).origin;
    this.username = credentials.username?.trim() ?? '';
    this.secret = credentials.secret;

    if (this.username !== '') {
      this.authMode = 'login';
    } else if (this.secret !== '') {
      this.authMode = 'apiKey';
    } else {
      this.authMode = 'none';
    }

    this.key = hashKey(this.baseUrl, this.username, this.secret);
    const cached = sessionCache.get(this.key);
    this.sessionReady = cached !== undefined;
    this.jar = new Map(cached ?? []);
  }

  async getVersion(): Promise<string> {
    return this.getText('/app/version');
  }

  async getWebApiVersion(): Promise<string> {
    return this.getText('/app/webapiVersion');
  }

  async getLog(lastKnownId: number): Promise<QBittorrentLogEntry[]> {
    return this.getJson<QBittorrentLogEntry[]>('/log/main', {
      normal: 'false',
      info: 'false',
      warning: 'true',
      critical: 'true',
      last_known_id: String(lastKnownId),
    });
  }

  async getErroredTorrents(): Promise<QBittorrentTorrent[]> {
    return this.getJson<QBittorrentTorrent[]>('/torrents/info', { filter: 'errored' });
  }

  async getTransferInfo(): Promise<QBittorrentTransferInfo> {
    return this.getJson<QBittorrentTransferInfo>('/transfer/info');
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async getJson<T>(path: string, query?: Record<string, string>): Promise<T> {
    const text = await this.getText(path, query);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('Unexpected response from qBittorrent');
    }
  }

  private async getText(path: string, query?: Record<string, string>): Promise<string> {
    if (this.authMode === 'login' && !this.sessionReady) {
      await this.login();
    }

    let response = await this.send('GET', path, { query });

    if (response.status === 401 || response.status === 403) {
      if (this.authMode === 'login') {
        this.jar = new Map();
        this.sessionReady = false;
        sessionCache.delete(this.key);
        await this.login();
        response = await this.send('GET', path, { query });
        if (response.status === 401 || response.status === 403) {
          throw new Error('qBittorrent authentication failed after re-login');
        }
      } else if (this.authMode === 'apiKey') {
        throw new Error('API key rejected (API keys require qBittorrent >= 5.3)');
      } else {
        throw new Error(
          'qBittorrent requires authentication; configure username/password (or an API key for >= 5.3)'
        );
      }
    }

    if (response.status === 404) {
      throw this.notQBittorrentError();
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`qBittorrent API error: HTTP ${response.status} ${path}`);
    }

    return response.text;
  }

  private notQBittorrentError(): Error {
    return new Error(`Not a qBittorrent WebUI at ${this.baseUrl} (/api/v2 not found)`);
  }

  private async login(): Promise<void> {
    const cooldown = cooldowns.get(this.key);
    if (cooldown !== undefined && cooldown.until > Date.now()) {
      const seconds = Math.ceil((cooldown.until - Date.now()) / 1000);
      throw new Error(`${cooldown.message} (retrying in ${seconds}s)`);
    }

    const response = await this.send('POST', '/auth/login', {
      form: { username: this.username, password: this.secret },
    });

    if (response.status === 200 && response.text.trim() === 'Ok.') {
      cooldowns.delete(this.key);
      this.sessionReady = true;
      sessionCache.set(this.key, new Map(this.jar));
      return;
    }

    if (response.status === 200 && response.text.trim() === 'Fails.') {
      throw this.recordFailure('Invalid qBittorrent username or password');
    }
    if (response.status === 200) {
      // Not counted as a credential failure: probably not qBittorrent (e.g. an auth proxy page)
      throw new Error(
        'Unexpected login response — is this a qBittorrent WebUI (or behind an auth proxy)?'
      );
    }
    if (response.status === 403) {
      throw this.recordFailure(
        'qBittorrent refused the login (HTTP 403): this IP is banned after too many failed attempts. Wait (default 1 hour) or check the credentials'
      );
    }
    if (response.status === 401) {
      throw new Error(
        'qBittorrent rejected the request (HTTP 401): check that the URL is correct and, behind a reverse proxy, that Host header validation / CSRF settings allow Logarr'
      );
    }
    if (response.status === 404) {
      throw this.notQBittorrentError();
    }
    throw new Error(`qBittorrent login failed: HTTP ${response.status}`);
  }

  private recordFailure(message: string): Error {
    this.jar = new Map();
    const previous = cooldowns.get(this.key);
    const failures = (previous?.failures ?? 0) + 1;
    const step = COOLDOWN_STEPS_MS[Math.min(failures, COOLDOWN_STEPS_MS.length) - 1] as number;
    const now = Date.now();
    cooldowns.set(this.key, { until: now + step, message, failures });
    return new Error(message);
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    options: { query?: Record<string, string> | undefined; form?: Record<string, string> }
  ): Promise<RawResponse> {
    const query = options.query ? `?${new URLSearchParams(options.query).toString()}` : '';
    const url = `${this.baseUrl}${API_PREFIX}${path}${query}`;

    const headers: Record<string, string> = {
      Accept: '*/*',
      Referer: this.origin,
      Origin: this.origin,
    };
    if (options.form) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    if (this.authMode === 'apiKey') {
      headers['Authorization'] = `Bearer ${this.secret}`;
    }
    if (this.authMode === 'login' && this.jar.size > 0) {
      headers['Cookie'] = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
        redirect: 'manual',
        ...(options.form && { body: new URLSearchParams(options.form).toString() }),
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error(this.redirectMessage(response, url));
      }
      this.storeCookies(response.headers);
      return { status: response.status, text: await response.text() };
    } catch (error) {
      throw this.mapNetworkError(error);
    } finally {
      clearTimeout(timer);
    }
  }

  private redirectMessage(response: Response, requestUrl: string): string {
    let target = 'another location';
    try {
      const location = response.headers.get('location');
      if (location !== null) {
        target = new URL(location, requestUrl).origin;
      }
    } catch {
      // keep the generic wording
    }
    return `URL redirects to ${target} — configure the final URL`;
  }

  private mapNetworkError(error: unknown): Error {
    if (error instanceof Error && error.message.startsWith('URL redirects to')) {
      return error;
    }
    const err = error as { name?: string; message?: string; cause?: { code?: string } };
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return new Error(`qBittorrent request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    const code = err.cause?.code;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
      return new Error(`Cannot reach qBittorrent at ${this.baseUrl}`);
    }
    return new Error(`qBittorrent request failed: ${err.message ?? 'unknown error'}`);
  }

  private storeCookies(headers: Headers): void {
    if (this.authMode !== 'login') {
      return;
    }
    const raw =
      typeof headers.getSetCookie === 'function'
        ? headers.getSetCookie()
        : splitSetCookie(headers.get('set-cookie'));

    for (const cookie of raw) {
      const [pair = '', ...attributes] = cookie.split(';');
      const separator = pair.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      if (value === '' || isExpired(attributes)) {
        this.jar.delete(name);
      } else {
        this.jar.set(name, value);
      }
    }
  }
}
