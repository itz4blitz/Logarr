import { vi } from 'vitest';

type ChainableQuery = {
  from: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  having: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
  onConflictDoNothing: ReturnType<typeof vi.fn>;
  onConflictDoUpdate: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  values: ReturnType<typeof vi.fn>;
  then: ReturnType<typeof vi.fn>;
  [Symbol.toStringTag]: string;
};

/**
 * Creates a chainable mock query that can be awaited
 */
function createChainableQuery(resolvedValue: unknown = []): ChainableQuery {
  const query: Partial<ChainableQuery> = {};

  // All chainable methods return the same query object
  const chainMethods = [
    'from', 'where', 'leftJoin', 'innerJoin', 'orderBy',
    'limit', 'offset', 'groupBy', 'having', 'returning',
    'onConflictDoNothing', 'onConflictDoUpdate', 'set', 'values'
  ] as const;

  for (const method of chainMethods) {
    query[method] = vi.fn().mockReturnValue(query);
  }

  // Make it awaitable
  query.then = vi.fn().mockImplementation((resolve) => Promise.resolve(resolvedValue).then(resolve));
  query[Symbol.toStringTag] = 'Promise';

  return query as ChainableQuery;
}

export type MockDb = {
  select: ReturnType<typeof vi.fn>;
  selectDistinct: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  query: Record<string, unknown>;
  $with: ReturnType<typeof vi.fn>;
  with: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  _mockResults: Map<string, unknown>;
  _setResult: (operation: string, result: unknown) => void;
};

/**
 * Creates a mock Drizzle database instance for testing.
 * Use this to mock DATABASE_CONNECTION in service tests.
 */
export function createMockDb(): MockDb {
  const mockResults = new Map<string, unknown>();

  const createMockOperation = (opName: string) => {
    return vi.fn().mockImplementation(() => {
      const result = mockResults.get(opName) ?? [];
      return createChainableQuery(result);
    });
  };

  const mockDb: MockDb = {
    select: createMockOperation('select'),
    selectDistinct: createMockOperation('selectDistinct'),
    insert: createMockOperation('insert'),
    update: createMockOperation('update'),
    delete: createMockOperation('delete'),
    query: {},
    $with: vi.fn(),
    with: vi.fn().mockImplementation(() => createChainableQuery([])),
    transaction: vi.fn().mockImplementation(async (fn) => fn(mockDb)),
    _mockResults: mockResults,
    _setResult: (operation: string, result: unknown) => {
      mockResults.set(operation, result);
    },
  };

  return mockDb;
}

/**
 * Helper to configure mock database to return specific results for operations
 */
export function configureMockDb(mockDb: MockDb, config: {
  select?: unknown;
  selectDistinct?: unknown;
  insert?: unknown;
  update?: unknown;
  delete?: unknown;
}) {
  if (config.select !== undefined) mockDb._setResult('select', config.select);
  if (config.selectDistinct !== undefined) mockDb._setResult('selectDistinct', config.selectDistinct);
  if (config.insert !== undefined) mockDb._setResult('insert', config.insert);
  if (config.update !== undefined) mockDb._setResult('update', config.update);
  if (config.delete !== undefined) mockDb._setResult('delete', config.delete);
}
