/**
 * Whisparr-specific API types
 *
 * Whisparr is a fork of Sonarr for adult content management.
 * It uses similar API structure with "sites" instead of "series" and "episodes" for scenes.
 */

import type { ArrHistoryRecordBase, ArrQueueItemBase } from '@logarr/provider-arr';

/**
 * Whisparr site object (similar to Sonarr series)
 */
export interface WhisparrSite {
  readonly id: number;
  readonly title: string;
  readonly sortTitle: string;
  readonly status: string;
  readonly ended: boolean;
  readonly overview: string;
  readonly network: string;
  readonly images: readonly { readonly coverType: string; readonly url: string }[];
  readonly year: number;
  readonly path: string;
  readonly qualityProfileId: number;
  readonly monitored: boolean;
  readonly runtime: number;
  readonly cleanTitle: string;
  readonly titleSlug: string;
  readonly genres: readonly string[];
  readonly tags: readonly number[];
  readonly added: string;
}

/**
 * Whisparr episode object (scene)
 */
export interface WhisparrEpisode {
  readonly id: number;
  readonly seriesId: number;
  readonly episodeFileId: number;
  readonly seasonNumber: number;
  readonly episodeNumber: number;
  readonly title: string;
  readonly airDate: string;
  readonly airDateUtc: string;
  readonly overview: string;
  readonly hasFile: boolean;
  readonly monitored: boolean;
  readonly absoluteEpisodeNumber?: number;
}

/**
 * Whisparr history record with site/episode info
 */
export interface WhisparrHistoryRecord extends ArrHistoryRecordBase {
  readonly seriesId: number;
  readonly episodeId: number;
  readonly series?: WhisparrSite;
  readonly episode?: WhisparrEpisode;
}

/**
 * Whisparr queue item with site/episode info
 */
export interface WhisparrQueueItem extends ArrQueueItemBase {
  readonly seriesId: number;
  readonly episodeId: number;
  readonly seasonNumber: number;
  readonly series?: WhisparrSite;
  readonly episode?: WhisparrEpisode;
}

/**
 * Whisparr event types (numeric values used by API)
 * Same as Sonarr since Whisparr is a fork
 */
export const WhisparrEventTypes = {
  Unknown: 0,
  Grabbed: 1,
  SeriesFolderImported: 2,
  DownloadFolderImported: 3,
  DownloadFailed: 4,
  EpisodeFileDeleted: 5,
  EpisodeFileRenamed: 6,
  ImportFailed: 7,
} as const;

/**
 * Whisparr event type string mapping
 */
export const WhisparrEventTypeNames: Record<number, string> = {
  [WhisparrEventTypes.Unknown]: 'unknown',
  [WhisparrEventTypes.Grabbed]: 'grabbed',
  [WhisparrEventTypes.SeriesFolderImported]: 'seriesFolderImported',
  [WhisparrEventTypes.DownloadFolderImported]: 'downloadFolderImported',
  [WhisparrEventTypes.DownloadFailed]: 'downloadFailed',
  [WhisparrEventTypes.EpisodeFileDeleted]: 'episodeFileDeleted',
  [WhisparrEventTypes.EpisodeFileRenamed]: 'episodeFileRenamed',
  [WhisparrEventTypes.ImportFailed]: 'importFailed',
};
