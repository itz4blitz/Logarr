import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    name: 'backend',
    root: './',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/test/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/**/*.controller.ts',
        'src/**/*.gateway.ts',
        'src/database/migrations/**',
        'src/database/index.ts',
        'src/config/**',
        // File ingestion requires filesystem mocking - better tested via integration/E2E
        'src/modules/file-ingestion/**',
        // Ingestion module requires WebSocket mocking
        'src/modules/ingestion/**',
        // AI analysis helpers (response parser, prompt builder) - tested through integration
        'src/modules/issues/analysis-*.ts',
        'src/modules/issues/issue-context.service.ts',
        // Database schema is just table definitions
        'src/database/schema.ts',
        // AI provider has external API dependencies - better tested via integration/E2E
        'src/modules/settings/ai-provider.service.ts',
        // Seed services run once at startup - tested via integration/E2E
        'src/modules/servers/server-seed.service.ts',
        'src/modules/settings/ai-provider-seed.service.ts',
        // Barrel export files
        'src/modules/retention/index.ts',
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
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
