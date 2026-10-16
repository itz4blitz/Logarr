import { describe, expect, it } from 'vitest';

import { computeSyncCursor } from './sync-cursor';

import type { NormalizedActivity } from '@logarr/core';

const act = (iso: string, advancesSyncCursor?: boolean): NormalizedActivity => ({
  id: iso,
  type: 't',
  name: 'n',
  severity: 'info',
  timestamp: new Date(iso),
  ...(advancesSyncCursor === undefined ? {} : { advancesSyncCursor }),
});

describe('computeSyncCursor', () => {
  it('uses the max timestamp of event-time rows, ignoring synthetic rows', () => {
    const result = computeSyncCursor([
      act('2026-01-01T00:00:00Z'),
      act('2026-01-03T00:00:00Z', true),
      act('2026-01-02T00:00:00Z'),
      act('2026-06-01T00:00:00Z', false),
    ]);
    expect(result).toEqual(new Date('2026-01-03T00:00:00Z'));
  });

  it('returns undefined when all rows are synthetic', () => {
    expect(
      computeSyncCursor([act('2026-06-01T00:00:00Z', false), act('2026-06-02T00:00:00Z', false)])
    ).toBeUndefined();
  });

  it('returns undefined for an empty batch', () => {
    expect(computeSyncCursor([])).toBeUndefined();
  });
});
