/**
 * Frontend configuration.
 *
 * Uses a combination of build-time and runtime configuration:
 * - Build time: NEXT_PUBLIC_* vars (for dev and static builds)
 * - Runtime: Window-based config injection (for Docker deployments)
 */

interface LogarrConfig {
  apiUrl: string;
  wsUrl: string;
}

function getConfig(): LogarrConfig {
  // In browser, check for runtime config first (injected via script tag in Docker)
  if (typeof window !== 'undefined') {
    const runtimeConfig = (window as { __LOGARR_CONFIG__?: LogarrConfig }).__LOGARR_CONFIG__;
    if (runtimeConfig) {
      return runtimeConfig;
    }
  }

  // Fall back to build-time env vars
  const API_URL = process.env.NEXT_PUBLIC_API_URL;
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

  if (!API_URL || !WS_URL) {
    throw new Error(
      'Missing required configuration.\n' +
      'Set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL environment variables,\n' +
      'or ensure __LOGARR_CONFIG__ is injected at runtime (Docker).'
    );
  }

  return {
    apiUrl: API_URL,
    wsUrl: WS_URL,
  };
}

export const config = getConfig();
