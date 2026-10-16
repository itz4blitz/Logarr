import type * as schema from '../../database/schema';

export type ServerRow = typeof schema.servers.$inferSelect;

/** A server as returned by the API: the stored secret is never included */
export type ServerResponse = Omit<ServerRow, 'apiKey'> & {
  /** Whether a secret (API key / token / password) is stored. The value itself is never returned. */
  hasApiKey: boolean;
};

/**
 * Map a database row to the API shape. Every server returned over HTTP must go through this
 * function so the `api_key` column (API key, token or qBittorrent WebUI password) cannot leak.
 */
export function toServerResponse(row: ServerRow): ServerResponse {
  const { apiKey, ...rest } = row;
  return { ...rest, hasApiKey: apiKey !== '' };
}
