import { afterEach, beforeEach, describe, expect, it, type vi } from 'vitest';

import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';

import { ServerSeedService } from './server-seed.service';

const SEEDED_ENV_KEYS = [
  'JELLYFIN_URL',
  'JELLYFIN_API_KEY',
  'QBITTORRENT_URL',
  'QBITTORRENT_USERNAME',
  'QBITTORRENT_PASSWORD',
  'QBITTORRENT_LOGS_PATH',
] as const;

describe('ServerSeedService - qBittorrent', () => {
  let mockDb: MockDb;
  let service: ServerSeedService;
  const originalEnv: Record<string, string | undefined> = {};
  let providerList: Array<{ id: string; capabilities: Record<string, boolean> }>;

  const insertedRows = (): Array<Record<string, unknown>> =>
    mockDb.insert.mock.results.map(
      (r) =>
        (r.value as { values: ReturnType<typeof vi.fn> }).values.mock.calls[0]![0] as Record<
          string,
          unknown
        >
    );

  beforeEach(() => {
    providerList = [
      { id: 'qbittorrent', capabilities: { apiKeyOptional: true, supportsUsername: true } },
      { id: 'jellyfin', capabilities: {} },
    ];
    for (const key of SEEDED_ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    // Unrelated providers must not be seeded by the test environment
    for (const key of Object.keys(process.env)) {
      if (/_(URL|API_KEY)$/.test(key) && !key.startsWith('QBITTORRENT')) {
        originalEnv[key] = process.env[key];
        delete process.env[key];
      }
    }
    mockDb = createMockDb();
    configureMockDb(mockDb, { select: [] });
    service = new ServerSeedService(
      mockDb as never,
      {
        getAvailableProviders: () => providerList,
      } as never
    );
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('seeds qBittorrent with only a URL (auth bypass)', async () => {
    process.env['QBITTORRENT_URL'] = 'http://qbit:8080';

    await service.onModuleInit();

    expect(insertedRows()).toHaveLength(1);
    expect(insertedRows()[0]).toMatchObject({
      providerId: 'qbittorrent',
      url: 'http://qbit:8080',
      apiKey: '',
      username: null,
    });
  });

  it('seeds username and password', async () => {
    process.env['QBITTORRENT_URL'] = 'http://qbit:8080';
    process.env['QBITTORRENT_USERNAME'] = ' admin ';
    process.env['QBITTORRENT_PASSWORD'] = ' secret ';

    await service.onModuleInit();

    // the password is stored verbatim (not trimmed), the username is trimmed
    expect(insertedRows()[0]).toMatchObject({ username: 'admin', apiKey: ' secret ' });
  });

  it('seeds an API key when only the password variable is set', async () => {
    process.env['QBITTORRENT_URL'] = 'http://qbit:8080';
    process.env['QBITTORRENT_PASSWORD'] = 'qbt_key';

    await service.onModuleInit();

    expect(insertedRows()[0]).toMatchObject({ username: null, apiKey: 'qbt_key' });
  });

  it('enables file ingestion with the container log path when QBITTORRENT_LOGS_PATH is set', async () => {
    process.env['QBITTORRENT_URL'] = 'http://qbit:8080';
    process.env['QBITTORRENT_LOGS_PATH'] = '/host/logs';

    await service.onModuleInit();

    expect(insertedRows()[0]).toMatchObject({
      fileIngestionEnabled: true,
      logPath: '/qbittorrent-logs',
      logPaths: ['/qbittorrent-logs'],
    });
  });

  it('does not seed without a URL', async () => {
    process.env['QBITTORRENT_PASSWORD'] = 'secret';

    await service.onModuleInit();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('does not seed when a qBittorrent server already exists', async () => {
    process.env['QBITTORRENT_URL'] = 'http://qbit:8080';
    configureMockDb(mockDb, { select: [{ id: 'existing' }] });

    await service.onModuleInit();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('requires an API key when the provider does not declare apiKeyOptional', async () => {
    providerList = [{ id: 'qbittorrent', capabilities: {} }];
    process.env['QBITTORRENT_URL'] = 'http://qbit:8080';

    await service.onModuleInit();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('still requires an API key for other providers', async () => {
    process.env['JELLYFIN_URL'] = 'http://jf:8096';

    await service.onModuleInit();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
