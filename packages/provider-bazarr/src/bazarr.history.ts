/**
 * Reads Bazarr's newest-first history (`start`/`length` paging) so that a sync cursor can
 * safely advance, without any state kept between polls.
 *
 * Reading head-first is only correct while the whole backlog fits into one poll: when it does
 * not, the head is re-read forever and the older tail is never reached. Instead the reader
 * locates the cutoff (first row older than it) by probing, then reads backwards from there,
 * oldest to newest. If the page cap is hit, the rows fetched are the OLDEST ones above the
 * cutoff and the cursor may advance up to the newest of them, so every poll makes progress
 * until the backlog is caught up.
 */

/** Rows per history request */
export const HISTORY_PAGE_SIZE = 50;
/** Safety cap on pages read per source per poll (40 x 50 = 2000 rows) */
export const HISTORY_MAX_PAGES = 40;
/** Rows re-read beyond the boundary of each page, to absorb rows inserted at the head mid-read */
export const HISTORY_OVERLAP = 10;
/** How many times the overlap is doubled when the previous page's edge row cannot be found */
export const HISTORY_MAX_OVERLAP_RETRIES = 3;
/** Budget for single-row probes used to locate boundaries, per source per poll */
export const HISTORY_MAX_PROBES = 64;
/** Pages read head-first when timestamps cannot be trusted */
export const HISTORY_FALLBACK_PAGES = 3;

/**
 * - `complete`: everything newer than the cutoff was read; the cursor may advance to the newest row.
 * - `capped`: the page cap was hit; rows are the oldest ones above the cutoff and the cursor may
 *   only advance to `edge` (the newest row read with certainty).
 * - `unsafe`: timestamps were unreadable or the read could not be verified; rows are returned
 *   (they are deduplicated by id) but nothing may move the cursor.
 */
export type HistoryReadMode = 'complete' | 'capped' | 'unsafe';

export interface HistoryRead<T> {
  readonly rows: readonly T[];
  readonly mode: HistoryReadMode;
  /** Newest row read with certainty when `mode` is `capped` */
  readonly edge?: T;
}

export interface HistoryReaderOptions<T> {
  /** GET history with `length`/`start` (newest first) */
  fetchPage: (length: number, start: number) => Promise<readonly T[]>;
  /** Stable identity of a row (equal rows may collapse) */
  keyOf: (record: T) => string;
  /** Provisional absolute time of a row, undefined when it cannot be read unambiguously */
  timeOf: (record: T) => Date | undefined;
  /** Rows older than this (epoch ms) are not needed */
  cutoffMs: number;
  /** Persisted cursor (epoch ms): rows at or after it are the ones that must not be missed */
  sinceMs?: number | undefined;
  warn: (message: string) => void;
  /** Override the probe budget (tests) */
  maxProbes?: number;
}

type Probe = 'past' | 'below' | 'above' | 'unknown';

export async function readHistory<T>(options: HistoryReaderOptions<T>): Promise<HistoryRead<T>> {
  const { fetchPage, keyOf, timeOf, cutoffMs, sinceMs, warn } = options;
  const maxProbes = options.maxProbes ?? HISTORY_MAX_PROBES;
  let probes = 0;

  const times = (records: readonly T[]): number[] =>
    records.flatMap((record) => {
      const time = timeOf(record);
      return time !== undefined ? [time.getTime()] : [];
    });

  /** Head-first read for when timestamps cannot be trusted: nothing may move the cursor */
  const fallback = async (first: readonly T[], reason: string): Promise<HistoryRead<T>> => {
    warn(`${reason}; reading the latest ${HISTORY_FALLBACK_PAGES} pages without moving the cursor`);
    const rows = [...first];
    for (
      let page = 1;
      page < HISTORY_FALLBACK_PAGES && rows.length === page * HISTORY_PAGE_SIZE;
      page++
    ) {
      const next = await fetchPage(HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);
      rows.push(...next);
      if (next.length < HISTORY_PAGE_SIZE) break;
    }
    return { rows, mode: 'unsafe' };
  };

  /** Compare the row at `index` with `limit` (epoch ms) */
  const probe = async (index: number, limit: number): Promise<Probe> => {
    probes++;
    const [row] = await fetchPage(1, index);
    if (row === undefined) return 'past';
    const time = timeOf(row);
    if (time === undefined) return 'unknown';
    return time.getTime() < limit ? 'below' : 'above';
  };

  /**
   * First index whose row does not exist or is older than `limit`.
   * `lo` is an index known to hold a row at/after `limit` (-1 = virtual), `hi` one known not to.
   */
  const findBoundary = async (
    limit: number,
    lo: number,
    hi?: number
  ): Promise<number | undefined> => {
    let low = lo;
    let high = hi;

    while (high === undefined) {
      const index = 2 * (low + 1);
      if (probes >= maxProbes) return undefined;
      const result = await probe(index, limit);
      if (result === 'unknown') return undefined;
      if (result === 'above') low = index;
      else high = index;
    }

    while (high - low > 1) {
      if (probes >= maxProbes) return undefined;
      const mid = Math.floor((low + high) / 2);
      const result = await probe(mid, limit);
      if (result === 'unknown') return undefined;
      if (result === 'above') low = mid;
      else high = mid;
    }

    return high;
  };

  // 1. Head page: usually all that is needed.
  const head = await fetchPage(HISTORY_PAGE_SIZE, 0);
  if (head.length < HISTORY_PAGE_SIZE) {
    return { rows: head, mode: 'complete' };
  }
  const headTimes = times(head);
  if (headTimes.length === 0) {
    return fallback(head, 'Could not read any history timestamp');
  }
  if (Math.min(...headTimes) < cutoffMs) {
    return { rows: head, mode: 'complete' };
  }

  // 2. The backlog is deeper than one page: locate the cutoff.
  const cutoffIndex = await findBoundary(cutoffMs, HISTORY_PAGE_SIZE - 1);
  if (cutoffIndex === undefined) {
    return fallback(head, 'Could not locate the history cutoff');
  }

  const capacity = HISTORY_MAX_PAGES * HISTORY_PAGE_SIZE;
  let readFrom = cutoffIndex; // exclusive upper bound of the region to read
  if (sinceMs !== undefined && cutoffIndex > capacity) {
    // The margin region alone may exceed one poll's capacity. Make sure the window still
    // reaches the rows at/after the cursor, otherwise the cursor could never advance.
    const sinceIndex = await findBoundary(sinceMs, -1, cutoffIndex);
    if (sinceIndex === undefined) {
      return fallback(head, 'Could not locate the history cursor');
    }
    // Keep half a poll of margin before the cursor, so each capped poll gains >= capacity / 2 rows.
    readFrom = Math.min(cutoffIndex, sinceIndex + capacity / 2);
  }

  // 3. Read backwards (oldest -> newest), each page overlapping the previous one.
  const rows = new Map<string, T>();
  let end = readFrom;
  let edge: T | undefined;
  let edgeKey: string | undefined;
  let pages = 0;
  let verified = true;

  while (end > 0 && pages < HISTORY_MAX_PAGES) {
    const start = Math.max(0, end - HISTORY_PAGE_SIZE);
    let list: readonly T[] = [];
    let found = false;

    for (let attempt = 0; attempt <= HISTORY_MAX_OVERLAP_RETRIES && !found; attempt++) {
      const overlap = HISTORY_OVERLAP * 2 ** attempt;
      const length = end + overlap - start;
      list = await fetchPage(length, start);

      if (edgeKey === undefined) {
        // Oldest page: confirm it really passes the cutoff (rows may have shifted meanwhile)
        const last = list[list.length - 1];
        const lastTime = last !== undefined ? timeOf(last) : undefined;
        found =
          list.length < length ||
          (readFrom < cutoffIndex && attempt === 0) ||
          (lastTime !== undefined && lastTime.getTime() < cutoffMs);
      } else {
        found = list.some((row) => keyOf(row) === edgeKey);
      }
    }

    if (!found) {
      verified = false;
      break;
    }

    for (const row of list) rows.set(keyOf(row), row);
    const newest = list[0];
    if (newest === undefined) {
      verified = false;
      break;
    }
    edge = newest;
    edgeKey = keyOf(newest);
    end = start;
    pages++;
  }

  if (!verified || edge === undefined) {
    if (edge === undefined) {
      // Nothing could be verified at all
      return { rows: [...rows.values()], mode: 'unsafe' };
    }
    warn('History changed while it was being read; stopped at the last verified page');
    return { rows: [...rows.values()], mode: 'capped', edge };
  }

  if (end > 0) {
    warn(
      `History paging stopped after ${HISTORY_MAX_PAGES} pages; newer events are picked up on the next polls`
    );
    return { rows: [...rows.values()], mode: 'capped', edge };
  }

  return { rows: [...rows.values()], mode: 'complete' };
}
