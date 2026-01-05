/**
 * Base HTTP client for *arr applications
 * Handles authentication and common API patterns
 */

import type {
  ArrSystemStatus,
  ArrHealthCheck,
  ArrLogEntry,
  ArrPaginatedResponse,
  ArrHistoryRecordBase,
  ArrQueueItemBase,
} from './arr.types.js';

export class ArrClient {
  protected readonly baseUrl: string;
  protected readonly headers: Record<string, string>;
  protected readonly apiVersion: string;

  constructor(baseUrl: string, apiKey: string, apiVersion: string = 'v3') {
    // Normalize URL - remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.headers = {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    this.apiVersion = apiVersion;
  }

  /**
   * Make a GET request to the API
   */
  protected async get<T>(
    path: string,
    params?: Record<string, string | number | boolean>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/${this.apiVersion}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Test the connection by fetching system status
   */
  async testConnection(): Promise<void> {
    await this.getSystemStatus();
  }

  /**
   * Get system status information
   * GET /api/v3/system/status
   */
  async getSystemStatus(): Promise<ArrSystemStatus> {
    return this.get<ArrSystemStatus>('/system/status');
  }

  /**
   * Get health check results
   * GET /api/v3/health
   */
  async getHealth(): Promise<readonly ArrHealthCheck[]> {
    return this.get<ArrHealthCheck[]>('/health');
  }

  /**
   * Get application logs
   * GET /api/v3/log
   */
  async getLogs(options?: {
    page?: number;
    pageSize?: number;
    sortKey?: 'id' | 'level' | 'time' | 'logger' | 'message';
    sortDirection?: 'ascending' | 'descending';
    level?: 'all' | 'info' | 'warn' | 'error';
  }): Promise<ArrPaginatedResponse<ArrLogEntry>> {
    return this.get<ArrPaginatedResponse<ArrLogEntry>>('/log', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: options?.sortKey ?? 'time',
      sortDirection: options?.sortDirection ?? 'descending',
      ...(options?.level !== undefined && options.level !== 'all' ? { level: options.level } : {}),
    });
  }

  /**
   * Get history records
   * GET /api/v3/history
   */
  async getHistory<T extends ArrHistoryRecordBase>(options?: {
    page?: number;
    pageSize?: number;
    sortKey?: string;
    sortDirection?: 'ascending' | 'descending';
    eventType?: number;
    includeSeries?: boolean;
    includeMovie?: boolean;
    includeEpisode?: boolean;
  }): Promise<ArrPaginatedResponse<T>> {
    return this.get<ArrPaginatedResponse<T>>('/history', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: options?.sortKey ?? 'date',
      sortDirection: options?.sortDirection ?? 'descending',
      ...(options?.includeSeries !== undefined ? { includeSeries: options.includeSeries } : {}),
      ...(options?.includeMovie !== undefined ? { includeMovie: options.includeMovie } : {}),
      ...(options?.includeEpisode !== undefined ? { includeEpisode: options.includeEpisode } : {}),
    });
  }

  /**
   * Get history since a specific date
   * GET /api/v3/history/since
   */
  async getHistorySince<T extends ArrHistoryRecordBase>(
    date: Date,
    eventType?: number
  ): Promise<readonly T[]> {
    const params: Record<string, string | number | boolean> = {
      date: date.toISOString(),
    };
    if (eventType !== undefined) {
      params['eventType'] = eventType;
    }
    return this.get<T[]>('/history/since', params);
  }

  /**
   * Get current download queue
   * GET /api/v3/queue
   */
  async getQueue<T extends ArrQueueItemBase>(options?: {
    page?: number;
    pageSize?: number;
    sortKey?: string;
    sortDirection?: 'ascending' | 'descending';
    includeUnknownItems?: boolean;
    includeMedia?: boolean;
  }): Promise<ArrPaginatedResponse<T>> {
    return this.get<ArrPaginatedResponse<T>>('/queue', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: options?.sortKey ?? 'timeleft',
      sortDirection: options?.sortDirection ?? 'ascending',
      ...(options?.includeUnknownItems !== undefined
        ? {
            includeUnknownSeriesItems: options.includeUnknownItems,
            includeUnknownMovieItems: options.includeUnknownItems,
          }
        : {}),
    });
  }
}
