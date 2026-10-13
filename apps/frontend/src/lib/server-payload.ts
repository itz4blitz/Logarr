import { getIntegrationById } from '@/lib/integrations';

import type { CreateServerDto } from '@/lib/api';

/** The API key / password may be left empty (capability flag from the integration entry) */
export function areCredentialsOptional(providerId: string): boolean {
  return getIntegrationById(providerId)?.capabilities.apiKeyOptional === true;
}

/** The provider authenticates with a username plus password (capability flag) */
export function supportsUsername(providerId: string): boolean {
  return getIntegrationById(providerId)?.capabilities.supportsUsername === true;
}

/**
 * Build the create-server payload from the dynamic "add source" form values.
 * The password field is stored in apiKey (it may be empty for providers with the apiKeyOptional capability).
 */
export function buildCreateServerPayload(
  providerId: string,
  data: Record<string, unknown>
): CreateServerDto {
  const username = typeof data.username === 'string' ? data.username.trim() : '';

  return {
    name: data.name as string,
    providerId,
    url: data.url as string,
    apiKey: (data.apiKey || data.token || data.password || '') as string,
    ...(username !== '' && { username }),
    logPath: data.logPath as string | undefined,
  };
}

/**
 * Credential fields for the update payload. The stored secret is never sent back to the client,
 * so an empty apiKey field means "keep the stored value" and is omitted. For providers using
 * usernames the username is always sent ('' clears it on the backend). `clearApiKey` sends
 * apiKey: null to deliberately remove the stored secret.
 */
export function buildUpdateCredentials(
  providerId: string,
  data: { apiKey: string; username?: string | undefined },
  clearApiKey = false
): { apiKey?: string | null; username?: string } {
  return {
    // null explicitly clears the stored secret
    ...(clearApiKey ? { apiKey: null } : data.apiKey.trim() !== '' && { apiKey: data.apiKey }),
    ...(supportsUsername(providerId) && { username: data.username?.trim() ?? '' }),
  };
}
