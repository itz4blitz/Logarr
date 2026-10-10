import type { BazarrHistoryBase } from './bazarr.types.js';

/**
 * Stable 64-bit FNV-1a hash rendered as 16 hex chars.
 * Used to derive deterministic activity ids (no Date.now(), no node:crypto).
 */
export function stableHash(input: string): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;

  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, '0');
}

const ISO_LIKE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;
const LOCALE_LIKE =
  /^(\d{1,2})([/.-])(\d{1,2})[/.-](\d{2,4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i;

function build(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date | undefined {
  const date = new Date(year, month - 1, day, hour, minute, second);
  const valid =
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return valid ? date : undefined;
}

/**
 * Parse a timestamp string as emitted by Bazarr (naive local time).
 * Supports ISO-like values and Python's locale `%x %X` output
 * (e.g. "10/09/26 12:00:01", "10/09/2026 1:30:00 PM", "09.10.2026 08:00:00").
 */
function parseDateString(value: string): Date | undefined {
  const text = value.trim();

  const iso = ISO_LIKE.exec(text);
  if (iso !== null) {
    return build(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
      Number(iso[6] ?? '0')
    );
  }

  const m = LOCALE_LIKE.exec(text);
  if (m === null) {
    return undefined;
  }

  const first = Number(m[1]);
  const second = Number(m[3]);
  let year = Number(m[4]);
  if ((m[4] ?? '').length === 2) {
    year += 2000;
  }

  // Month first (C / en_US) unless the separator is a dot or the first number cannot be a month
  const dayFirst = m[2] === '.' || first > 12;
  const month = dayFirst ? second : first;
  const day = dayFirst ? first : second;

  let hour = Number(m[5]);
  const meridiem = m[8]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  return build(year, month, day, hour, Number(m[6]), Number(m[7] ?? '0'));
}

/**
 * Best-effort absolute timestamp of a history record.
 * Bazarr's `timestamp` is humanised ("2 hours ago"); `parsed_timestamp` is locale
 * formatted. Returns undefined when nothing parses so callers can decide on a fallback.
 */
export function parseBazarrTimestamp(
  record: Pick<BazarrHistoryBase, 'parsed_timestamp' | 'timestamp'>
): Date | undefined {
  for (const candidate of [record.parsed_timestamp, record.timestamp]) {
    if (typeof candidate === 'string' && candidate !== '') {
      const date = parseDateString(candidate);
      if (date !== undefined) {
        return date;
      }
    }
  }

  return undefined;
}
