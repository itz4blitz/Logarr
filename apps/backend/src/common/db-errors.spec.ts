import { describe, it, expect } from 'vitest';

import { describeError, getErrorCode, isDeadlockError } from './db-errors';

describe('db-errors', () => {
  it('reads the SQLSTATE from the error and from its cause chain', () => {
    expect(getErrorCode(Object.assign(new Error('x'), { code: '40P01' }))).toBe('40P01');
    expect(getErrorCode(new Error('wrap', { cause: { code: '23505' } }))).toBe('23505');
    expect(getErrorCode(new Error('plain'))).toBeUndefined();
    expect(getErrorCode(null)).toBeUndefined();
    expect(getErrorCode('str')).toBeUndefined();
  });

  it('detects deadlocks', () => {
    expect(isDeadlockError(Object.assign(new Error('deadlock detected'), { code: '40P01' }))).toBe(
      true
    );
    expect(isDeadlockError(Object.assign(new Error('dup'), { code: '23505' }))).toBe(false);
  });

  it('describes errors with message and code', () => {
    const err = Object.assign(new Error('deadlock detected'), { code: '40P01' });
    expect(describeError(err)).toBe('Error: deadlock detected (code=40P01)');
    expect(describeError(new Error('boom'))).toBe('Error: boom');
    expect(describeError('oops')).toBe('oops');
  });

  it('never throws on circular or exotic values', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(() => describeError(circular)).not.toThrow();
    expect(describeError(circular)).toBe('[object Object]');
    expect(() => describeError(undefined)).not.toThrow();
    expect(() => describeError(Symbol('s'))).not.toThrow();
    expect(() => describeError(10n)).not.toThrow();
  });

  it('includes non-Postgres codes too', () => {
    expect(describeError(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))).toBe(
      'Error: refused (code=ECONNREFUSED)'
    );
  });

  it('never leaks query text or bound parameters of wrapped driver errors', () => {
    const err = Object.assign(new Error('Failed query'), {
      query: 'insert into "servers" ("api_key") values ($1)',
      params: ['super-secret-key'],
      parameters: ['super-secret-key'],
      cause: Object.assign(new Error('inner'), { code: '23505', parameters: ['super-secret-key'] }),
    });
    const text = describeError(err);
    expect(text).toBe('Error: Failed query (code=23505)');
    expect(text).not.toContain('secret');
    expect(text).not.toContain('insert into');
  });
});
