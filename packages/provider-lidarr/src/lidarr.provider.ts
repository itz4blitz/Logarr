/**
 * Lidarr provider implementation
 *
 * Lidarr is the *arr application for music management.
 * Uses API v1 and models media as artists, albums and tracks.
 */

import {
  ArrBaseProvider,
  ArrClient,
  LIDARR_LOG_FILE_CONFIG,
  describeArrEvent,
  resolveArrEventName,
  toArrItemId,
  type ArrEventTable,
  type ArrHistoryRecordBase,
  type ArrPaginatedResponse,
} from '@logarr/provider-arr';

import { LidarrEventTypeNames } from './lidarr.types.js';

import type { LidarrHistoryRecord } from './lidarr.types.js';
import type { NormalizedActivity } from '@logarr/core';

/**
 * Extended client for Lidarr-specific endpoints
 * Lidarr uses API v1 instead of v3
 */
class LidarrClient extends ArrClient {
  constructor(baseUrl: string, apiKey: string) {
    super(baseUrl, apiKey, 'v1');
  }

  /**
   * Get history with artist and album information
   */
  async getLidarrHistory(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<ArrPaginatedResponse<LidarrHistoryRecord>> {
    return this.get<ArrPaginatedResponse<LidarrHistoryRecord>>('/history', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: 'date',
      sortDirection: 'descending',
      includeArtist: true,
      includeAlbum: true,
    });
  }

  /**
   * Get history since a specific date
   */
  async getLidarrHistorySince(date: Date): Promise<readonly LidarrHistoryRecord[]> {
    return this.get<LidarrHistoryRecord[]>('/history/since', {
      date: date.toISOString(),
      includeArtist: true,
      includeAlbum: true,
    });
  }
}

/** Display label and severity per event (camelCase name as reported by the API) */
const LIDARR_EVENTS: ArrEventTable = {
  grabbed: { label: 'Grabbed', severity: 'info' },
  artistFolderImported: { label: 'Artist Folder Imported', severity: 'info' },
  trackFileImported: { label: 'Imported', severity: 'info' },
  downloadFailed: { label: 'Download Failed', severity: 'error' },
  trackFileDeleted: { label: 'Deleted', severity: 'info' },
  trackFileRenamed: { label: 'Renamed', severity: 'info' },
  albumImportIncomplete: { label: 'Import Incomplete', severity: 'warn' },
  downloadImported: { label: 'Download Imported', severity: 'info' },
  trackFileRetagged: { label: 'Retagged', severity: 'info' },
  downloadIgnored: { label: 'Download Ignored', severity: 'info' },
};

export class LidarrProvider extends ArrBaseProvider {
  readonly id = 'lidarr';
  readonly name = 'Lidarr';

  protected override createClient(url: string, apiKey: string): LidarrClient {
    return new LidarrClient(url, apiKey);
  }

  protected override getClient(): LidarrClient {
    return super.getClient() as LidarrClient;
  }

  protected getMediaType(): 'artist' {
    return 'artist';
  }

  /**
   * Override log paths with Lidarr-specific defaults
   */
  override getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }

    // Default Lidarr log paths for different platforms
    return Promise.resolve([
      '/lidarr-logs', // Docker with Logarr (mount via LIDARR_LOGS_PATH env var)
      '/config/logs', // Docker (Lidarr container)
      '~/.config/Lidarr/logs', // Linux / macOS
      '/var/lib/lidarr/logs', // Linux alternative
      'C:\\ProgramData\\Lidarr\\logs', // Windows
    ]);
  }

  /**
   * Override log file config with Lidarr-specific paths
   */
  override getLogFileConfig(): ReturnType<ArrBaseProvider['getLogFileConfig']> {
    return LIDARR_LOG_FILE_CONFIG;
  }

  protected override async getHistoryRecords(
    since?: Date
  ): Promise<readonly ArrHistoryRecordBase[]> {
    const client = this.getClient();

    if (since) {
      return client.getLidarrHistorySince(since);
    }

    // Get recent history (first page)
    const response = await client.getLidarrHistory({ pageSize: 50 });
    return response.records;
  }

  protected override normalizeHistoryRecord(record: ArrHistoryRecordBase): NormalizedActivity {
    const lidarrRecord = record as LidarrHistoryRecord;
    const eventName = resolveArrEventName(lidarrRecord.eventType, LidarrEventTypeNames);
    const { label, severity } = describeArrEvent(eventName, LIDARR_EVENTS);

    const artist = lidarrRecord.artist?.artistName ?? 'Unknown Artist';
    const album = lidarrRecord.album?.title;
    const subject = album !== undefined && album !== '' ? `${artist} - ${album}` : artist;
    const sourceTitle = lidarrRecord.sourceTitle;
    const data = lidarrRecord.data as Record<string, unknown> | undefined;
    const message = this.dataString(data, 'message');

    let name: string;
    let overview: string;

    switch (eventName) {
      case 'grabbed':
        name = `${label}: ${subject}`;
        overview = `Release grabbed: ${sourceTitle}`;
        break;
      case 'artistFolderImported':
        name = `${label}: ${artist}`;
        overview = `Artist folder imported: ${sourceTitle}`;
        break;
      case 'trackFileImported':
        name = `${label}: ${subject}`;
        overview = `Track imported: ${sourceTitle}`;
        break;
      case 'downloadFailed':
        name = `${label}: ${subject}`;
        overview = message ?? `Failed to download: ${sourceTitle}`;
        break;
      case 'trackFileDeleted': {
        const reason = this.dataString(data, 'reason');
        name = `${label}: ${subject}`;
        overview = `Track file deleted: ${sourceTitle}${reason !== undefined ? ` (${reason})` : ''}`;
        break;
      }
      case 'trackFileRenamed':
        name = `${label}: ${subject}`;
        overview = `Track file renamed: ${sourceTitle}`;
        break;
      case 'albumImportIncomplete':
        name = `${label}: ${subject}`;
        overview = message ?? `Album import incomplete: ${sourceTitle}`;
        break;
      case 'downloadImported':
        name = `${label}: ${subject}`;
        overview = `Download imported: ${sourceTitle}`;
        break;
      case 'trackFileRetagged':
        name = `${label}: ${subject}`;
        overview = `Track file retagged: ${sourceTitle}`;
        break;
      case 'downloadIgnored':
        name = `${label}: ${subject}`;
        overview = `Download ignored: ${sourceTitle}`;
        break;
      default:
        name = `${label}: ${subject}`;
        overview = sourceTitle;
    }

    return {
      id: `lidarr-history-${lidarrRecord.id}`,
      type: eventName,
      name,
      overview,
      severity,
      timestamp: new Date(lidarrRecord.date),
      itemId: toArrItemId(lidarrRecord.albumId),
      metadata: {
        artistId: lidarrRecord.artistId,
        albumId: lidarrRecord.albumId,
        trackId: lidarrRecord.trackId,
        mediaType: this.getMediaType(),
        quality: lidarrRecord.quality?.quality?.name,
        downloadId: lidarrRecord.downloadId,
        indexer: data?.['indexer'],
        downloadClient: data?.['downloadClient'],
        releaseGroup: data?.['releaseGroup'],
      },
    };
  }

  /**
   * Read a non-empty string-ish value from the history `data` bag
   */
  private dataString(data: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = data?.[key];
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    return String(value);
  }
}
