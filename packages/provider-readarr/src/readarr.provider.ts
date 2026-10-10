/**
 * Readarr provider implementation
 *
 * Readarr manages books, audiobooks and comics. It uses the *arr v1 API and the
 * same NLog log format as Sonarr.
 *
 * NOTE: Readarr was retired upstream in June 2025 (last release v0.4.18). It is
 * supported on a best-effort basis; expect permanent metadata (BookInfo) health
 * errors on most installs.
 */

import {
  ArrBaseProvider,
  ArrClient,
  READARR_LOG_FILE_CONFIG,
  describeArrEvent,
  resolveArrEventName,
  toArrItemId,
  type ArrEventTable,
  type ArrHistoryRecordBase,
  type ArrPaginatedResponse,
} from '@logarr/provider-arr';

import { ReadarrEventTypeNames } from './readarr.types.js';

import type { ReadarrHistoryRecord } from './readarr.types.js';
import type { NormalizedActivity } from '@logarr/core';

/**
 * Display label and severity per Readarr history event name.
 * Must agree with the Lidarr table for equivalent events.
 */
const READARR_EVENTS: ArrEventTable = {
  grabbed: { label: 'Grabbed', severity: 'info' },
  bookFileImported: { label: 'Imported', severity: 'info' },
  downloadFailed: { label: 'Download Failed', severity: 'error' },
  bookFileDeleted: { label: 'Deleted', severity: 'info' },
  bookFileRenamed: { label: 'Renamed', severity: 'info' },
  bookImportIncomplete: { label: 'Import Incomplete', severity: 'warn' },
  downloadImported: { label: 'Download Imported', severity: 'info' },
  bookFileRetagged: { label: 'Retagged', severity: 'info' },
  downloadIgnored: { label: 'Download Ignored', severity: 'info' },
};

/**
 * Extended client for Readarr-specific endpoints (API v1)
 */
class ReadarrClient extends ArrClient {
  constructor(baseUrl: string, apiKey: string) {
    super(baseUrl, apiKey, 'v1');
  }

  /**
   * Get history with author and book information
   */
  async getReadarrHistory(options?: {
    page?: number;
    pageSize?: number;
  }): Promise<ArrPaginatedResponse<ReadarrHistoryRecord>> {
    return this.get<ArrPaginatedResponse<ReadarrHistoryRecord>>('/history', {
      page: options?.page ?? 1,
      pageSize: options?.pageSize ?? 50,
      sortKey: 'date',
      sortDirection: 'descending',
      includeAuthor: true,
      includeBook: true,
    });
  }

  /**
   * Get history since a specific date
   */
  async getReadarrHistorySince(date: Date): Promise<readonly ReadarrHistoryRecord[]> {
    return this.get<ReadarrHistoryRecord[]>('/history/since', {
      date: date.toISOString(),
      includeAuthor: true,
      includeBook: true,
    });
  }
}

export class ReadarrProvider extends ArrBaseProvider {
  readonly id = 'readarr';
  readonly name = 'Readarr';

  protected override createClient(url: string, apiKey: string): ReadarrClient {
    return new ReadarrClient(url, apiKey);
  }

  protected override getClient(): ReadarrClient {
    return super.getClient() as ReadarrClient;
  }

  protected getMediaType(): 'book' {
    return 'book';
  }

  /**
   * Override log paths with Readarr-specific defaults
   */
  override getLogPaths(): Promise<readonly string[]> {
    if (this.config?.logPath !== undefined) {
      return Promise.resolve([this.config.logPath]);
    }

    // Default Readarr log paths for different platforms
    return Promise.resolve([
      '/readarr-logs', // Docker with Logarr (mount via READARR_LOGS_PATH env var)
      '/config/logs', // Docker (Readarr container)
      '~/.config/Readarr/logs', // Linux
      '/var/lib/readarr/logs', // Linux alternative
      'C:\\ProgramData\\Readarr\\logs', // Windows
    ]);
  }

  /**
   * Override log file config with Readarr-specific paths
   */
  override getLogFileConfig(): ReturnType<ArrBaseProvider['getLogFileConfig']> {
    return READARR_LOG_FILE_CONFIG;
  }

  protected override async getHistoryRecords(
    since?: Date
  ): Promise<readonly ArrHistoryRecordBase[]> {
    const client = this.getClient();

    if (since) {
      return await client.getReadarrHistorySince(since);
    }

    // Get recent history (first page)
    const response = await client.getReadarrHistory({ pageSize: 50 });
    return response.records;
  }

  protected override normalizeHistoryRecord(record: ArrHistoryRecordBase): NormalizedActivity {
    const readarrRecord = record as ReadarrHistoryRecord;
    const eventTypeName = resolveArrEventName(readarrRecord.eventType, ReadarrEventTypeNames);
    const display = describeArrEvent(eventTypeName, READARR_EVENTS);

    const authorName = readarrRecord.author?.authorName ?? 'Unknown Author';
    const bookTitle = readarrRecord.book?.title ?? '';
    const label = bookTitle !== '' ? `${authorName} - ${bookTitle}` : authorName;
    const data = readarrRecord.data as Record<string, unknown> | undefined;
    const message = this.dataString(data, 'message');
    const sourceTitle = readarrRecord.sourceTitle;

    let description: string;

    switch (eventTypeName) {
      case 'grabbed':
        description = `Release grabbed: ${sourceTitle}`;
        break;
      case 'bookFileImported':
        description = `Book file imported: ${sourceTitle}`;
        break;
      case 'downloadFailed':
        description = message ?? `Failed to download: ${sourceTitle}`;
        break;
      case 'bookFileDeleted': {
        const reason = this.dataString(data, 'reason');
        description = `Book file deleted: ${sourceTitle}${reason !== undefined ? ` (${reason})` : ''}`;
        break;
      }
      case 'bookFileRenamed':
        description = `Book file renamed: ${sourceTitle}`;
        break;
      case 'bookImportIncomplete':
        description = message ?? `Book import incomplete: ${sourceTitle}`;
        break;
      case 'downloadImported':
        description = `Download imported: ${sourceTitle}`;
        break;
      case 'bookFileRetagged':
        description = `Book file retagged: ${sourceTitle}`;
        break;
      case 'downloadIgnored':
        description = `Download ignored: ${sourceTitle}`;
        break;
      default:
        description = sourceTitle;
    }

    return {
      id: `readarr-history-${readarrRecord.id}`,
      type: eventTypeName,
      name: `${display.label}: ${label}`,
      overview: description,
      severity: display.severity,
      timestamp: new Date(readarrRecord.date),
      itemId: toArrItemId(readarrRecord.bookId),
      metadata: {
        authorId: readarrRecord.authorId,
        bookId: readarrRecord.bookId,
        mediaType: this.getMediaType(),
        quality: readarrRecord.quality?.quality?.name,
        downloadId: readarrRecord.downloadId,
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
