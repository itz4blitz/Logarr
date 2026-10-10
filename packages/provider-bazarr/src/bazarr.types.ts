/**
 * Bazarr API types.
 *
 * Shapes are derived from Bazarr's flask-restx models (morpheus65535/bazarr).
 * Every field except identifiers is optional because the API is not strictly
 * versioned and the history endpoints in particular vary between releases.
 */

/** Bazarr wraps every JSON response in a `data` envelope */
export interface BazarrEnvelope<T> {
  readonly data: T;
  readonly total?: number;
}

/** GET /api/system/status */
export interface BazarrSystemStatus {
  bazarr_version: string;
  sonarr_version?: string;
  radarr_version?: string;
  operating_system?: string;
  python_version?: string;
  bazarr_config_directory?: string;
  timezone?: string;
  start_time?: number;
  [key: string]: unknown;
}

/** Subtitle language as returned in history records */
export interface BazarrLanguage {
  name?: string;
  code2?: string;
  code3?: string;
  forced?: boolean;
  hi?: boolean;
}

/** Fields shared by episode and movie history records */
export interface BazarrHistoryBase {
  /**
   * Row id. NOTE: Bazarr's marshalling model does not currently expose it, so it is
   * normally absent and a stable hash of the record is used instead.
   */
  id?: number;
  /** Humanised timestamp ("2 hours ago") - not parseable */
  timestamp?: string;
  /** Server-locale `%x %X` formatted timestamp, e.g. "10/10/26 12:00:01" */
  parsed_timestamp?: string;
  description?: string;
  action?: number;
  provider?: string | null;
  score?: string | number | null;
  language?: BazarrLanguage | null;
  subs_id?: string | null;
  subtitles_path?: string | null;
  blacklisted?: boolean;
  upgradable?: boolean;
}

/** GET /api/episodes/history record */
export interface BazarrEpisodeHistory extends BazarrHistoryBase {
  seriesTitle?: string;
  episode_number?: string;
  episodeTitle?: string;
  sonarrSeriesId?: number;
  sonarrEpisodeId?: number;
}

/** GET /api/movies/history record */
export interface BazarrMovieHistory extends BazarrHistoryBase {
  title?: string;
  radarrId?: number;
}

/** GET /api/system/health item */
export interface BazarrHealthIssue {
  object: string;
  issue: string;
}

/** GET /api/system/jobs item */
export interface BazarrJob {
  job_id: number | string;
  job_name: string;
  status: string;
  last_run_time?: string | null;
  is_progress?: boolean;
  progress_value?: number;
  progress_max?: number;
  progress_message?: string | null;
}

/**
 * History `action` codes, verified against the `history_log(...)` call sites in
 * Bazarr's source (subtitles/wanted, manual, upgrade, upload, tools/subsyncer,
 * tools/delete, tools/translate).
 */
export const BazarrHistoryActions: Readonly<Record<number, string>> = {
  0: 'delete',
  1: 'download',
  2: 'manual',
  3: 'upgrade',
  4: 'upload',
  5: 'sync',
  6: 'translated',
};
