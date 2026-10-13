import { describe, expect, it, vi } from 'vitest';

import {
  HISTORY_MAX_PAGES,
  HISTORY_OVERLAP,
  HISTORY_PAGE_SIZE,
  readHistory,
} from './bazarr.history.js';

import type { HistoryRead } from './bazarr.history.js';

interface Row {
  key: string;
  time: number | undefined;
}

/** Newest-first rows: row `n` (0 = newest) happened at `total - n` minutes */
function makeRows(total: number): Row[] {
  return Array.from({ length: total }, (_, n) => ({ key: `r${total - n}`, time: total - n }));
}

class Fake {
  requests: { length: number; start: number }[] = [];
  onRequest?: (count: number) => void;
  constructor(public rows: Row[]) {}

  fetchPage = (length: number, start: number): Promise<readonly Row[]> => {
    this.requests.push({ length, start });
    this.onRequest?.(this.requests.length);
    return Promise.resolve(this.rows.slice(start, start + length));
  };

  prepend(count: number): void {
    const newest = Number(this.rows[0]?.key.slice(1) ?? 0);
    for (let i = 1; i <= count; i++) this.rows.unshift({ key: `r${newest + i}`, time: newest + i });
  }
}

function read(
  fake: Fake,
  options: { cutoff: number; since?: number; maxProbes?: number; warn?: (m: string) => void }
): Promise<HistoryRead<Row>> {
  return readHistory<Row>({
    fetchPage: fake.fetchPage,
    keyOf: (r) => r.key,
    timeOf: (r) => (r.time === undefined ? undefined : new Date(r.time)),
    cutoffMs: options.cutoff,
    sinceMs: options.since,
    warn: options.warn ?? (() => {}),
    ...(options.maxProbes !== undefined ? { maxProbes: options.maxProbes } : {}),
  });
}

describe('readHistory', () => {
  it('returns a short history in one request', async () => {
    const fake = new Fake(makeRows(20));
    const result = await read(fake, { cutoff: 0 });

    expect(result.mode).toBe('complete');
    expect(result.rows).toHaveLength(20);
    expect(fake.requests).toHaveLength(1);
  });

  it('reads a deep history completely, oldest page first, without duplicates', async () => {
    const fake = new Fake(makeRows(430));
    const result = await read(fake, { cutoff: 0 });

    expect(result.mode).toBe('complete');
    expect(new Set(result.rows.map((r) => r.key)).size).toBe(430);
    // after the head page and the probes, pages are read from the old end towards the head
    const pages = fake.requests.filter((r) => (r.length > 1 && r.start !== 0) || r.length > 50);
    const starts = pages.map((r) => r.start);
    expect([...starts].sort((a, b) => b - a)).toEqual(starts);
  });

  it('reads only rows at or after the cutoff', async () => {
    const fake = new Fake(makeRows(430));
    const result = await read(fake, { cutoff: 201 }); // keeps times 201..430

    const kept = result.rows.filter((r) => (r.time ?? 0) >= 201);
    expect(kept).toHaveLength(230);
    expect(result.mode).toBe('complete');
  });

  it('when capped, returns the OLDEST rows above the cutoff and an edge to advance the cursor to', async () => {
    const warn = vi.fn();
    const total = HISTORY_MAX_PAGES * HISTORY_PAGE_SIZE + 700;
    const fake = new Fake(makeRows(total));
    const result = await read(fake, { cutoff: 0, warn });

    expect(result.mode).toBe('capped');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('History paging stopped'));
    // 700 newest rows are left for the following polls
    const times = result.rows.map((r) => r.time ?? 0);
    expect(Math.min(...times)).toBe(1);
    expect(Math.max(...times)).toBe(2000);
    expect(result.edge?.time).toBe(2000);
  });

  it('successive capped reads covering a moving cursor reach the head', async () => {
    const total = 5000;
    const fake = new Fake(makeRows(total));
    let since: number | undefined;
    const seen = new Set<string>();

    for (let poll = 0; poll < 10; poll++) {
      const result = await read(fake, {
        cutoff: since === undefined ? 0 : since - 1440,
        ...(since !== undefined ? { since } : {}),
        warn: () => {},
      });
      for (const row of result.rows) seen.add(row.key);
      if (result.mode === 'complete') {
        since = Math.max(...result.rows.map((r) => r.time ?? 0));
        break;
      }
      since = result.edge?.time;
    }

    expect(since).toBe(total);
    expect(seen.size).toBe(total);
  });

  it('absorbs rows inserted at the head while it reads (overlap)', async () => {
    const fake = new Fake(makeRows(500));
    fake.onRequest = (count) => {
      if (count === 6 || count === 8) fake.prepend(4);
    };
    const result = await read(fake, { cutoff: 0 });
    const keys = new Set(result.rows.map((r) => r.key));

    expect(result.mode).toBe('complete');
    for (let n = 1; n <= 500; n++) expect(keys.has(`r${n}`)).toBe(true);
  });

  it('widens the overlap when more rows than the overlap were inserted', async () => {
    const fake = new Fake(makeRows(500));
    fake.onRequest = (count) => {
      if (count === 7) fake.prepend(HISTORY_OVERLAP + 5);
    };
    const result = await read(fake, { cutoff: 0 });
    const keys = new Set(result.rows.map((r) => r.key));

    expect(result.mode).toBe('complete');
    for (let n = 1; n <= 500; n++) expect(keys.has(`r${n}`)).toBe(true);
  });

  it('stops at the last verified page when the history shifts beyond what it can verify', async () => {
    const warn = vi.fn();
    const fake = new Fake(makeRows(800));
    fake.onRequest = (count) => {
      if (count > 8 && count % 2 === 0) fake.prepend(500);
    };
    const result = await read(fake, { cutoff: 0, warn });

    expect(['capped', 'unsafe']).toContain(result.mode);
    if (result.mode === 'capped') {
      expect(result.edge).toBeDefined();
      expect(warn).toHaveBeenCalled();
    }
  });

  it('falls back head-first, off the cursor, when the probe budget is exceeded', async () => {
    const warn = vi.fn();
    const fake = new Fake(makeRows(5000));
    const result = await read(fake, { cutoff: 0, maxProbes: 3, warn });

    expect(result.mode).toBe('unsafe');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not locate'));
    expect(fake.requests.filter((r) => r.length === 1)).toHaveLength(3);
  });

  it('falls back when a probed row has no readable time', async () => {
    const warn = vi.fn();
    const rows = makeRows(500).map((r, n) => (n === 100 ? { ...r, time: undefined } : r));
    const result = await read(new Fake(rows), { cutoff: 0, warn });

    expect(result.mode).toBe('unsafe');
  });

  it('uses a bounded number of probe requests on a very deep history', async () => {
    const fake = new Fake(makeRows(200000));
    // generate lazily would be better, but 200k tiny objects are fine
    const result = await read(fake, { cutoff: 100000, since: 190000 });

    expect(result.mode).toBe('capped');
    const probes = fake.requests.filter((r) => r.length === 1);
    expect(probes.length).toBeLessThanOrEqual(64);
  });

  it('reads at least half a poll of rows at or after the cursor when the margin is huge', async () => {
    const fake = new Fake(makeRows(20000));
    // cursor in the middle of a 10000-row margin region
    const result = await read(fake, { cutoff: 10001, since: 15001, warn: () => {} });

    expect(result.mode).toBe('capped');
    expect(result.edge?.time ?? 0).toBeGreaterThan(15001);
  });
});
