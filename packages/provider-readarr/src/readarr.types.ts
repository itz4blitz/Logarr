/**
 * Readarr-specific API types
 *
 * Readarr is the *arr application for books, audiobooks and comics. It was
 * retired upstream in June 2025 (last release v0.4.18); these types describe
 * the v1 API as shipped in that final release.
 */

import type { ArrHistoryRecordBase, ArrQueueItemBase } from '@logarr/provider-arr';

/**
 * Readarr author object (the Readarr equivalent of a Sonarr series).
 * The API returns partial objects when embedded via includeAuthor.
 */
export interface ReadarrAuthor {
  readonly id: number;
  readonly authorName: string;
  readonly authorNameLastFirst?: string;
  readonly sortName?: string;
  readonly status?: string;
  readonly overview?: string;
  readonly monitored?: boolean;
  readonly path?: string;
  readonly foreignAuthorId?: string;
  readonly titleSlug?: string;
  readonly genres?: readonly string[];
  readonly tags?: readonly number[];
  readonly added?: string;
}

/**
 * Readarr book object
 */
export interface ReadarrBook {
  readonly id: number;
  readonly authorId: number;
  readonly title: string;
  readonly seriesTitle?: string;
  readonly releaseDate?: string;
  readonly pageCount?: number;
  readonly monitored?: boolean;
  readonly foreignBookId?: string;
  readonly titleSlug?: string;
  readonly overview?: string;
}

/**
 * Readarr history record with author/book info.
 * `eventType` is a camelCase string in v1 JSON; numeric values may still arrive
 * at runtime and are handled by the provider.
 */
export interface ReadarrHistoryRecord extends ArrHistoryRecordBase {
  readonly authorId: number;
  readonly bookId: number;
  readonly author?: ReadarrAuthor;
  readonly book?: ReadarrBook;
}

/**
 * Readarr queue item with author/book info
 */
export interface ReadarrQueueItem extends ArrQueueItemBase {
  readonly authorId?: number;
  readonly bookId?: number;
  readonly author?: ReadarrAuthor;
  readonly book?: ReadarrBook;
}

/**
 * Readarr history event types (numeric values of EntityHistoryEventType).
 *
 * Value 2 is intentionally absent: Readarr's enum has no member 2
 * (Lidarr uses it for ArtistFolderImported).
 */
export const ReadarrEventTypes = {
  Unknown: 0,
  Grabbed: 1,
  BookFileImported: 3,
  DownloadFailed: 4,
  BookFileDeleted: 5,
  BookFileRenamed: 6,
  BookImportIncomplete: 7,
  DownloadImported: 8,
  BookFileRetagged: 9,
  DownloadIgnored: 10,
} as const;

/**
 * Readarr event type string mapping. Lookups for 2 or any other number
 * return undefined.
 */
export const ReadarrEventTypeNames: Record<number, string> = {
  [ReadarrEventTypes.Unknown]: 'unknown',
  [ReadarrEventTypes.Grabbed]: 'grabbed',
  [ReadarrEventTypes.BookFileImported]: 'bookFileImported',
  [ReadarrEventTypes.DownloadFailed]: 'downloadFailed',
  [ReadarrEventTypes.BookFileDeleted]: 'bookFileDeleted',
  [ReadarrEventTypes.BookFileRenamed]: 'bookFileRenamed',
  [ReadarrEventTypes.BookImportIncomplete]: 'bookImportIncomplete',
  [ReadarrEventTypes.DownloadImported]: 'downloadImported',
  [ReadarrEventTypes.BookFileRetagged]: 'bookFileRetagged',
  [ReadarrEventTypes.DownloadIgnored]: 'downloadIgnored',
};
