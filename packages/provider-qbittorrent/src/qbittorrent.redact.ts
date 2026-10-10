/**
 * Private trackers embed account secrets (passkey / authkey) in announce URLs, and qBittorrent
 * log messages and torrent objects can contain those URLs. Mask them before anything is stored.
 */
const SECRET_QUERY_PARAM = /\b(passkey|authkey|torrent_pass|pk)=[^&\s"'<>]+/gi;
const HEX_PATH_SEGMENT = /\/[0-9a-f]{32,}(?=[/?#&\s"'<>]|$)/gi;

export function redactSecrets(text: string): string {
  return text.replace(SECRET_QUERY_PARAM, '$1=***').replace(HEX_PATH_SEGMENT, '/***');
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
