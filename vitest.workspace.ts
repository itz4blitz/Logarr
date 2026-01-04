import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'apps/backend/vitest.config.ts',
  'apps/frontend/vitest.config.ts',
  'packages/*/vitest.config.ts',
]);
