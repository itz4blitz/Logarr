import { defineConfig } from 'drizzle-kit';

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for database migrations');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsedUrl.protocol) ||
    !parsedUrl.username ||
    !parsedUrl.password ||
    !parsedUrl.hostname ||
    parsedUrl.pathname.length <= 1
  ) {
    throw new Error(
      'DATABASE_URL must include postgres username, password, host, and database name'
    );
  }

  return databaseUrl;
}

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
