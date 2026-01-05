/**
 * Prowlarr provider implementation
 *
 * Prowlarr is an indexer manager that tracks search queries,
 * RSS syncs, and grab events across all configured indexers.
 */

import {
  ArrBaseProvider,
  ArrClient,
  PROWLARR_LOG_FILE_CONFIG,
  type ArrHistoryRecordBase,
  type ArrPaginatedResponse,
} from '@logarr/provider-arr';

import { ProwlarrEventTypeNames } from './prowlarr.types.js';

import type { ProwlarrHistoryRecord, ProwlarrIndexer } from './prowlarr.types.js';
import type { NormalizedActivity } from '@logarr/core';

// Local interface until core package is rebuilt
interface LogFileConfig {
  defaultPaths: {
    docker: readonly string[];
    linux: readonly string[];
    windows: readonly string[];
    macos: readonly string[];
  };
  filePatterns: readonly string[];
  encoding?: string;
  rotatesDaily?: boolean;
  datePattern?: RegExp;
}

/**
 * Extended client for Prowlarr-specific endpoints
 * Prowlarr uses API v1 instead of v3
 */
class ProwlarrClient extends ArrClient {
  constructor(baseUrl: string, apiKey: string) {
    super(baseUrl, apiKey, 'v1');
  }

  /**
   * Get all configured indexers
   */
  async getIndexers(): Promise<readonly ProwlarrIndexer[]> {
    return this.get<ProwlarrIndexer[]>('/indexer');
  }

  /**
   * Get history with indexer information
   */
  async getProwlarrHistory(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<ArrPaginatedResponse<ProwlarrHistoryRecord>> {
    return this.get<ArrPaginatedResponse<ProwlarrHistoryRecord>>('/history', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: 'date',
      sortDirection: 'descending',
    });
  }

  /**
   * Get history since a specific date
   */
  async getProwlarrHistorySince(date: Date): Promise<readonly ProwlarrHistoryRecord[]> {
    return this.get<ProwlarrHistoryRecord[]>('/history/since', {
      date: date.toISOString(),
    });
  }
}

export class ProwlarrProvider extends ArrBaseProvider {
  readonly id = 'prowlarr';
  readonly name = 'Prowlarr';

  protected override createClient(url: string, apiKey: string): ProwlarrClient {
    return new ProwlarrClient(url, apiKey);
  }

  protected override getClient(): ProwlarrClient {
    return super.getClient() as ProwlarrClient;
  }

  protected getMediaType(): 'series' | 'movie' | 'artist' | 'book' {
    // Prowlarr doesn't have a specific media type, using 'series' as default
    return 'series';
  }

  /**
   * Override log file config with Prowlarr-specific paths
   */
  override getLogFileConfig(): LogFileConfig {
    return PROWLARR_LOG_FILE_CONFIG;
  }

  protected override async getHistoryRecords(
    since?: Date
  ): Promise<readonly ArrHistoryRecordBase[]> {
    const client = this.getClient();

    if (since) {
      return client.getProwlarrHistorySince(since);
    }

    // Get recent history (first page)
    const response = await client.getProwlarrHistory({ pageSize: 50 });
    return response.records;
  }

  /**
   * Override getActivity to skip queue (Prowlarr doesn't have a queue endpoint)
   */
  override async getActivity(since?: Date): Promise<readonly NormalizedActivity[]> {
    const activities: NormalizedActivity[] = [];

    // Get history records only (no queue for Prowlarr)
    try {
      const historyResponse = await this.getHistoryRecords(since);
      const historyActivities = historyResponse.map((record) =>
        this.normalizeHistoryRecord(record)
      );
      activities.push(...historyActivities);
    } catch (error) {
      console.error(`[${this.id}] Failed to get history:`, error);
    }

    return activities;
  }

  protected override normalizeHistoryRecord(record: ArrHistoryRecordBase): NormalizedActivity {
    const prowlarrRecord = record as ProwlarrHistoryRecord;
    const eventTypeName =
      ProwlarrEventTypeNames[this.parseEventType(prowlarrRecord.eventType)] ??
      prowlarrRecord.eventType;
    const activityType = this.mapProwlarrEventType(eventTypeName);
    const severity = this.mapProwlarrSeverity(activityType);

    // Build a descriptive title
    let title = '';
    let description = '';

    const indexerName = prowlarrRecord.indexer?.name ?? `Indexer #${prowlarrRecord.indexerId}`;

    switch (eventTypeName) {
      case 'Query':
        title = `Search: ${prowlarrRecord.query !== undefined && prowlarrRecord.query !== '' ? prowlarrRecord.query : 'Unknown Query'}`;
        description = `Searched ${indexerName}${prowlarrRecord.successful === false ? ' (failed)' : ''}`;
        break;
      case 'Grabbed':
        title = `Grabbed: ${prowlarrRecord.sourceTitle}`;
        description = `Release grabbed from ${indexerName}`;
        break;
      case 'RSS Sync':
        title = `RSS Sync: ${indexerName}`;
        description = `RSS feed synced${prowlarrRecord.successful === false ? ' (failed)' : ''}`;
        break;
      case 'Auth':
        title = `Auth: ${indexerName}`;
        description =
          prowlarrRecord.successful === false
            ? 'Authentication failed'
            : 'Authentication successful';
        break;
      default:
        title = `${eventTypeName}: ${indexerName}`;
        description = prowlarrRecord.sourceTitle ?? '';
    }

    return {
      id: `prowlarr-history-${prowlarrRecord.id}`,
      type: eventTypeName,
      name: title,
      overview: description,
      severity: prowlarrRecord.successful === false ? 'error' : severity,
      timestamp: new Date(prowlarrRecord.date),
      itemId: prowlarrRecord.indexerId?.toString(),
      metadata: {
        indexerId: prowlarrRecord.indexerId,
        indexerName: prowlarrRecord.indexer?.name,
        query: prowlarrRecord.query,
        successful: prowlarrRecord.successful,
        elapsedTime: prowlarrRecord.elapsedTime,
        categories: prowlarrRecord.categories,
      },
    };
  }

  /**
   * Map Prowlarr event types to activity types
   */
  private mapProwlarrEventType(eventTypeName: string): string {
    switch (eventTypeName) {
      case 'Query':
        return 'search';
      case 'Grabbed':
        return 'grab';
      case 'RSS Sync':
        return 'rss_sync';
      case 'Auth':
        return 'auth';
      default:
        return 'unknown';
    }
  }

  /**
   * Map Prowlarr activity types to severity levels
   */
  private mapProwlarrSeverity(activityType: string): 'info' | 'warn' | 'error' {
    switch (activityType) {
      case 'auth':
        return 'warn';
      default:
        return 'info';
    }
  }

  /**
   * Parse event type which can be string or number
   */
  private parseEventType(eventType: string | number): number {
    if (typeof eventType === 'number') {
      return eventType;
    }
    // Try to parse as number
    const parsed = parseInt(eventType, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
    // Return 0 for unknown
    return 0;
  }
}
