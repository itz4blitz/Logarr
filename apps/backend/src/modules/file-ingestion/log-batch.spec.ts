import { describe, it, expect } from 'vitest';

import { dedupeAndSortBatch } from './log-batch';

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
