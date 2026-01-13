import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'frontend',
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    css: true,
    pool: 'vmThreads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/test/**',
        'src/app/**',
        'src/components/**',
        // Hooks that require browser APIs or WebSocket - better tested via E2E
        'src/hooks/use-issue-socket.ts',
        'src/hooks/use-log-socket.ts',
        'src/hooks/use-session-socket.ts',
        'src/hooks/use-sync-status.ts',
        'src/hooks/use-mobile.ts',
        'src/hooks/use-fit-to-viewport.ts',
        'src/hooks/use-api.ts',
        // WebSocket utilities - require browser APIs, better tested via E2E
        'src/lib/websocket.ts',
        // API and config files - tested through integration/E2E
        'src/lib/api.ts',
        'src/lib/config.ts',
        'src/lib/integrations.ts',
        'src/lib/activity-types.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
