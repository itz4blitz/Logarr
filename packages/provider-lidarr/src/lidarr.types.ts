/**
 * Lidarr-specific API types
 *
 * Lidarr is the *arr application for music. It uses API v1 and models
 * media as artists, albums and tracks.
 */

import type { ArrHistoryRecordBase, ArrQueueItemBase } from '@logarr/provider-arr';

/**
 * Lidarr artist object
 */
export interface LidarrArtist {
  readonly id: number;
  readonly artistName: string;
  readonly foreignArtistId?: string;
  readonly status?: string;
  readonly path?: string;
  readonly monitored?: boolean;
  readonly overview?: string;
  readonly genres?: readonly string[];
}

/**
 * Lidarr album object
 */
export interface LidarrAlbum {
  readonly id: number;
  readonly artistId: number;
  readonly title: string;
  readonly albumType?: string;
  readonly releaseDate?: string;
  readonly monitored?: boolean;
  readonly foreignAlbumId?: string;
}

/**
 * Lidarr history record with artist/album info
 *
 * NOTE: `eventType` is declared as string by the base type. Lidarr may return
 * either a camelCase string ("trackFileImported") or a number; the provider
 * accepts both.
 */
export interface LidarrHistoryRecord extends ArrHistoryRecordBase {
  readonly artistId: number;
  readonly albumId: number;
  readonly trackId?: number;
  readonly artist?: LidarrArtist;
  readonly album?: LidarrAlbum;
}

/**
 * Lidarr queue item with artist/album info
 */
export interface LidarrQueueItem extends ArrQueueItemBase {
  readonly artistId: number;
  readonly albumId: number;
  readonly artist?: LidarrArtist;
  readonly album?: LidarrAlbum;
}

/**
 * Lidarr history event types (numeric values used by the API)
 */
export const LidarrEventTypes = {
  Unknown: 0,
  Grabbed: 1,
  ArtistFolderImported: 2,
  TrackFileImported: 3,
  DownloadFailed: 4,
  TrackFileDeleted: 5,
  TrackFileRenamed: 6,
  AlbumImportIncomplete: 7,
  DownloadImported: 8,
  TrackFileRetagged: 9,
  DownloadIgnored: 10,
} as const;

/**
 * Lidarr event type string mapping (camelCase names used by the API)
 */
export const LidarrEventTypeNames: Record<number, string> = {
  [LidarrEventTypes.Unknown]: 'unknown',
  [LidarrEventTypes.Grabbed]: 'grabbed',
  [LidarrEventTypes.ArtistFolderImported]: 'artistFolderImported',
  [LidarrEventTypes.TrackFileImported]: 'trackFileImported',
  [LidarrEventTypes.DownloadFailed]: 'downloadFailed',
  [LidarrEventTypes.TrackFileDeleted]: 'trackFileDeleted',
  [LidarrEventTypes.TrackFileRenamed]: 'trackFileRenamed',
  [LidarrEventTypes.AlbumImportIncomplete]: 'albumImportIncomplete',
  [LidarrEventTypes.DownloadImported]: 'downloadImported',
  [LidarrEventTypes.TrackFileRetagged]: 'trackFileRetagged',
  [LidarrEventTypes.DownloadIgnored]: 'downloadIgnored',
};
