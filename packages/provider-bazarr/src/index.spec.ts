import { describe, expect, it } from 'vitest';

import * as bazarr from './index.js';

describe('package exports', () => {
  it('exposes the provider, client and parser helpers', () => {
    expect(new bazarr.BazarrProvider().id).toBe('bazarr');
    expect(typeof bazarr.BazarrClient).toBe('function');
    expect(typeof bazarr.parseBazarrLogLine).toBe('function');
    expect(typeof bazarr.parseBazarrLogLineWithContext).toBe('function');
    expect(typeof bazarr.isBazarrLogContinuation).toBe('function');
    expect(typeof bazarr.mapBazarrLevel).toBe('function');
    expect(typeof bazarr.parseBazarrTimestamp).toBe('function');
    expect(typeof bazarr.stableHash).toBe('function');
    expect(bazarr.BAZARR_LOG_FILE_CONFIG.filePatterns).toContain('bazarr.log');
    expect(bazarr.BAZARR_CORRELATION_PATTERNS).toEqual([]);
    expect(bazarr.BazarrHistoryActions[1]).toBe('download');
  });
});
