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
  type ArrHistoryRecordBase,
  type ArrPaginatedResponse,
} from '@logarr/provider-arr';

import { LidarrEventTypeNames } from './lidarr.types.js';

import type { LidarrHistoryRecord } from './lidarr.types.js';
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

type Severity = 'info' | 'warn' | 'error';

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

/** Display prefix and severity per canonical (camelCase) event type */
const EVENT_DISPLAY: Record<string, { readonly label: string; readonly severity: Severity }> = {
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
  override getLogFileConfig(): LogFileConfig {
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
    const eventName = this.resolveEventType(lidarrRecord.eventType);
    const display = EVENT_DISPLAY[eventName];
    let severity: Severity = display?.severity ?? 'info';

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
        name = `Grabbed: ${subject}`;
        overview = `Release grabbed: ${sourceTitle}`;
        break;
      case 'artistFolderImported':
        name = `Artist Folder Imported: ${artist}`;
        overview = `Artist folder imported: ${sourceTitle}`;
        break;
      case 'trackFileImported':
        name = `Imported: ${subject}`;
        overview = `Track imported: ${sourceTitle}`;
        break;
      case 'downloadFailed':
        name = `Download Failed: ${subject}`;
        overview = message ?? `Failed to download: ${sourceTitle}`;
        break;
      case 'trackFileDeleted': {
        const reason = this.dataString(data, 'reason');
        name = `Deleted: ${subject}`;
        overview = `Track file deleted: ${sourceTitle}${reason !== undefined ? ` (${reason})` : ''}`;
        break;
      }
      case 'trackFileRenamed':
        name = `Renamed: ${subject}`;
        overview = `Track file renamed: ${sourceTitle}`;
        break;
      case 'albumImportIncomplete':
        name = `Import Incomplete: ${subject}`;
        overview = message ?? `Album import incomplete: ${sourceTitle}`;
        break;
      case 'downloadImported':
        name = `Download Imported: ${subject}`;
        overview = `Download imported: ${sourceTitle}`;
        break;
      case 'trackFileRetagged':
        name = `Retagged: ${subject}`;
        overview = `Track file retagged: ${sourceTitle}`;
        break;
      case 'downloadIgnored':
        name = `Download Ignored: ${subject}`;
        overview = `Download ignored: ${sourceTitle}`;
        break;
      default:
        name = `${eventName}: ${subject}`;
        overview = sourceTitle;
        // Future/unknown event types: surface failures as errors
        if (/fail/i.test(eventName)) {
          severity = 'error';
        }
    }

    return {
      id: `lidarr-history-${lidarrRecord.id}`,
      type: eventName,
      name,
      overview,
      severity,
      timestamp: new Date(lidarrRecord.date),
      itemId:
        typeof lidarrRecord.albumId === 'number' && lidarrRecord.albumId > 0
          ? String(lidarrRecord.albumId)
          : undefined,
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
   * Resolve the API event type (number, numeric string or camelCase string,
   * case-insensitive) to its canonical camelCase name.
   *
   * Unrecognised strings are returned unchanged; 0 / NaN-ish values map to 'unknown'.
   */
  private resolveEventType(eventType: string | number | undefined): string {
    if (typeof eventType === 'number') {
      return LidarrEventTypeNames[eventType] ?? 'unknown';
    }

    const raw = (eventType ?? '').trim();
    if (raw === '') {
      return 'unknown';
    }

    if (/^\d+$/.test(raw)) {
      return LidarrEventTypeNames[Number(raw)] ?? 'unknown';
    }

    const lower = raw.toLowerCase();
    const canonical = Object.values(LidarrEventTypeNames).find((n) => n.toLowerCase() === lower);
    return canonical ?? raw;
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
