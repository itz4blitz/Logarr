import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
