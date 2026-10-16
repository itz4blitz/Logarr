import { HttpError, httpRequest } from '@logarr/core';

import type {
  BazarrEnvelope,
  BazarrEpisodeHistory,
  BazarrHealthIssue,
  BazarrJob,
  BazarrMovieHistory,
  BazarrSystemStatus,
} from './bazarr.types.js';

/**
 * Bazarr API client.
 *
 * Bazarr is not an *arr v3 API: routes live under `/api`, authentication uses the
 * `X-API-KEY` header and every response is wrapped in a `data` envelope.
 */
export class BazarrClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.headers = {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    };
  }

  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${this.baseUrl}/api${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    let response: BazarrEnvelope<T>;
    try {
      response = await httpRequest<BazarrEnvelope<T>>(url.toString(), {
        method: 'GET',
        headers: this.headers,
        timeout: 10000,
        retries: 2,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        throw new Error(`Bazarr API error: ${error.message}\n${error.suggestion}`);
      }
      throw error;
    }

    if (typeof response !== 'object' || response === null || !('data' in response)) {
      throw new Error('Unexpected Bazarr response');
    }

    return response.data;
  }

  /** GET /api/system/status (authenticated, unlike /system/ping) */
  async getSystemStatus(): Promise<BazarrSystemStatus> {
    return this.get<BazarrSystemStatus>('/system/status');
  }

  /** GET /api/system/health */
  async getHealth(): Promise<readonly BazarrHealthIssue[]> {
    return this.get<readonly BazarrHealthIssue[]>('/system/health');
  }

  /** GET /api/episodes/history (newest first) */
  async getEpisodeHistory(length = 50, start = 0): Promise<readonly BazarrEpisodeHistory[]> {
    return this.get<readonly BazarrEpisodeHistory[]>('/episodes/history', { start, length });
  }

  /** GET /api/movies/history (newest first) */
  async getMovieHistory(length = 50, start = 0): Promise<readonly BazarrMovieHistory[]> {
    return this.get<readonly BazarrMovieHistory[]>('/movies/history', { start, length });
  }

  /** GET /api/system/jobs, optionally filtered by status (e.g. 'failed') */
  async getJobs(status?: string): Promise<readonly BazarrJob[]> {
    return this.get<readonly BazarrJob[]>(
      '/system/jobs',
      status !== undefined ? { status } : undefined
    );
  }

  /** Verify connectivity and credentials; throws on failure */
  async testConnection(): Promise<boolean> {
    await this.getSystemStatus();
    return true;
  }
}
