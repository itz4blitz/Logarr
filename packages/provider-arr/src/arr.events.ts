/**
 * Shared helpers for resolving and describing *arr history event types.
 *
 * *arr APIs report `eventType` either as an enum name ("downloadFailed"), as a
 * numeric enum value (4) or as a numeric string ("4"), depending on the app/version.
 * Per-app providers supply their own enum table and display table.
 */

export type ArrEventSeverity = 'info' | 'warn' | 'error';

/** Display label and severity for a single event */
export interface ArrEventDescriptor {
  readonly label: string;
  readonly severity: ArrEventSeverity;
}

/** Event name (camelCase, as reported by the API) to descriptor */
export type ArrEventTable = Readonly<Record<string, ArrEventDescriptor>>;

/**
 * Resolve a raw `eventType` to an event name.
 *
 * - integer number or numeric string: looked up in `names`; absent -> 'unknown'
 * - any other non-blank string: returned unchanged
 * - blank string, non-string/non-number, NaN/Infinity, fractional: 'unknown'
 */
export function resolveArrEventName(
  eventType: unknown,
  names: Readonly<Record<number, string>>
): string {
  if (typeof eventType === 'number') {
    return Number.isInteger(eventType) ? (names[eventType] ?? 'unknown') : 'unknown';
  }

  if (typeof eventType === 'string') {
    const trimmed = eventType.trim();
    if (trimmed === '') return 'unknown';
    if (/^\d+$/.test(trimmed)) return names[Number(trimmed)] ?? 'unknown';
    return eventType;
  }

  return 'unknown';
}

function humanize(name: string): string {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return spaced === '' ? 'Unknown' : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Describe an event by name using a per-app table.
 *
 * Lookup is exact first, then case-insensitive. Names missing from the table get
 * a humanized label and a default severity: 'error' when the name contains "fail",
 * otherwise 'info'.
 */
export function describeArrEvent(name: string, table: ArrEventTable): ArrEventDescriptor {
  if (Object.hasOwn(table, name)) return table[name] as ArrEventDescriptor;

  const lower = name.toLowerCase();
  for (const [key, descriptor] of Object.entries(table)) {
    if (key.toLowerCase() === lower) return descriptor;
  }

  return { label: humanize(name), severity: /fail/i.test(name) ? 'error' : 'info' };
}
