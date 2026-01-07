import { readFileSync } from 'fs';
import { join } from 'path';
import type { NextConfig } from 'next';

// Read version from root package.json (single source of truth)
const getAppVersion = (): string => {
  try {
    const packageJsonPath = join(__dirname, '..', '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
};

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion(),
  },
  // Only use standalone output for production builds
  ...(process.env.NODE_ENV === 'production' && { output: 'standalone' }),

  // Turbopack configuration (required in Next.js 16 when webpack config exists)
  turbopack: {},

  // Allow images from any hostname (for Jellyfin/Plex servers on various IPs)
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Enable webpack polling for Docker on Windows (file events don't propagate)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
