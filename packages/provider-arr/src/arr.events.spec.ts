import { describe, expect, it } from 'vitest';

import { describeArrEvent, resolveArrEventName, stableArrHash, toArrItemId } from './arr.events.js';

import type { ArrEventTable } from './arr.events.js';

const NAMES = { 1: 'grabbed', 4: 'downloadFolderImported', 7: 'downloadFailed' } as const;

describe('resolveArrEventName', () => {
  it.each([
    [1, 'grabbed'],
    [7, 'downloadFailed'],
    ['4', 'downloadFolderImported'],
    [' 7 ', 'downloadFailed'],
  ])('maps %j to %s', (input, expected) => {
    expect(resolveArrEventName(input, NAMES)).toBe(expected);
  });

  it.each([[99], ['99'], [-1], [1.5], [NaN], [Infinity]])('returns unknown for %j', (input) => {
    expect(resolveArrEventName(input, NAMES)).toBe('unknown');
  });

  it.each([[''], ['   '], [null], [undefined], [{}], [[]], [true]])(
    'returns unknown for %j',
    (input) => {
      expect(resolveArrEventName(input, NAMES)).toBe('unknown');
    }
  );

  it('returns unmatched strings unchanged', () => {
    expect(resolveArrEventName('trackFileImported', NAMES)).toBe('trackFileImported');
  });

  it('matches known names case-insensitively', () => {
    expect(resolveArrEventName('Grabbed', NAMES)).toBe('grabbed');
    expect(resolveArrEventName('DownloadFailed', NAMES)).toBe('downloadFailed');
    expect(resolveArrEventName(' DOWNLOADFAILED ', NAMES)).toBe('downloadFailed');
  });

  it('does not resolve inherited object keys', () => {
    expect(resolveArrEventName('constructor', {})).toBe('constructor');
    expect(resolveArrEventName(0, {})).toBe('unknown');
  });
});

describe('describeArrEvent', () => {
  const table: ArrEventTable = {
    downloadFailed: { label: 'Download Failed', severity: 'error' },
    albumImportIncomplete: { label: 'Import Incomplete', severity: 'warn' },
    grabbed: { label: 'Grabbed', severity: 'info' },
  };

  it('returns the table entry for a known name', () => {
    expect(describeArrEvent('albumImportIncomplete', table)).toEqual({
      label: 'Import Incomplete',
      severity: 'warn',
    });
  });

  it('matches names case-insensitively', () => {
    expect(describeArrEvent('DOWNLOADFAILED', table)).toBe(table['downloadFailed']);
  });

  it('defaults unknown names containing "fail" to error', () => {
    expect(describeArrEvent('bookImportFailed', table)).toEqual({
      label: 'Book Import Failed',
      severity: 'error',
    });
  });

  it('defaults other unknown names to info with a humanized label', () => {
    expect(describeArrEvent('bookFileRetagged', table)).toEqual({
      label: 'Book File Retagged',
      severity: 'info',
    });
  });

  it('handles the unknown sentinel and empty table', () => {
    expect(describeArrEvent('unknown', {})).toEqual({ label: 'Unknown', severity: 'info' });
    expect(describeArrEvent('', {})).toEqual({ label: 'Unknown', severity: 'info' });
  });

  it('does not resolve inherited object keys', () => {
    expect(describeArrEvent('constructor', {}).severity).toBe('info');
  });
});

describe('toArrItemId', () => {
  it.each([
    [1, '1'],
    [42, '42'],
  ])('stringifies %j', (input, expected) => {
    expect(toArrItemId(input)).toBe(expected);
  });

  it.each([[0], [-1], [1.5], [NaN], [Infinity], ['5'], [null], [undefined], [{}]])(
    'returns undefined for %j',
    (input) => {
      expect(toArrItemId(input)).toBeUndefined();
    }
  );
});

describe('stableArrHash', () => {
  it('is deterministic and 16 hex chars', () => {
    expect(stableArrHash('a', 'b')).toBe(stableArrHash('a', 'b'));
    expect(stableArrHash('a', 'b')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('differs for different input and for different part boundaries', () => {
    expect(stableArrHash('a', 'b')).not.toBe(stableArrHash('a', 'c'));
    expect(stableArrHash('ab', 'c')).not.toBe(stableArrHash('a', 'bc'));
  });
});
