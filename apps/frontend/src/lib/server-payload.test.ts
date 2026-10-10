import { describe, it, expect } from 'vitest';

import {
  areCredentialsOptional,
  buildCreateServerPayload,
  buildUpdateCredentials,
} from './server-payload';

describe('buildCreateServerPayload', () => {
  it('maps the password field to apiKey and trims the username', () => {
    expect(
      buildCreateServerPayload('qbittorrent', {
        name: 'qBit',
        url: 'http://qbit:8080',
        username: '  admin ',
        password: 'secret',
        logPath: '/qbittorrent-logs',
      })
    ).toEqual({
      name: 'qBit',
      providerId: 'qbittorrent',
      url: 'http://qbit:8080',
      apiKey: 'secret',
      username: 'admin',
      logPath: '/qbittorrent-logs',
    });
  });

  it('omits a blank username and allows an empty apiKey', () => {
    const payload = buildCreateServerPayload('qbittorrent', {
      name: 'qBit',
      url: 'http://qbit:8080',
      username: '   ',
      password: '',
    });
    expect(payload.apiKey).toBe('');
    expect(payload).not.toHaveProperty('username');
  });

  it('keeps apiKey / token / password precedence for other providers', () => {
    expect(buildCreateServerPayload('sonarr', { name: 'n', url: 'u', apiKey: 'k' }).apiKey).toBe(
      'k'
    );
    expect(buildCreateServerPayload('x', { name: 'n', url: 'u', token: 't' }).apiKey).toBe('t');
    expect(
      buildCreateServerPayload('sonarr', { name: 'n', url: 'u', apiKey: 'k' })
    ).not.toHaveProperty('username');
  });
});

describe('buildUpdateCredentials', () => {
  it('sends the trimmed username for qbittorrent, empty string to clear', () => {
    expect(buildUpdateCredentials('qbittorrent', { apiKey: 'pw', username: ' bob ' })).toEqual({
      apiKey: 'pw',
      username: 'bob',
    });
    expect(buildUpdateCredentials('qbittorrent', { apiKey: '', username: undefined })).toEqual({
      apiKey: '',
      username: '',
    });
  });

  it('never sends a username for other providers', () => {
    expect(buildUpdateCredentials('sonarr', { apiKey: 'k', username: 'x' })).toEqual({
      apiKey: 'k',
    });
  });
});

describe('areCredentialsOptional', () => {
  it('is true only for qbittorrent', () => {
    expect(areCredentialsOptional('qbittorrent')).toBe(true);
    expect(areCredentialsOptional('sonarr')).toBe(false);
  });
});
