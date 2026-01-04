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

# Generate runtime config that will be injected into the page
cat > /app/apps/frontend/public/__config.js << EOF
window.__LOGARR_CONFIG__ = {
  apiUrl: "${NEXT_PUBLIC_API_URL}",
  wsUrl: "${NEXT_PUBLIC_WS_URL}"
};
EOF

echo "Runtime config generated:"
echo "  API URL: ${NEXT_PUBLIC_API_URL}"
echo "  WS URL: ${NEXT_PUBLIC_WS_URL}"

# Start the application
exec node server.js
