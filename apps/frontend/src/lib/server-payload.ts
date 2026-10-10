import type { CreateServerDto } from '@/lib/api';

/** Providers whose credentials (username / password / API key) are all optional */
const OPTIONAL_CREDENTIAL_PROVIDERS = new Set(['qbittorrent']);

export function areCredentialsOptional(providerId: string): boolean {
  return OPTIONAL_CREDENTIAL_PROVIDERS.has(providerId);
}

/**
 * Build the create-server payload from the dynamic "add source" form values.
 * The password field is stored in apiKey (it may be empty for qBittorrent).
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
 * Credential fields for the update payload. For providers using usernames the username is
 * always sent ('' clears it on the backend).
 */
export function buildUpdateCredentials(
  providerId: string,
  data: { apiKey: string; username?: string | undefined }
): { apiKey: string; username?: string } {
  return {
    apiKey: data.apiKey,
    ...(areCredentialsOptional(providerId) && { username: data.username?.trim() ?? '' }),
  };
}
