import { describe, it, expect } from 'vitest';

import { ArrBaseProvider } from './arr.provider.js';

import type { ArrHealthCheck, ArrHistoryRecordBase, ArrQueueItemBase } from './arr.types.js';
import type { NormalizedActivity } from '@logarr/core';

class TestArrProvider extends ArrBaseProvider {
  readonly id = 'test';
  readonly name = 'Test';
  protected getHistoryRecords(): Promise<readonly ArrHistoryRecordBase[]> {
    return Promise.resolve([]);
  }
  protected normalizeHistoryRecord(): NormalizedActivity {
    throw new Error('not used');
  }
  protected getMediaType(): 'series' {
    return 'series';
  }
  health(checks: readonly ArrHealthCheck[]): NormalizedActivity[] {
    return this.normalizeHealthChecks(checks);
  }
  queue(items: readonly ArrQueueItemBase[]): NormalizedActivity[] {
    return this.normalizeQueueItems(items);
  }
}

describe('ArrBaseProvider synthetic activities', () => {
  it('flags health activities as not advancing the sync cursor', () => {
    const result = new TestArrProvider().health([
      { source: 'IndexerCheck', type: 'warning', message: 'm', wikiUrl: '' },
    ] as unknown as ArrHealthCheck[]);
    expect(result).toHaveLength(1);
    expect(result[0]!.advancesSyncCursor).toBe(false);
  });

  it('flags queue activities as not advancing the sync cursor', () => {
    const result = new TestArrProvider().queue([
      {
        title: 'x',
        downloadId: 'd1',
        trackedDownloadStatus: 'warning',
        errorMessage: 'bad',
        statusMessages: [],
      },
    ] as unknown as ArrQueueItemBase[]);
    expect(result).toHaveLength(1);
    expect(result[0]!.advancesSyncCursor).toBe(false);
  });
});
