/**
 * Sonarr provider implementation
 */

import {
  ArrBaseProvider,
  ArrClient,
  SONARR_LOG_FILE_CONFIG,
  type ArrHistoryRecordBase,
  type ArrPaginatedResponse,
} from '@logarr/provider-arr';

import { SonarrEventTypeNames } from './sonarr.types.js';

import type { SonarrHistoryRecord, SonarrQueueItem } from './sonarr.types.js';
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
 * Extended client for Sonarr-specific endpoints
 */
class SonarrClient extends ArrClient {
  /**
   * Get history with series and episode information
   */
  async getSonarrHistory(options?: {
    page?: number;
    pageSize?: number;
    since?: Date;
  }): Promise<ArrPaginatedResponse<SonarrHistoryRecord>> {
    return this.get<ArrPaginatedResponse<SonarrHistoryRecord>>('/history', {
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
  async getSonarrHistorySince(date: Date): Promise<readonly SonarrHistoryRecord[]> {
    return this.get<SonarrHistoryRecord[]>('/history/since', {
      date: date.toISOString(),
      includeSeries: true,
      includeEpisode: true,
    });
  }

  /**
   * Get queue with series information
   */
  async getSonarrQueue(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<ArrPaginatedResponse<SonarrQueueItem>> {
    return this.get<ArrPaginatedResponse<SonarrQueueItem>>('/queue', {
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

export class SonarrProvider extends ArrBaseProvider {
  readonly id = 'sonarr';
  readonly name = 'Sonarr';

  protected override createClient(url: string, apiKey: string): SonarrClient {
    return new SonarrClient(url, apiKey);
  }

  protected override getClient(): SonarrClient {
    return super.getClient() as SonarrClient;
  }

  protected getMediaType(): 'series' {
    return 'series';
  }

  /**
   * Override log paths with Sonarr-specific defaults
   */
  override getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }

    // Default Sonarr log paths for different platforms
    return Promise.resolve([
      '/sonarr-logs', // Docker with Logarr (mount via SONARR_LOGS_PATH env var)
      '/config/logs', // Docker (Sonarr container)
      '~/.config/Sonarr/logs', // Linux
      '/var/lib/sonarr/logs', // Linux alternative
      'C:\\ProgramData\\Sonarr\\logs', // Windows
    ]);
  }

  /**
   * Override log file config with Sonarr-specific paths
   */
  override getLogFileConfig(): LogFileConfig {
    return SONARR_LOG_FILE_CONFIG;
  }

  protected override async getHistoryRecords(
    since?: Date
  ): Promise<readonly ArrHistoryRecordBase[]> {
    const client = this.getClient();

    if (since) {
      return client.getSonarrHistorySince(since);
    }

    // Get recent history (first page)
    const response = await client.getSonarrHistory({ pageSize: 50 });
    return response.records;
  }

  protected override normalizeHistoryRecord(record: ArrHistoryRecordBase): NormalizedActivity {
    const sonarrRecord = record as SonarrHistoryRecord;
    const eventTypeName =
      SonarrEventTypeNames[this.parseEventType(sonarrRecord.eventType)] ?? sonarrRecord.eventType;
    const activityType = this.mapEventTypeToActivityType(eventTypeName);
    const severity = this.mapActivityTypeToSeverity(activityType);

    // Build a descriptive title
    let title = '';
    let description = '';

    const seriesTitle = sonarrRecord.series?.title ?? 'Unknown Series';
    const episodeInfo = sonarrRecord.episode
      ? `S${String(sonarrRecord.episode.seasonNumber).padStart(2, '0')}E${String(sonarrRecord.episode.episodeNumber).padStart(2, '0')}`
      : '';
    const episodeTitle = sonarrRecord.episode?.title ?? '';

    switch (activityType) {
      case 'grab':
        title = `Grabbed: ${seriesTitle} ${episodeInfo}`;
        description = `Release grabbed: ${sonarrRecord.sourceTitle}`;
        break;
      case 'import_complete':
        title = `Imported: ${seriesTitle} ${episodeInfo}`;
        description =
          episodeTitle !== ''
            ? `"${episodeTitle}" imported successfully`
            : 'Episode imported successfully';
        break;
      case 'download_failed':
        title = `Download Failed: ${seriesTitle} ${episodeInfo}`;
        description =
          sonarrRecord.data?.['message']?.toString() ??
          `Failed to download: ${sonarrRecord.sourceTitle}`;
        break;
      case 'import_failed':
        title = `Import Failed: ${seriesTitle} ${episodeInfo}`;
        description =
          sonarrRecord.data?.['message']?.toString() ??
          `Failed to import: ${sonarrRecord.sourceTitle}`;
        break;
      case 'deleted':
        title = `Deleted: ${seriesTitle} ${episodeInfo}`;
        description =
          episodeTitle !== '' ? `"${episodeTitle}" was deleted` : 'Episode file was deleted';
        break;
      case 'renamed':
        title = `Renamed: ${seriesTitle} ${episodeInfo}`;
        description =
          episodeTitle !== '' ? `"${episodeTitle}" was renamed` : 'Episode file was renamed';
        break;
      default:
        title = `${eventTypeName}: ${seriesTitle} ${episodeInfo}`;
        description = sonarrRecord.sourceTitle;
    }

    return {
      id: `sonarr-history-${sonarrRecord.id}`,
      type: eventTypeName,
      name: title,
      overview: description,
      severity,
      timestamp: new Date(sonarrRecord.date),
      itemId: sonarrRecord.episodeId?.toString(),
      metadata: {
        seriesId: sonarrRecord.seriesId,
        episodeId: sonarrRecord.episodeId,
        quality: sonarrRecord.quality?.quality?.name,
        downloadId: sonarrRecord.downloadId,
        indexer: sonarrRecord.data?.['indexer'],
        downloadClient: sonarrRecord.data?.['downloadClient'],
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
