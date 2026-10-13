/**
 * Tests for the shared ArrBaseProvider activity normalisation
 */

import { describe, expect, it } from 'vitest';

import { ArrBaseProvider } from './arr.provider.js';

import type { ArrHealthCheck, ArrHistoryRecordBase, ArrQueueItemBase } from './arr.types.js';
import type { NormalizedActivity } from '@logarr/core';

class TestArrProvider extends ArrBaseProvider {
  readonly id = 'testarr';
  readonly name = 'TestArr';

  protected getHistoryRecords(): Promise<readonly ArrHistoryRecordBase[]> {
    return Promise.resolve([]);
  }

  protected normalizeHistoryRecord(): NormalizedActivity {
    throw new Error('not used');
  }

  protected getMediaType(): 'book' {
    return 'book';
  }

  health(checks: readonly ArrHealthCheck[]): NormalizedActivity[] {
    return this.normalizeHealthChecks(checks);
  }

  queue(items: readonly ArrQueueItemBase[]): NormalizedActivity[] {
    return this.normalizeQueueItems(items);
  }
}

function check(overrides: Partial<ArrHealthCheck> = {}): ArrHealthCheck {
  return { source: 'MetadataCheck', type: 'error', message: 'BookInfo unreachable', ...overrides };
}

function queueItem(overrides: Partial<ArrQueueItemBase> = {}): ArrQueueItemBase {
  return {
    id: 5,
    title: 'Dune',
    downloadId: 'ABC123',
    trackedDownloadStatus: 'warning',
    trackedDownloadState: 'importPending',
    statusMessages: [{ title: 't', messages: ['No files found'] }],
    ...overrides,
  } as ArrQueueItemBase;
}

describe('ArrBaseProvider.normalizeHealthChecks ids', () => {
  const provider = new TestArrProvider();

  it('gives the same id for the same standing check across polls', async () => {
    const first = provider.health([check()]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = provider.health([check()]);

    expect(first[0]?.id).toBe(second[0]?.id);
    expect(first[0]?.id).toMatch(/^testarr-health-[0-9a-f]{16}$/);
  });

  it('gives different ids for different message, source or severity', () => {
    const base = provider.health([check()])[0]?.id;

    expect(provider.health([check({ message: 'other' })])[0]?.id).not.toBe(base);
    expect(provider.health([check({ source: 'Other' })])[0]?.id).not.toBe(base);
    expect(provider.health([check({ type: 'warning' })])[0]?.id).not.toBe(base);
  });

  it('still skips ok/notice checks and keeps a current timestamp', () => {
    const before = Date.now();
    const result = provider.health([check({ type: 'ok' }), check({ type: 'notice' }), check()]);

    expect(result).toHaveLength(1);
    expect(result[0]?.timestamp.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('ArrBaseProvider.normalizeQueueItems ids', () => {
  const provider = new TestArrProvider();

  it('gives the same id for the same queue warning state across polls', async () => {
    const first = provider.queue([queueItem()]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = provider.queue([queueItem()]);

    expect(first[0]?.id).toBe(second[0]?.id);
    expect(first[0]?.id).toMatch(/^testarr-queue-5-warning-importPending-[0-9a-f]{16}$/);
  });

  it('gives different ids for a different queue item, state or message', () => {
    const base = provider.queue([queueItem()])[0]?.id;

    expect(provider.queue([queueItem({ id: 6 })])[0]?.id).not.toBe(base);
    expect(provider.queue([queueItem({ trackedDownloadState: 'importBlocked' })])[0]?.id).not.toBe(
      base
    );
    expect(
      provider.queue([queueItem({ statusMessages: [{ title: 't', messages: ['Other'] }] })])[0]?.id
    ).not.toBe(base);
  });

  it('uses the error message and ignores items without a warning', () => {
    const result = provider.queue([
      queueItem({ trackedDownloadStatus: 'ok' }),
      queueItem({ id: 9, trackedDownloadStatus: 'ok', errorMessage: 'Disk full' }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.overview).toBe('Disk full');
  });
});
