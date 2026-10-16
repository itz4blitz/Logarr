/**
 * Type definitions for the Seerr API (also covers Overseerr and Jellyseerr)
 */

/** Paging information returned by list endpoints */
export interface SeerrPageInfo {
  pages: number;
  pageSize: number;
  results: number;
  page: number;
}

/** Paged list envelope returned by /request and /issue */
export interface SeerrPaged<T> {
  pageInfo?: SeerrPageInfo;
  results: T[];
}

/** GET /settings/about (admin only) */
export interface SeerrAbout {
  version: string;
  totalRequests?: number;
  totalMediaItems?: number;
  tz?: string | null;
  appDataPath?: string;
}

/** Seerr user */
export interface SeerrUser {
  id: number;
  displayName?: string;
  username?: string;
  plexUsername?: string;
  jellyfinUsername?: string;
  email?: string;
}

/** Media info attached to requests and issues */
export interface SeerrMediaInfo {
  id?: number;
  tmdbId?: number;
  tvdbId?: number | null;
  mediaType?: 'movie' | 'tv';
  status?: number;
}

/** Season selection of a TV request */
export interface SeerrRequestSeason {
  id?: number;
  seasonNumber: number;
  status?: number;
}

/** Media request */
export interface SeerrRequest {
  id: number;
  status: number;
  type?: 'movie' | 'tv';
  is4k?: boolean;
  createdAt?: string;
  updatedAt?: string;
  media?: SeerrMediaInfo;
  seasons?: SeerrRequestSeason[];
  requestedBy?: SeerrUser;
  modifiedBy?: SeerrUser | string | null;
}

/** Comment on an issue */
export interface SeerrIssueComment {
  id: number;
  message: string;
  user?: SeerrUser;
  createdAt?: string;
}

/** User reported issue */
export interface SeerrIssue {
  id: number;
  issueType: number;
  status?: number;
  problemSeason?: number;
  problemEpisode?: number;
  createdAt?: string;
  updatedAt?: string;
  media?: SeerrMediaInfo;
  createdBy?: SeerrUser;
  modifiedBy?: SeerrUser;
  comments?: SeerrIssueComment[];
}

/** Request status codes (4 and 5 exist only in newer versions) */
export const SeerrRequestStatus = {
  PENDING: 1,
  APPROVED: 2,
  DECLINED: 3,
  FAILED: 4,
  COMPLETED: 5,
} as const;

/** Issue type codes */
export const SeerrIssueType = {
  VIDEO: 1,
  AUDIO: 2,
  SUBTITLES: 3,
  OTHER: 4,
} as const;

/** Issue status codes */
export const SeerrIssueStatus = {
  OPEN: 1,
  RESOLVED: 2,
} as const;
