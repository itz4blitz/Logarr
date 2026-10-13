import { describe, it, expect } from 'vitest';

import { chunkRows, dedupeAndSortBatch, maxRowsPerStatement, PG_MAX_PARAMETERS } from './log-batch';

const row = (serverId: string, deduplicationKey: string, extra = '') => ({
  serverId,
  deduplicationKey,
  extra,
});

describe('dedupeAndSortBatch', () => {
  it('sorts by serverId then deduplicationKey', () => {
    const out = dedupeAndSortBatch([row('b', 'k1'), row('a', 'k2'), row('a', 'k1')]);
    expect(out.map((r) => `${r.serverId}:${r.deduplicationKey}`)).toEqual(['a:k1', 'a:k2', 'b:k1']);
  });

  it('removes duplicates within a batch keeping the first occurrence', () => {
    const out = dedupeAndSortBatch([row('a', 'k1', 'first'), row('a', 'k1', 'second')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.extra).toBe('first');
  });

  it('keeps same key on different servers', () => {
    expect(dedupeAndSortBatch([row('a', 'k'), row('b', 'k')])).toHaveLength(2);
  });

  it('produces the same order regardless of input order (lock-order invariant)', () => {
    const keys = ['2024:b', '2024:a', '2025:z', '2023:m', '2024:B'];
    const forward = dedupeAndSortBatch(keys.map((k) => row('s', k)));
    const reversed = dedupeAndSortBatch([...keys].reverse().map((k) => row('s', k)));
    expect(reversed.map((r) => r.deduplicationKey)).toEqual(forward.map((r) => r.deduplicationKey));
  });

  it('does not mutate its input', () => {
    const input = [row('b', 'k'), row('a', 'k')];
    dedupeAndSortBatch(input);
    expect(input[0]!.serverId).toBe('b');
  });
});

describe('maxRowsPerStatement', () => {
  it('keeps rows * columns under the Postgres parameter limit with a margin', () => {
    for (const cols of [1, 5, 18, 19, 25, 100, 70000]) {
      const rows = maxRowsPerStatement(cols);
      expect(rows).toBeGreaterThanOrEqual(1);
      expect(rows * cols).toBeLessThanOrEqual(Math.max(cols, PG_MAX_PARAMETERS * 0.9));
    }
  });

  it('computes the expected value for the 18-column log_entries insert', () => {
    expect(maxRowsPerStatement(18)).toBe(Math.floor((65534 * 0.9) / 18)); // 3276
  });

  it('never returns less than one row, even for degenerate input', () => {
    expect(maxRowsPerStatement(0)).toBeGreaterThanOrEqual(1);
    expect(maxRowsPerStatement(1_000_000)).toBe(1);
  });
});

describe('chunkRows', () => {
  it('splits into consecutive bounded chunks preserving order', () => {
    const chunks = chunkRows([1, 2, 3, 4, 5, 6, 7], 3);
    expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('returns no chunks for empty input', () => {
    expect(chunkRows([], 3)).toEqual([]);
  });
});
