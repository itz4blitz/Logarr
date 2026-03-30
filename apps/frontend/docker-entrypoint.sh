#!/bin/sh
set -e

# Validate required environment variables
if [ -z "$NEXT_PUBLIC_API_URL" ]; then
  echo "ERROR: NEXT_PUBLIC_API_URL environment variable is required"
  exit 1
fi

if [ -z "$NEXT_PUBLIC_WS_URL" ]; then
  echo "ERROR: NEXT_PUBLIC_WS_URL environment variable is required"
  exit 1
fi

# Generate runtime config that will be injected into the page.
# When Docker defaults point at localhost, remote browsers need those URLs rewritten
# to the host they actually used to open Logarr.
cat > /app/apps/frontend/public/__config.js << EOF
(function () {
  var loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

  function normalizeUrl(rawUrl, type) {
    try {
      var url = new URL(rawUrl, window.location.origin);
      if (!loopbackHosts.has(url.hostname)) {
        return url.toString();
      }

      url.hostname = window.location.hostname;
      url.protocol =
        type === 'ws'
          ? window.location.protocol === 'https:'
            ? 'wss:'
            : 'ws:'
          : window.location.protocol;

      return url.toString();
    } catch {
      return rawUrl;
    }
  }

  window.__LOGARR_CONFIG__ = {
    apiUrl: normalizeUrl("${NEXT_PUBLIC_API_URL}", 'http'),
    wsUrl: normalizeUrl("${NEXT_PUBLIC_WS_URL}", 'ws')
  };
})();
EOF

echo "Runtime config generated:"
echo "  API URL: ${NEXT_PUBLIC_API_URL}"
echo "  WS URL: ${NEXT_PUBLIC_WS_URL}"

# Start the application (server.js is at /app in standalone monorepo output)
exec node /app/apps/frontend/server.js
