import { describe, expect, it } from 'vitest';

import { isOriginAllowed } from './cors';

describe('isOriginAllowed', () => {
  it('allows exact origin matches', () => {
    expect(isOriginAllowed('http://localhost:3001', 'http://localhost:3001')).toBe(true);
  });

  it('allows wildcard origins', () => {
    expect(isOriginAllowed('https://logarr.example.com', '*')).toBe(true);
  });

  it('allows LAN hosts when configured origin is localhost on the same port', () => {
    expect(isOriginAllowed('http://192.168.1.120:3001', 'http://localhost:3001')).toBe(true);
  });

  it('rejects different ports for loopback alias matching', () => {
    expect(isOriginAllowed('http://192.168.1.120:1337', 'http://localhost:3001')).toBe(false);
  });
});
