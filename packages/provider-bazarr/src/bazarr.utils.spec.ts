import { describe, expect, it } from 'vitest';

import { parseBazarrTimestamp, stableHash } from './bazarr.utils.js';

describe('parseBazarrTimestamp', () => {
  it('parses ISO-like strings', () => {
    expect(parseBazarrTimestamp({ timestamp: '2026-10-10 10:00:00' })).toEqual(
      new Date('2026-10-10T10:00:00')
    );
    expect(parseBazarrTimestamp({ parsed_timestamp: '2026-10-10T10:00:00' })).toEqual(
      new Date('2026-10-10T10:00:00')
    );
  });

  it('parses the C/en_US %x %X format (month first, 2-digit year)', () => {
    expect(parseBazarrTimestamp({ parsed_timestamp: '10/09/26 12:00:01' })).toEqual(
      new Date(2026, 9, 9, 12, 0, 1)
    );
  });

  it('parses 4-digit year and 12-hour clock', () => {
    expect(parseBazarrTimestamp({ parsed_timestamp: '10/09/2026 12:00:01 AM' })).toEqual(
      new Date(2026, 9, 9, 0, 0, 1)
    );
    expect(parseBazarrTimestamp({ parsed_timestamp: '10/09/2026 1:30:00 PM' })).toEqual(
      new Date(2026, 9, 9, 13, 30, 0)
    );
  });

  it('treats a first number above 12 as the day', () => {
    expect(parseBazarrTimestamp({ parsed_timestamp: '25/09/2026 08:00:00' })).toEqual(
      new Date(2026, 8, 25, 8, 0, 0)
    );
  });

  it('treats dotted dates as day first', () => {
    expect(parseBazarrTimestamp({ parsed_timestamp: '09.10.2026 08:00:00' })).toEqual(
      new Date(2026, 9, 9, 8, 0, 0)
    );
  });

  it('returns undefined for humanised or garbage values', () => {
    expect(parseBazarrTimestamp({ timestamp: '2 hours ago' })).toBeUndefined();
    expect(parseBazarrTimestamp({ timestamp: 'garbage' })).toBeUndefined();
    expect(parseBazarrTimestamp({ parsed_timestamp: '13/45/26 99:99:99' })).toBeUndefined();
    expect(parseBazarrTimestamp({})).toBeUndefined();
  });
});

describe('stableHash', () => {
  it('is deterministic and 16 hex chars', () => {
    expect(stableHash('abc')).toBe(stableHash('abc'));
    expect(stableHash('abc')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for different input', () => {
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
  });
});

describe('parseBazarrTimestamp edge cases', () => {
  it('falls through to timestamp when parsed_timestamp is unparseable', () => {
    expect(
      parseBazarrTimestamp({ parsed_timestamp: 'an hour ago', timestamp: '2026-10-10 10:00:00' })
    ).toEqual(new Date(2026, 9, 10, 10, 0, 0));
  });

  it('ignores empty strings and missing fields', () => {
    expect(parseBazarrTimestamp({ parsed_timestamp: '', timestamp: '' })).toBeUndefined();
    expect(parseBazarrTimestamp({})).toBeUndefined();
  });

  it('rejects calendar-invalid dates instead of rolling them over', () => {
    expect(parseBazarrTimestamp({ timestamp: '2026-02-30 10:00:00' })).toBeUndefined();
    expect(parseBazarrTimestamp({ timestamp: '13/45/26 10:00:00' })).toBeUndefined();
  });

  it('accepts ISO-like values without seconds and with a T separator', () => {
    expect(parseBazarrTimestamp({ timestamp: '2026-10-10T10:05' })).toEqual(
      new Date(2026, 9, 10, 10, 5, 0)
    );
  });

  it('handles 12 AM and 12 PM on the 12-hour clock', () => {
    expect(parseBazarrTimestamp({ parsed_timestamp: '10/09/2026 12:30:00 AM' })).toEqual(
      new Date(2026, 9, 9, 0, 30, 0)
    );
    expect(parseBazarrTimestamp({ parsed_timestamp: '10/09/2026 12:30:00 PM' })).toEqual(
      new Date(2026, 9, 9, 12, 30, 0)
    );
  });

  it('does not accept a date-only string', () => {
    expect(parseBazarrTimestamp({ timestamp: '2026-10-10' })).toBeUndefined();
  });
});

describe('stableHash edge cases', () => {
  it('hashes the empty string to the FNV-1a offset basis', () => {
    expect(stableHash('')).toBe('cbf29ce484222325');
  });

  it('is sensitive to the field separator', () => {
    expect(stableHash('a|b')).not.toBe(stableHash('ab'));
  });
});
