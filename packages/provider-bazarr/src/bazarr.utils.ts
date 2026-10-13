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

/**
 * Field order of a numeric slash date. Bazarr's `parsed_timestamp` is Python's locale
 * `%x %X`, so `05/10/26` is 10 May (`mdy`) or 5 October (`dmy`) depending on the host locale.
 */
export type SlashDateOrder = 'mdy' | 'dmy';

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
 * Resolve the order of one slash date: `undefined` when it cannot be known from the
 * numbers alone (both <= 12 and different).
 */
function rowOrder(first: number, second: number): SlashDateOrder | undefined {
  if (first === second) return 'mdy'; // identical either way
  if (first > 12) return 'dmy';
  if (second > 12) return 'mdy';
  return undefined;
}

/**
 * Parse a timestamp string as emitted by Bazarr (naive local time).
 * Supports ISO-like values and Python's locale `%x %X` output. Ambiguous slash dates
 * (both numbers <= 12) are only parsed when `order` says how to read them; dotted dates
 * are always day-first.
 */
function parseDateString(value: string, order: SlashDateOrder | undefined): Date | undefined {
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

  const resolved = m[2] === '.' ? 'dmy' : (rowOrder(first, second) ?? order);
  if (resolved === undefined) {
    return undefined;
  }
  const month = resolved === 'dmy' ? second : first;
  const day = resolved === 'dmy' ? first : second;

  let hour = Number(m[5]);
  const meridiem = m[8]?.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  return build(year, month, day, hour, Number(m[6]), Number(m[7] ?? '0'));
}

type TimestampFields = Pick<BazarrHistoryBase, 'parsed_timestamp' | 'timestamp'>;

/**
 * Infer the slash-date order of a whole response: any date whose first number is > 12
 * proves day-first, any whose second number is > 12 proves month-first. Returns undefined
 * when there is no evidence or the evidence conflicts.
 */
export function inferSlashDateOrder(
  records: readonly TimestampFields[]
): SlashDateOrder | undefined {
  let dmy = false;
  let mdy = false;

  for (const record of records) {
    for (const candidate of [record.parsed_timestamp, record.timestamp]) {
      if (typeof candidate !== 'string') continue;
      const m = LOCALE_LIKE.exec(candidate.trim());
      if (m === null || m[2] === '.') continue;
      if (Number(m[1]) === Number(m[3])) continue;
      const found = rowOrder(Number(m[1]), Number(m[3]));
      if (found === 'dmy') dmy = true;
      if (found === 'mdy') mdy = true;
    }
  }

  if (dmy === mdy) return undefined;
  return dmy ? 'dmy' : 'mdy';
}

/**
 * Best-effort absolute timestamp of a history record.
 * Bazarr's `timestamp` is humanised ("2 hours ago"); `parsed_timestamp` is locale
 * formatted and contains the only absolute time. Returns undefined when nothing parses so
 * callers can decide on a fallback.
 */
export function parseBazarrTimestamp(
  record: TimestampFields,
  order?: SlashDateOrder
): Date | undefined {
  for (const candidate of [record.parsed_timestamp, record.timestamp]) {
    if (typeof candidate === 'string' && candidate !== '') {
      const date = parseDateString(candidate, order);
      if (date !== undefined) {
        return date;
      }
    }
  }

  return undefined;
}
