/**
 * Helpers for inspecting database driver errors.
 *
 * postgres.js throws `PostgresError` objects carrying the SQLSTATE in `code`; other
 * drivers/wrappers may nest the original error in `cause`.
 */

/** SQLSTATE for "deadlock_detected" */
export const PG_DEADLOCK_DETECTED = '40P01';

const MAX_CAUSE_DEPTH = 5;

/**
 * Find the `code` of an error (SQLSTATE for Postgres errors, but also e.g. Node system
 * error codes like ECONNREFUSED), following the `cause` chain.
 */
export function getErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== null; depth++) {
    if (typeof current !== 'object' || current === undefined) {
      return undefined;
    }
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string' && code !== '') {
      return code;
    }
    current = cause;
  }
  return undefined;
}

export function isDeadlockError(error: unknown): boolean {
  return getErrorCode(error) === PG_DEADLOCK_DETECTED;
}

/**
 * Render an error as a single string including name, message and code.
 *
 * Needed because the nestjs-pino logger treats the last extra argument of
 * `logger.error(msg, extra)` as the log *context*, so passing the Error object there
 * silently drops it. Interpolate this string into the message instead.
 *
 * Deliberately only reads `name`, `message` and `code`: newer drizzle versions wrap driver
 * errors with the full `query` and `parameters`, which must never end up in logs.
 */
export function describeError(error: unknown): string {
  const code = getErrorCode(error);
  let text: string;
  if (error instanceof Error) {
    text = `${error.name}: ${error.message}`;
  } else if (typeof error === 'string') {
    text = error;
  } else {
    try {
      text = JSON.stringify(error) ?? String(error);
    } catch {
      try {
        text = String(error);
      } catch {
        text = Object.prototype.toString.call(error);
      }
    }
  }
  return code === undefined ? text : `${text} (code=${code})`;
}
