/**
 * Whisparr provider implementation
 *
 * Whisparr is a fork of Sonarr for adult content management.
 * Uses v3 API and similar structure to Sonarr.
 */

import {
  ArrBaseProvider,
  ArrClient,
  WHISPARR_LOG_FILE_CONFIG,
  type ArrHistoryRecordBase,
  type ArrPaginatedResponse,
} from '@logarr/provider-arr';

import { WhisparrEventTypeNames } from './whisparr.types.js';

import type { WhisparrHistoryRecord, WhisparrQueueItem } from './whisparr.types.js';
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
 * Extended client for Whisparr-specific endpoints
 */
class WhisparrClient extends ArrClient {
  /**
   * Get history with series and episode information
   */
  async getWhisparrHistory(options?: {
    page?: number;
    pageSize?: number;
    since?: Date;
  }): Promise<ArrPaginatedResponse<WhisparrHistoryRecord>> {
    return this.get<ArrPaginatedResponse<WhisparrHistoryRecord>>('/history', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: 'date',
      sortDirection: 'descending',
      includeSeries: true,
      includeEpisode: true,
    });
  }

  /**
   * Get history since a specific date
   */
  async getWhisparrHistorySince(date: Date): Promise<readonly WhisparrHistoryRecord[]> {
    return this.get<WhisparrHistoryRecord[]>('/history/since', {
      date: date.toISOString(),
      includeSeries: true,
      includeEpisode: true,
    });
  }

  /**
   * Get queue with series information
   */
  async getWhisparrQueue(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<ArrPaginatedResponse<WhisparrQueueItem>> {
    return this.get<ArrPaginatedResponse<WhisparrQueueItem>>('/queue', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: 'timeleft',
      sortDirection: 'ascending',
      includeSeries: true,
      includeEpisode: true,
      includeUnknownSeriesItems: true,
    });
  }
}

export class WhisparrProvider extends ArrBaseProvider {
  readonly id = 'whisparr';
  readonly name = 'Whisparr';

  protected override createClient(url: string, apiKey: string): WhisparrClient {
    return new WhisparrClient(url, apiKey);
  }

  protected override getClient(): WhisparrClient {
    return super.getClient() as WhisparrClient;
  }

  protected getMediaType(): 'series' {
    return 'series';
  }

  /**
   * Override log paths with Whisparr-specific defaults
   */
  override getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }

    // Default Whisparr log paths for different platforms
    return Promise.resolve([
      '/whisparr-logs', // Docker with Logarr (mount via WHISPARR_LOGS_PATH env var)
      '/config/logs', // Docker (Whisparr container)
      '~/.config/Whisparr/logs', // Linux
      '/var/lib/whisparr/logs', // Linux alternative
      'C:\\ProgramData\\Whisparr\\logs', // Windows
    ]);
  }

  /**
   * Override log file config with Whisparr-specific paths
   */
  override getLogFileConfig(): LogFileConfig {
    return WHISPARR_LOG_FILE_CONFIG;
  }

  protected override async getHistoryRecords(
    since?: Date
  ): Promise<readonly ArrHistoryRecordBase[]> {
    const client = this.getClient();

    if (since) {
      return client.getWhisparrHistorySince(since);
    }

    // Get recent history (first page)
    const response = await client.getWhisparrHistory({ pageSize: 50 });
    return response.records;
  }

  protected override normalizeHistoryRecord(record: ArrHistoryRecordBase): NormalizedActivity {
    const whisparrRecord = record as WhisparrHistoryRecord;
    const eventTypeName =
      WhisparrEventTypeNames[this.parseEventType(whisparrRecord.eventType)] ??
      whisparrRecord.eventType;
    const activityType = this.mapEventTypeToActivityType(eventTypeName);
    const severity = this.mapActivityTypeToSeverity(activityType);

    // Build a descriptive title
    let title = '';
    let description = '';

    const siteTitle = whisparrRecord.series?.title ?? 'Unknown Site';
    const episodeInfo = whisparrRecord.episode
      ? `S${String(whisparrRecord.episode.seasonNumber).padStart(2, '0')}E${String(whisparrRecord.episode.episodeNumber).padStart(2, '0')}`
      : '';
    const episodeTitle = whisparrRecord.episode?.title ?? '';

    switch (activityType) {
      case 'grab':
        title = `Grabbed: ${siteTitle} ${episodeInfo}`;
        description = `Release grabbed: ${whisparrRecord.sourceTitle}`;
        break;
      case 'import_complete':
        title = `Imported: ${siteTitle} ${episodeInfo}`;
        description =
          episodeTitle !== ''
            ? `"${episodeTitle}" imported successfully`
            : 'Scene imported successfully';
        break;
      case 'download_failed':
        title = `Download Failed: ${siteTitle} ${episodeInfo}`;
        description =
          whisparrRecord.data?.['message']?.toString() ??
          `Failed to download: ${whisparrRecord.sourceTitle}`;
        break;
      case 'import_failed':
        title = `Import Failed: ${siteTitle} ${episodeInfo}`;
        description =
          whisparrRecord.data?.['message']?.toString() ??
          `Failed to import: ${whisparrRecord.sourceTitle}`;
        break;
      case 'deleted':
        title = `Deleted: ${siteTitle} ${episodeInfo}`;
        description =
          episodeTitle !== '' ? `"${episodeTitle}" was deleted` : 'Scene file was deleted';
        break;
      case 'renamed':
        title = `Renamed: ${siteTitle} ${episodeInfo}`;
        description =
          episodeTitle !== '' ? `"${episodeTitle}" was renamed` : 'Scene file was renamed';
        break;
      default:
        title = `${eventTypeName}: ${siteTitle} ${episodeInfo}`;
        description = whisparrRecord.sourceTitle;
    }

    return {
      id: `whisparr-history-${whisparrRecord.id}`,
      type: eventTypeName,
      name: title,
      overview: description,
      severity,
      timestamp: new Date(whisparrRecord.date),
      itemId: whisparrRecord.episodeId?.toString(),
      metadata: {
        seriesId: whisparrRecord.seriesId,
        episodeId: whisparrRecord.episodeId,
        quality: whisparrRecord.quality?.quality?.name,
        downloadId: whisparrRecord.downloadId,
        indexer: whisparrRecord.data?.['indexer'],
        downloadClient: whisparrRecord.data?.['downloadClient'],
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
