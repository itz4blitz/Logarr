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
  type ArrActivityType,
  type ArrHistoryRecordBase,
  type ArrPaginatedResponse,
} from '@logarr/provider-arr';

import { ReadarrEventTypeNames } from './readarr.types.js';

import type { ReadarrHistoryRecord } from './readarr.types.js';
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

interface ReadarrEventMapping {
  readonly activityType: ArrActivityType;
  readonly severity: 'info' | 'warn' | 'error';
  readonly titlePrefix: string;
}

/**
 * Readarr history event name -> activity type, severity and title prefix.
 * Explicit on purpose: the base mapper has no Readarr names and defaults to 'grab'.
 */
const READARR_EVENT_MAP: Readonly<Record<string, ReadarrEventMapping>> = {
  grabbed: { activityType: 'grab', severity: 'info', titlePrefix: 'Grabbed' },
  bookFileImported: { activityType: 'import_complete', severity: 'info', titlePrefix: 'Imported' },
  downloadImported: { activityType: 'import_complete', severity: 'info', titlePrefix: 'Imported' },
  downloadFailed: {
    activityType: 'download_failed',
    severity: 'error',
    titlePrefix: 'Download Failed',
  },
  bookImportIncomplete: {
    activityType: 'import_failed',
    severity: 'warn',
    titlePrefix: 'Import Incomplete',
  },
  bookFileDeleted: { activityType: 'deleted', severity: 'info', titlePrefix: 'Deleted' },
  bookFileRenamed: { activityType: 'renamed', severity: 'info', titlePrefix: 'Renamed' },
  bookFileRetagged: { activityType: 'renamed', severity: 'info', titlePrefix: 'Retagged' },
  downloadIgnored: {
    activityType: 'download_failed',
    severity: 'warn',
    titlePrefix: 'Download Ignored',
  },
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
  override getLogFileConfig(): LogFileConfig {
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
    const eventTypeName = this.resolveEventTypeName(readarrRecord.eventType);
    const mapping = READARR_EVENT_MAP[eventTypeName];

    const authorName = readarrRecord.author?.authorName ?? 'Unknown Author';
    const bookTitle = readarrRecord.book?.title ?? '';
    const label = bookTitle !== '' ? `${authorName} - ${bookTitle}` : authorName;
    const message = readarrRecord.data?.['message']?.toString();

    let title: string;
    let description: string;

    switch (mapping?.activityType) {
      case 'grab':
        title = `Grabbed: ${label}`;
        description = `Release grabbed: ${readarrRecord.sourceTitle}`;
        break;
      case 'import_complete':
        title = `Imported: ${label}`;
        description =
          bookTitle !== '' ? `"${bookTitle}" imported successfully` : 'Book imported successfully';
        break;
      case 'download_failed':
        title = `${mapping.titlePrefix}: ${label}`;
        description =
          message ??
          (eventTypeName === 'downloadIgnored'
            ? `Download ignored: ${readarrRecord.sourceTitle}`
            : `Failed to download: ${readarrRecord.sourceTitle}`);
        break;
      case 'import_failed':
        title = `${mapping.titlePrefix}: ${label}`;
        description = message ?? `Import incomplete: ${readarrRecord.sourceTitle}`;
        break;
      case 'deleted':
        title = `Deleted: ${label}`;
        description = bookTitle !== '' ? `"${bookTitle}" was deleted` : 'Book file was deleted';
        break;
      case 'renamed':
        title = `${mapping.titlePrefix}: ${label}`;
        description =
          eventTypeName === 'bookFileRetagged'
            ? bookTitle !== ''
              ? `"${bookTitle}" was retagged`
              : 'Book file was retagged'
            : bookTitle !== ''
              ? `"${bookTitle}" was renamed`
              : 'Book file was renamed';
        break;
      default:
        title = `${eventTypeName}: ${label}`;
        description = readarrRecord.sourceTitle;
    }

    return {
      id: `readarr-history-${readarrRecord.id}`,
      type: eventTypeName,
      name: title,
      overview: description,
      severity: mapping?.severity ?? (/fail/i.test(eventTypeName) ? 'error' : 'info'),
      timestamp: new Date(readarrRecord.date),
      itemId: readarrRecord.bookId?.toString(),
      metadata: {
        authorId: readarrRecord.authorId,
        bookId: readarrRecord.bookId,
        quality: readarrRecord.quality?.quality?.name,
        downloadId: readarrRecord.downloadId,
        indexer: readarrRecord.data?.['indexer'],
        downloadClient: readarrRecord.data?.['downloadClient'],
      },
    };
  }

  /**
   * Resolve the history event name. Readarr v1 returns camelCase strings, but
   * numeric (or numeric string) enum values are tolerated. Numbers outside the
   * enum (e.g. 2, which Readarr does not define) resolve to 'unknown'; other
   * strings are kept as-is.
   */
  private resolveEventTypeName(eventType: unknown): string {
    if (typeof eventType === 'number') {
      return ReadarrEventTypeNames[eventType] ?? 'unknown';
    }
    if (typeof eventType !== 'string' || eventType === '') {
      return 'unknown';
    }
    if (/^\d+$/.test(eventType)) {
      return ReadarrEventTypeNames[Number(eventType)] ?? 'unknown';
    }
    return eventType;
  }
}
