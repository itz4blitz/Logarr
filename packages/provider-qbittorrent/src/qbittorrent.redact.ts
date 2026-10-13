/**
 * Private trackers embed account secrets (passkey / authkey) in announce URLs, and qBittorrent
 * log messages and torrent objects can contain those URLs. Mask them before anything is stored.
 */
// "=" may be percent-encoded (%3D) and the key may follow an encoded "?" / "&" (%3F / %26). The value
// ends at a literal "&", an encoded "&" (%26), whitespace or a quote.
const SECRET_QUERY_PARAM =
  /(?<=^|[^a-z0-9]|%3f|%26)(passkey|authkey|torrent_pass|pk)(=|%3d)(?:(?!%26)[^&\s"'<>])+/gi;
const HEX_PATH_SEGMENT = /\/[0-9a-f]{32,}(?=[/?#&\s"'<>]|$)/gi;
// Opaque tokens (base32 / base64url / alphanumeric, >= 20 chars) next to announce/scrape in a path:
// /announce/<token> or /<token>/announce ("/" may be percent-encoded as %2F)
const SLASH = '(?:/|%2f)';
const TOKEN = '[a-z0-9_-]{20,}';
const TOKEN_AFTER_ANNOUNCE = new RegExp(`(${SLASH}(?:announce|scrape))${SLASH}${TOKEN}`, 'gi');
const TOKEN_BEFORE_ANNOUNCE = new RegExp(`${SLASH}${TOKEN}(?=${SLASH}(?:announce|scrape))`, 'gi');

export function redactSecrets(text: string): string {
  return text
    .replace(SECRET_QUERY_PARAM, '$1$2***')
    .replace(HEX_PATH_SEGMENT, '/***')
    .replace(TOKEN_AFTER_ANNOUNCE, '$1/***')
    .replace(TOKEN_BEFORE_ANNOUNCE, '/***');
}

/** Reduce a tracker URL to its host (no path or query); undefined if it is not a valid URL */
export function trackerHost(tracker: string | undefined): string | undefined {
  if (tracker === undefined || tracker === '') {
    return undefined;
  }
  try {
    return new URL(tracker).host;
  } catch {
    return undefined;
  }
}
