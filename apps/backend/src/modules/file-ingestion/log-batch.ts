/**
 * Prepare rows for a multi-row `INSERT ... ON CONFLICT DO NOTHING` into log_entries.
 *
 * Concurrent multi-row inserts that touch overlapping unique keys in different orders
 * deadlock on the (server_id, deduplication_key) index. Sorting every batch with the same
 * deterministic comparator makes all inserters acquire the index locks in the same order.
 * Duplicates inside a batch are removed (first occurrence wins) since they would only
 * be discarded by ON CONFLICT anyway.
 */
export function dedupeAndSortBatch<T extends { serverId: string; deduplicationKey: string }>(
  rows: readonly T[]
): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const row of rows) {
    const key = `${row.serverId}\u0000${row.deduplicationKey}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  }

  // Plain code-unit comparison (not locale aware): a consistent, deterministic order shared by
  // all inserters. It need not match the index collation, only be the same for everyone.
  return unique.sort((a, b) => {
    if (a.serverId !== b.serverId) {
      return a.serverId < b.serverId ? -1 : 1;
    }
    if (a.deduplicationKey !== b.deduplicationKey) {
      return a.deduplicationKey < b.deduplicationKey ? -1 : 1;
    }
    return 0;
  });
}

/** Postgres wire protocol limit on bind parameters per statement (16-bit count). */
export const PG_MAX_PARAMETERS = 65534;

/**
 * Maximum rows for one multi-row INSERT so it stays under the parameter limit, with a 10%
 * safety margin. `columnCount` is the number of columns (bound values) per row.
 */
export function maxRowsPerStatement(columnCount: number): number {
  const cols = Math.max(1, Math.ceil(columnCount));
  return Math.max(1, Math.floor((PG_MAX_PARAMETERS * 0.9) / cols));
}

/** Split rows into consecutive chunks of at most `size`, preserving order. */
export function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}
