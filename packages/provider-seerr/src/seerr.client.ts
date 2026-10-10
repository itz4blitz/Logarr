/**
 * Seerr API client (Seerr, Overseerr and Jellyseerr share the same /api/v1)
 */

import { HttpError, httpRequest } from '@logarr/core';

import type { SeerrAbout, SeerrIssue, SeerrPaged, SeerrRequest } from './seerr.types.js';

/** Paging options for list endpoints */
export interface SeerrPageOptions {
  readonly take: number;
  readonly skip: number;
}

/**
 * Normalize a list response: Seerr returns `{ pageInfo, results }`, but a bare
 * array is tolerated as well. Anything else yields an empty list.
 */
function normalizeList<T>(body: SeerrPaged<T> | T[] | null | undefined): T[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (typeof body === 'object' && body !== null && Array.isArray(body.results)) {
    return body.results;
  }
  return [];
}

/**
 * HTTP client for the Seerr API
 */
export class SeerrClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string
  ) {
    this.baseUrl = `${baseUrl.replace(/\/+$/, '')}/api/v1`;
  }

  private async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }
    const query = search.toString();
    const url = `${this.baseUrl}${path}${query === '' ? '' : `?${query}`}`;

    try {
      return await httpRequest<T>(url, {
        headers: { 'X-Api-Key': this.apiKey },
        timeout: 10000,
        retries: 2,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          throw new Error(
            `Seerr API error: authentication failed - use the ADMIN API key from Settings > General (${error.statusCode})`
          );
        }
        throw new Error(`Seerr API error: ${error.message}`);
      }
      throw error;
    }
  }

  /** GET /settings/about (admin only, validates the API key) */
  getAbout(): Promise<SeerrAbout> {
    return this.get<SeerrAbout>('/settings/about');
  }

  /** GET /request, most recently modified first */
  async getRequests(options: SeerrPageOptions): Promise<SeerrRequest[]> {
    const body = await this.get<SeerrPaged<SeerrRequest> | SeerrRequest[]>('/request', {
      take: options.take,
      skip: options.skip,
      sort: 'modified',
      sortDirection: 'desc',
      filter: 'all',
    });
    return normalizeList(body);
  }

  /** GET /issue, most recently modified first */
  async getIssues(options: SeerrPageOptions): Promise<SeerrIssue[]> {
    const body = await this.get<SeerrPaged<SeerrIssue> | SeerrIssue[]>('/issue', {
      take: options.take,
      skip: options.skip,
      sort: 'modified',
      filter: 'all',
    });
    return normalizeList(body);
  }
}
