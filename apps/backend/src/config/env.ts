import { z } from 'zod';

/**
 * Environment configuration schema.
 * All required values must be set - no defaults that hide misconfiguration.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  BACKEND_PORT: z.coerce.number().min(1).max(65535),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  CORS_ORIGIN: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  // Optional: If set to "true", resets admin account on startup (allows re-running /setup)
  // After reset, this env var is ignored until removed and re-added
  ADMIN_PASSWORD_RESET: z.enum(['true', 'false']).optional(),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

/**
 * Validates and caches environment variables.
 * Call this once at app startup - will exit process if validation fails.
 */
export function validateEnv(): Env {
  if (validatedEnv) return validatedEnv;

  // Convert empty strings to undefined for optional fields
  // This allows commented-out env vars to work properly
  const sanitizedEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    sanitizedEnv[key] = value === '' ? undefined : value;
  }

  const result = envSchema.safeParse(sanitizedEnv);

  if (!result.success) {
    console.error('\n❌ Invalid environment configuration:\n');
    const errors = result.error.format();
    Object.entries(errors).forEach(([key, value]) => {
      if (key !== '_errors' && typeof value === 'object' && '_errors' in value) {
        const errorMsgs = (value as { _errors: string[] })._errors;
        if (errorMsgs.length > 0) {
          console.error(`  ${key}: ${errorMsgs.join(', ')}`);
        }
      }
    });
    console.error('\nRequired environment variables:');
    console.error('  NODE_ENV      - development | production | test');
    console.error('  BACKEND_PORT  - Port number (1-65535)');
    console.error('  DATABASE_URL  - PostgreSQL connection URL');
    console.error('  REDIS_URL     - Redis connection URL');
    console.error('  CORS_ORIGIN   - Allowed CORS origin(s)');
    console.error('\nSee .env.example for reference.\n');
    process.exit(1);
  }

  validatedEnv = result.data;
  return validatedEnv;
}

/**
 * Get validated environment config.
 * Throws if validateEnv() hasn't been called yet.
 */
export function getEnv(): Env {
  if (!validatedEnv) {
    throw new Error('Environment not validated. Call validateEnv() at app startup.');
  }
  return validatedEnv;
}
