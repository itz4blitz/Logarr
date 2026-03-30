const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function parseConfiguredOrigins(configuredOrigins: string): string[] {
  return configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function defaultPort(protocol: string): string {
  return protocol === 'https:' ? '443' : '80';
}

function parseOrigin(origin: string): URL | null {
  try {
    return new URL(origin);
  } catch {
    return null;
  }
}

function isLoopbackAlias(configuredOrigin: string, requestOrigin: string): boolean {
  const configuredUrl = parseOrigin(configuredOrigin);
  const requestUrl = parseOrigin(requestOrigin);

  if (!configuredUrl || !requestUrl) {
    return false;
  }

  if (!LOOPBACK_HOSTS.has(configuredUrl.hostname)) {
    return false;
  }

  return (
    configuredUrl.protocol === requestUrl.protocol &&
    (configuredUrl.port.length > 0 ? configuredUrl.port : defaultPort(configuredUrl.protocol)) ===
      (requestUrl.port.length > 0 ? requestUrl.port : defaultPort(requestUrl.protocol))
  );
}

export function isOriginAllowed(origin: string | undefined, configuredOrigins: string): boolean {
  if (origin === undefined || origin.length === 0) {
    return true;
  }

  const allowedOrigins = parseConfiguredOrigins(configuredOrigins);
  if (allowedOrigins.includes('*')) {
    return true;
  }

  return allowedOrigins.some(
    (configuredOrigin) => configuredOrigin === origin || isLoopbackAlias(configuredOrigin, origin)
  );
}

export function createCorsOriginValidator(configuredOrigins: string) {
  return (
    origin: string | undefined,
    callback: (error: Error | null, allow?: boolean) => void
  ): void => {
    callback(null, isOriginAllowed(origin, configuredOrigins));
  };
}
