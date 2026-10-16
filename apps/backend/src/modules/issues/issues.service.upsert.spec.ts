import { Test } from '@nestjs/testing';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { AiProviderService } from '../settings/ai-provider.service';

import { AnalysisPromptBuilder } from './analysis-prompt-builder';
import { IssueContextService } from './issue-context.service';
import { IssuesService } from './issues.service';

import type { SQL } from 'drizzle-orm';

const dialect = new PgDialect();
const render = (value: unknown) => dialect.sqlToQuery(value as SQL);

/** Awaitable chain that resolves to `result`, recording nothing. */
function chain(result: unknown, extra: Record<string, unknown> = {}) {
  const q: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'values', 'set', 'returning']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  Object.assign(q, extra);
  q['then'] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

describe('IssuesService.processLogEntry concurrency semantics', () => {
  let service: IssuesService;
  const logEntry = {
    id: 'log-1',
    serverId: 'server-1',
    level: 'error',
    message: 'Connection failed to database',
    source: 'database',
    exception: null,
    timestamp: new Date('2024-03-01T10:00:00.000Z'),
    userId: 'user-1',
    sessionId: 'session-1',
  };
  const existingIssue = {
    id: 'issue-1',
    severity: 'high',
    occurrenceCount: 5,
    firstSeen: new Date('2024-02-01T00:00:00.000Z'),
    lastSeen: new Date('2024-04-01T00:00:00.000Z'),
  };

  let selectResults: unknown[][];
  let insertResults: unknown[][];
  let updateSet: ReturnType<typeof vi.fn>;
  let inTx = false;
  let opsInTx: string[];
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    selectResults = [];
    insertResults = [];
    inTx = false;
    opsInTx = [];
    mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      inTx = true;
      try {
        return await fn(mockDb);
      } finally {
        inTx = false;
      }
    });
    mockDb.select.mockImplementation(() => chain(selectResults.shift() ?? []));
    mockDb.insert.mockImplementation(() => {
      if (inTx) opsInTx.push('insert');
      const q = chain(insertResults.shift() ?? [], {
        onConflictDoNothing: vi.fn().mockImplementation(() => q),
      });
      return q;
    });
    updateSet = vi.fn();
    mockDb.update.mockImplementation(() => {
      if (inTx) opsInTx.push('update');
      const q = chain([]);
      q['set'] = updateSet.mockReturnValue(q);
      return q;
    });

    const module = await Test.createTestingModule({
      providers: [
        IssuesService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: AiProviderService, useValue: {} },
        { provide: IssueContextService, useValue: {} },
        { provide: AnalysisPromptBuilder, useValue: {} },
      ],
    }).compile();
    service = module.get(IssuesService);
  });

  it('updates an existing issue with atomic increment and GREATEST/LEAST timestamps', async () => {
    selectResults = [[existingIssue], [{ userId: 'user-1', sessionId: 'session-1' }]];
    insertResults = [[{ id: 'occ-1' }]];

    const id = await service.processLogEntry(logEntry as any);

    expect(id).toBe('issue-1');
    const set = updateSet.mock.calls[0]![0];
    const lastSeen = render(set.lastSeen);
    const firstSeen = render(set.firstSeen);
    const count = render(set.occurrenceCount);
    expect(lastSeen.sql).toMatch(/GREATEST\("issues"\."last_seen"/i);
    expect(lastSeen.params).toContain('2024-03-01T10:00:00.000Z');
    expect(firstSeen.sql).toMatch(/LEAST\("issues"\."first_seen"/i);
    expect(count.sql).toMatch(/"issues"\."occurrence_count" \+ 1/);
    // occurrence insert and counter update share one transaction
    expect(opsInTx).toEqual(['insert', 'update']);
  });

  it('does not bump counters when the occurrence was already recorded', async () => {
    selectResults = [[existingIssue]];
    insertResults = [[]]; // ON CONFLICT DO NOTHING returned no row

    const id = await service.processLogEntry(logEntry as any);

    expect(id).toBe('issue-1');
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('creates a new issue with count 0 and its first occurrence in one transaction', async () => {
    selectResults = [
      [],
      [{ providerId: 'sonarr' }],
      [{ userId: 'user-1', sessionId: 'session-1' }],
    ];
    insertResults = [
      [{ id: 'new-issue', severity: 'high', occurrenceCount: 0 }],
      [{ id: 'occ-1' }],
    ];

    const result = await service.processLogEntryDetailed(logEntry as any);

    expect(result).toEqual({ issueId: 'new-issue', created: true });
    const issueInsert = mockDb.insert.mock.results[0]!.value as Record<string, any>;
    expect(issueInsert['values'].mock.calls[0]![0]).toMatchObject({ occurrenceCount: 0 });
    expect(issueInsert['onConflictDoNothing']).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.anything() })
    );
    // issue insert, occurrence insert and the atomic count increment all inside the tx
    expect(opsInTx).toEqual(['insert', 'insert', 'update']);
    expect(render(updateSet.mock.calls[0]![0].occurrenceCount).sql).toMatch(/\+ 1/);
  });

  it('propagates a failure between statements so the transaction can roll back', async () => {
    selectResults = [[existingIssue], []];
    insertResults = [[{ id: 'occ-1' }]];
    mockDb.update.mockImplementation(() => {
      throw new Error('crash');
    });

    await expect(service.processLogEntry(logEntry as any)).rejects.toThrow('crash');
    expect(inTx).toBe(false);
  });

  it('does not touch first/last seen for an Invalid Date but still counts the occurrence', async () => {
    selectResults = [[existingIssue], []];
    insertResults = [[{ id: 'occ-1' }]];

    await service.processLogEntry({ ...logEntry, timestamp: new Date('nope') } as any);

    const set = updateSet.mock.calls[0]![0];
    expect(set.lastSeen).toBeUndefined();
    expect(set.firstSeen).toBeUndefined();
    expect(render(set.occurrenceCount).sql).toMatch(/\+ 1/);
  });

  it('reports created=false for an existing issue', async () => {
    selectResults = [[existingIssue], []];
    insertResults = [[{ id: 'occ-1' }]];

    expect(await service.processLogEntryDetailed(logEntry as any)).toEqual({
      issueId: 'issue-1',
      created: false,
    });
  });

  it('attaches to the winner when a concurrent insert created the same fingerprint', async () => {
    // 1: initial lookup (none), 2: server lookup, 3: re-select after lost race, 4: occurrences
    selectResults = [
      [],
      [{ providerId: 'sonarr' }],
      [existingIssue],
      [{ userId: 'user-1', sessionId: 'session-1' }],
    ];
    insertResults = [[] /* issue insert lost the race */, [{ id: 'occ-1' }]];

    const result = await service.processLogEntryDetailed(logEntry as any);

    expect(result).toEqual({ issueId: 'issue-1', created: false });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(render(updateSet.mock.calls[0]![0].occurrenceCount).sql).toMatch(/\+ 1/);
  });

  it('returns null when the insert lost the race but the issue cannot be found', async () => {
    selectResults = [[], [{ providerId: 'sonarr' }], []];
    insertResults = [[]];

    expect(await service.processLogEntry(logEntry as any)).toBeNull();
  });
});
