/**
 * Radarr provider implementation
 */

import {
  ArrBaseProvider,
  ArrClient,
  RADARR_LOG_FILE_CONFIG,
  type ArrHistoryRecordBase,
  type ArrPaginatedResponse,
} from '@logarr/provider-arr';

import { RadarrEventTypeNames } from './radarr.types.js';

import type { RadarrHistoryRecord, RadarrQueueItem } from './radarr.types.js';
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
 * Extended client for Radarr-specific endpoints
 */
class RadarrClient extends ArrClient {
  /**
   * Get history with movie information
   */
  async getRadarrHistory(options?: {
    page?: number;
    pageSize?: number;
    since?: Date;
  }): Promise<ArrPaginatedResponse<RadarrHistoryRecord>> {
    return this.get<ArrPaginatedResponse<RadarrHistoryRecord>>('/history', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: 'date',
      sortDirection: 'descending',
      includeMovie: true,
    });
  }

  /**
   * Get history since a specific date
   */
  async getRadarrHistorySince(date: Date): Promise<readonly RadarrHistoryRecord[]> {
    return this.get<RadarrHistoryRecord[]>('/history/since', {
      date: date.toISOString(),
      includeMovie: true,
    });
  }

  /**
   * Get queue with movie information
   */
  async getRadarrQueue(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<ArrPaginatedResponse<RadarrQueueItem>> {
    return this.get<ArrPaginatedResponse<RadarrQueueItem>>('/queue', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: 'timeleft',
      sortDirection: 'ascending',
      includeMovie: true,
      includeUnknownMovieItems: true,
    });
  }
}

export class RadarrProvider extends ArrBaseProvider {
  readonly id = 'radarr';
  readonly name = 'Radarr';

  protected override createClient(url: string, apiKey: string): RadarrClient {
    return new RadarrClient(url, apiKey);
  }

  protected override getClient(): RadarrClient {
    return super.getClient() as RadarrClient;
  }

  protected getMediaType(): 'movie' {
    return 'movie';
  }

  /**
   * Override log paths with Radarr-specific defaults
   */
  override getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }

    // Default Radarr log paths for different platforms
    return Promise.resolve([
      '/radarr-logs', // Docker with Logarr (mount via RADARR_LOGS_PATH env var)
      '/config/logs', // Docker (Radarr container)
      '~/.config/Radarr/logs', // Linux
      '/var/lib/radarr/logs', // Linux alternative
      'C:\\ProgramData\\Radarr\\logs', // Windows
    ]);
  }

  /**
   * Override log file config with Radarr-specific paths
   */
  override getLogFileConfig(): LogFileConfig {
    return RADARR_LOG_FILE_CONFIG;
  }

  protected override async getHistoryRecords(
    since?: Date
  ): Promise<readonly ArrHistoryRecordBase[]> {
    const client = this.getClient();

    if (since) {
      return client.getRadarrHistorySince(since);
    }

    // Get recent history (first page)
    const response = await client.getRadarrHistory({ pageSize: 50 });
    return response.records;
  }

  protected override normalizeHistoryRecord(record: ArrHistoryRecordBase): NormalizedActivity {
    const radarrRecord = record as RadarrHistoryRecord;
    const eventTypeName =
      RadarrEventTypeNames[this.parseEventType(radarrRecord.eventType)] ?? radarrRecord.eventType;
    const activityType = this.mapEventTypeToActivityType(eventTypeName);
    const severity = this.mapActivityTypeToSeverity(activityType);

    // Build a descriptive title
    let title = '';
    let description = '';

    const movieTitle = radarrRecord.movie?.title ?? 'Unknown Movie';
    const movieYear =
      radarrRecord.movie?.year !== undefined && radarrRecord.movie.year !== 0
        ? ` (${radarrRecord.movie.year})`
        : '';

    switch (activityType) {
      case 'grab':
        title = `Grabbed: ${movieTitle}${movieYear}`;
        description = `Release grabbed: ${radarrRecord.sourceTitle}`;
        break;
      case 'import_complete':
        title = `Imported: ${movieTitle}${movieYear}`;
        description = `Movie imported successfully`;
        break;
      case 'download_failed':
        title = `Download Failed: ${movieTitle}${movieYear}`;
        description =
          radarrRecord.data?.['message']?.toString() ??
          `Failed to download: ${radarrRecord.sourceTitle}`;
        break;
      case 'import_failed':
        title = `Import Failed: ${movieTitle}${movieYear}`;
        description =
          radarrRecord.data?.['message']?.toString() ??
          `Failed to import: ${radarrRecord.sourceTitle}`;
        break;
      case 'deleted':
        title = `Deleted: ${movieTitle}${movieYear}`;
        description = 'Movie file was deleted';
        break;
      case 'renamed':
        title = `Renamed: ${movieTitle}${movieYear}`;
        description = 'Movie file was renamed';
        break;
      default:
        title = `${eventTypeName}: ${movieTitle}${movieYear}`;
        description = radarrRecord.sourceTitle;
    }

    return {
      id: `radarr-history-${radarrRecord.id}`,
      type: eventTypeName,
      name: title,
      overview: description,
      severity,
      timestamp: new Date(radarrRecord.date),
      itemId: radarrRecord.movieId?.toString(),
      metadata: {
        movieId: radarrRecord.movieId,
        quality: radarrRecord.quality?.quality?.name,
        downloadId: radarrRecord.downloadId,
        indexer: radarrRecord.data?.['indexer'],
        downloadClient: radarrRecord.data?.['downloadClient'],
        imdbId: radarrRecord.movie?.imdbId,
        tmdbId: radarrRecord.movie?.tmdbId,
      },
    };
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
