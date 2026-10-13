import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { IssuesGateway } from '../issues/issues.gateway';
import { IssuesService } from '../issues/issues.service';
import { LogsGateway } from '../logs/logs.gateway';
import { SettingsService } from '../settings/settings.service';

import { FileDiscoveryService } from './file-discovery.service';
import { FileIngestionService } from './file-ingestion.service';
import { FileStateService } from './file-state.service';

import type { TestingModule } from '@nestjs/testing';

describe('FileIngestionService', () => {
  let service: FileIngestionService;
  let fileStateService: FileStateService;
  let fileDiscoveryService: FileDiscoveryService;
  let logsGateway: LogsGateway;
  let issuesService: IssuesService;
  let issuesGateway: IssuesGateway;
  let settingsService: SettingsService;
  let configService: ConfigService;

  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
    insert: vi.fn(),
  };

  const mockFileStateService = {
    getServerStates: vi.fn(),
    resetState: vi.fn(),
    deleteServerStates: vi.fn(),
    getState: vi.fn(),
    createState: vi.fn(),
    updateState: vi.fn(),
    updateError: vi.fn(),
  };

  const mockFileDiscoveryService = {
    validatePath: vi.fn(),
    discoverLogFiles: vi.fn(),
    getDefaultPaths: vi.fn(),
  };

  const mockLogsGateway = {
    broadcastLog: vi.fn(),
    broadcastFileIngestionProgress: vi.fn(),
  };

  const mockIssuesService = {
    processLogEntry: vi.fn(),
    processLogEntryDetailed: vi.fn(),
    findOne: vi.fn(),
  };

  const mockIssuesGateway = {
    broadcastNewIssue: vi.fn(),
    broadcastIssueUpdate: vi.fn(),
  };

  const mockSettingsService = {
    getFileIngestionSettings: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileIngestionService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: FileStateService, useValue: mockFileStateService },
        { provide: FileDiscoveryService, useValue: mockFileDiscoveryService },
        { provide: LogsGateway, useValue: mockLogsGateway },
        { provide: IssuesService, useValue: mockIssuesService },
        { provide: IssuesGateway, useValue: mockIssuesGateway },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<FileIngestionService>(FileIngestionService);
    fileStateService = module.get<FileStateService>(FileStateService);
    fileDiscoveryService = module.get<FileDiscoveryService>(FileDiscoveryService);
    logsGateway = module.get<LogsGateway>(LogsGateway);
    issuesService = module.get<IssuesService>(IssuesService);
    issuesGateway = module.get<IssuesGateway>(IssuesGateway);
    settingsService = module.get<SettingsService>(SettingsService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization and resilience', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should handle BACKFILL=false configuration', () => {
      mockConfigService.get.mockReturnValue('false');

      const testService = new FileIngestionService(
        mockDb as any,
        fileStateService,
        fileDiscoveryService,
        logsGateway,
        issuesService,
        issuesGateway,
        settingsService,
        configService
      );

      expect(testService).toBeDefined();
    });

    it('should handle BACKFILL=true configuration', () => {
      mockConfigService.get.mockReturnValue('true');

      const testService = new FileIngestionService(
        mockDb as any,
        fileStateService,
        fileDiscoveryService,
        logsGateway,
        issuesService,
        issuesGateway,
        settingsService,
        configService
      );

      expect(testService).toBeDefined();
    });

    it('should handle missing BACKFILL configuration', () => {
      mockConfigService.get.mockReturnValue(undefined);

      const testService = new FileIngestionService(
        mockDb as any,
        fileStateService,
        fileDiscoveryService,
        logsGateway,
        issuesService,
        issuesGateway,
        settingsService,
        configService
      );

      expect(testService).toBeDefined();
    });
  });

  describe('validateAndRecoverStaleStates', () => {
    it('should validate and recover stale states on startup', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server',
          logPaths: ['/tmp/test.log'],
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockServers),
        }),
      });

      // Mock successful path validation
      service['validateLogPaths'] = vi.fn().mockResolvedValue({
        valid: true,
        results: [{ path: '/tmp/test.log', accessible: true }],
      });

      service['resetStaleFileStates'] = vi.fn().mockResolvedValue(undefined);

      await service['validateAndRecoverStaleStates']();

      expect(service['validateLogPaths']).toHaveBeenCalledWith(['/tmp/test.log']);
      expect(service['resetStaleFileStates']).toHaveBeenCalledWith('server-1', ['/tmp/test.log']);
    });

    it('should disable file ingestion for servers with inaccessible paths', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server',
          logPaths: ['/tmp/missing.log'],
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockServers),
        }),
      });

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      // Mock failed path validation
      service['validateLogPaths'] = vi.fn().mockResolvedValue({
        valid: false,
        results: [{ path: '/tmp/missing.log', accessible: false, error: 'File not found' }],
      });

      await service['validateAndRecoverStaleStates']();

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle servers with no log paths', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server',
          logPaths: null,
        },
        {
          id: 'server-2',
          name: 'Test Server 2',
          logPaths: [],
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockServers),
        }),
      });

      // Mock the validateLogPaths method as a spy
      service['validateLogPaths'] = vi.fn();

      await service['validateAndRecoverStaleStates']();

      // Should skip servers without log paths
      expect(service['validateLogPaths']).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('Database error')),
        }),
      });

      await expect(service['validateAndRecoverStaleStates']()).rejects.toThrow('Database error');
    });
  });

  describe('resetStaleFileStates', () => {
    beforeEach(() => {
      // Mock fs.statSync
      vi.doMock('fs', () => ({
        statSync: vi.fn(),
      }));
    });

    it('should reset states for rotated files (inode changed)', async () => {
      const serverId = 'server-1';
      const logPaths = ['/tmp/test.log'];

      const mockFileStates = [
        {
          filePath: '/tmp/test.log',
          fileInode: 'old-inode',
          byteOffset: BigInt(100),
        },
      ];

      mockFileStateService.getServerStates.mockResolvedValue(mockFileStates);

      // Mock fs.statSync to return different inode
      const { statSync } = await import('fs');
      (statSync as any).mockReturnValue({
        ino: 'new-inode',
        size: 200,
      });

      await service['resetStaleFileStates'](serverId, logPaths);

      expect(mockFileStateService.resetState).toHaveBeenCalledWith(serverId, '/tmp/test.log');
    });

    it('should reset states for truncated files (size smaller than offset)', async () => {
      const serverId = 'server-1';
      const logPaths = ['/tmp/test.log'];

      const mockFileStates = [
        {
          filePath: '/tmp/test.log',
          fileInode: 'same-inode',
          byteOffset: BigInt(200),
        },
      ];

      mockFileStateService.getServerStates.mockResolvedValue(mockFileStates);

      // Mock fs.statSync to return smaller size
      const { statSync } = await import('fs');
      (statSync as any).mockReturnValue({
        ino: 'same-inode',
        size: 100, // Smaller than offset
      });

      await service['resetStaleFileStates'](serverId, logPaths);

      expect(mockFileStateService.resetState).toHaveBeenCalledWith(serverId, '/tmp/test.log');
    });

    it('should reset states for inaccessible files', async () => {
      const serverId = 'server-1';
      const logPaths = ['/tmp/test.log'];

      const mockFileStates = [
        {
          filePath: '/tmp/test.log',
          fileInode: 'some-inode',
          byteOffset: BigInt(100),
        },
      ];

      mockFileStateService.getServerStates.mockResolvedValue(mockFileStates);

      // Mock fs.statSync to throw error
      const { statSync } = await import('fs');
      (statSync as any).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      await service['resetStaleFileStates'](serverId, logPaths);

      expect(mockFileStateService.resetState).toHaveBeenCalledWith(serverId, '/tmp/test.log');
    });

    it('should not reset states for unchanged files', async () => {
      const serverId = 'server-1';
      const logPaths = ['/tmp/test.log'];

      const mockFileStates = [
        {
          filePath: '/tmp/test.log',
          fileInode: 'same-inode',
          byteOffset: BigInt(100),
        },
      ];

      mockFileStateService.getServerStates.mockResolvedValue(mockFileStates);

      // Mock fs.statSync to return same inode and larger size
      const { statSync } = await import('fs');
      (statSync as any).mockReturnValue({
        ino: 'same-inode',
        size: 200, // Larger than offset
      });

      await service['resetStaleFileStates'](serverId, logPaths);

      expect(mockFileStateService.resetState).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const serverId = 'server-1';
      const logPaths = ['/tmp/test.log'];

      mockFileStateService.getServerStates.mockRejectedValue(new Error('Database error'));

      // Should not throw, just log warning
      await expect(service['resetStaleFileStates'](serverId, logPaths)).resolves.toBeUndefined();
    });
  });

  describe('resetServerState', () => {
    it('should clear all state for a server', async () => {
      const serverId = 'server-1';

      await service.resetServerState(serverId);

      expect(mockFileStateService.deleteServerStates).toHaveBeenCalledWith(serverId);
    });

    it('should handle errors when clearing state', async () => {
      const serverId = 'server-1';

      mockFileStateService.deleteServerStates.mockRejectedValue(new Error('Delete failed'));

      await expect(service.resetServerState(serverId)).rejects.toThrow('Delete failed');
    });
  });

  describe('validateLogPaths', () => {
    it('should validate all paths successfully', async () => {
      const paths = ['/tmp/test1.log', '/tmp/test2.log'];

      mockFileDiscoveryService.validatePath
        .mockResolvedValueOnce({ accessible: true })
        .mockResolvedValueOnce({ accessible: true });

      const result = await service.validateLogPaths(paths);

      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.accessible).toBe(true);
      expect(result.results[1]?.accessible).toBe(true);
    });

    it('should return false when some paths are inaccessible', async () => {
      const paths = ['/tmp/test1.log', '/tmp/missing.log'];

      mockFileDiscoveryService.validatePath
        .mockResolvedValueOnce({ accessible: true })
        .mockResolvedValueOnce({ accessible: false, error: 'File not found' });

      const result = await service.validateLogPaths(paths);

      expect(result.valid).toBe(false);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.accessible).toBe(true);
      expect(result.results[1]?.accessible).toBe(false);
      expect(result.results[1]?.error).toBe('File not found');
    });

    it('should handle empty paths array', async () => {
      const result = await service.validateLogPaths([]);

      expect(result.valid).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = service.getStatus();

      expect(status).toHaveProperty('isStarted');
      expect(status).toHaveProperty('activeTailers');
      expect(status).toHaveProperty('tailers');
      expect(typeof status.isStarted).toBe('boolean');
      expect(typeof status.activeTailers).toBe('number');
      expect(Array.isArray(status.tailers)).toBe(true);
    });
  });

  describe('getProgress', () => {
    it('should return progress for all servers', () => {
      const progress = service.getProgress();

      expect(Array.isArray(progress)).toBe(true);
    });
  });

  describe('getServerProgress', () => {
    it('should return progress for specific server', () => {
      const serverId = 'server-1';
      const progress = service.getServerProgress(serverId);

      // Should return undefined if no progress tracked
      expect(progress).toBeUndefined();
    });
  });

  describe('isServerWatching', () => {
    it('should return false for unknown server', () => {
      const serverId = 'server-1';
      const isWatching = service.isServerWatching(serverId);

      expect(isWatching).toBe(false);
    });
  });

  describe('invalidateSettingsCache', () => {
    it('should invalidate cached settings', () => {
      service.invalidateSettingsCache();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('startServerFileIngestion', () => {
    it('should validate paths before starting ingestion', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Test Server',
        providerId: 'test-provider',
        logPaths: ['/tmp/missing.log'],
        logFilePatterns: null,
        initialSyncCompleted: false,
      };

      const mockProviders = new Map();
      const mockProvider = {
        getLogFileConfig: vi.fn().mockReturnValue({
          filePatterns: ['*.log'],
        }),
      };
      mockProviders.set('test-provider', mockProvider);

      // Mock failed path validation
      service.validateLogPaths = vi.fn().mockResolvedValue({
        valid: false,
        results: [{ path: '/tmp/missing.log', accessible: false, error: 'File not found' }],
      });

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      // Should not throw, but should update server status
      await service.startServerFileIngestion(mockServer as any, mockProviders);

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle provider without file ingestion support', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Test Server',
        providerId: 'test-provider',
        logPaths: ['/tmp/test.log'],
      };

      const mockProviders = new Map();
      const mockProvider = {
        // No getLogFileConfig method - doesn't support file ingestion
      };
      mockProviders.set('test-provider', mockProvider);

      // Mock the validateLogPaths method as a spy
      service.validateLogPaths = vi.fn();

      // Should return early without error
      await service.startServerFileIngestion(mockServer as any, mockProviders);

      // Should not attempt to validate paths
      expect(service.validateLogPaths).not.toHaveBeenCalled();
    });

    it('should handle missing provider', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Test Server',
        providerId: 'missing-provider',
        logPaths: ['/tmp/test.log'],
      };

      const mockProviders = new Map();

      // Mock the validateLogPaths method as a spy
      service.validateLogPaths = vi.fn();

      // Should return early without error
      await service.startServerFileIngestion(mockServer as any, mockProviders);

      // Should not attempt to validate paths
      expect(service.validateLogPaths).not.toHaveBeenCalled();
    });
  });

  describe('exclude pattern wiring', () => {
    const logFileConfig = {
      filePatterns: ['radarr.txt', 'radarr.*.txt'],
      excludePatterns: ['*.debug.*', '*.trace.*'],
    };
    const providerFor = (): Map<string, unknown> =>
      new Map([['arr', { getLogFileConfig: vi.fn().mockReturnValue(logFileConfig) }]]);

    const baseServer = {
      id: 'server-1',
      name: 'Radarr',
      providerId: 'arr',
      logPaths: ['/logs'],
      logFilePatterns: null as string[] | null,
      fileIngestionEnabled: true,
      initialSyncCompleted: false,
    };

    beforeEach(() => {
      mockFileDiscoveryService.discoverLogFiles.mockResolvedValue([]);
      mockFileDiscoveryService.validatePath.mockResolvedValue({ accessible: true });
      mockSettingsService.getFileIngestionSettings.mockRejectedValue(new Error('use defaults'));
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      });
    });

    const mockSelectServer = (server: typeof baseServer): void => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([server]) }),
      });
    };

    describe('startServerFileIngestion', () => {
      beforeEach(() => {
        service.validateLogPaths = vi.fn().mockResolvedValue({ valid: true, results: [] });
      });

      it('passes the provider excludePatterns to discovery', async () => {
        await service.startServerFileIngestion(baseServer as any, providerFor() as any);

        expect(mockFileDiscoveryService.discoverLogFiles).toHaveBeenCalledWith(
          ['/logs'],
          ['radarr.txt', 'radarr.*.txt'],
          ['*.debug.*', '*.trace.*']
        );
      });

      it('passes no excludes when the server has custom logFilePatterns', async () => {
        const server = { ...baseServer, logFilePatterns: ['*.txt'] };

        await service.startServerFileIngestion(server as any, providerFor() as any);

        expect(mockFileDiscoveryService.discoverLogFiles).toHaveBeenCalledWith(
          ['/logs'],
          ['*.txt'],
          []
        );
      });
    });

    describe('backfillFromFiles', () => {
      it('passes the provider excludePatterns to discovery', async () => {
        mockSelectServer(baseServer);

        await service.backfillFromFiles('server-1', providerFor() as any);

        expect(mockFileDiscoveryService.discoverLogFiles).toHaveBeenCalledWith(
          ['/logs'],
          ['radarr.txt', 'radarr.*.txt'],
          ['*.debug.*', '*.trace.*']
        );
      });

      it('passes no excludes when the server has custom logFilePatterns', async () => {
        mockSelectServer({ ...baseServer, logFilePatterns: ['*.txt'] });

        await service.backfillFromFiles('server-1', providerFor() as any);

        expect(mockFileDiscoveryService.discoverLogFiles).toHaveBeenCalledWith(
          ['/logs'],
          ['*.txt'],
          []
        );
      });
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle settings loading failure', async () => {
      mockSettingsService.getFileIngestionSettings.mockRejectedValue(new Error('Settings error'));

      // Should use defaults when settings fail to load
      const settings = await service['getSettings']();

      expect(settings).toBeDefined();
    });

    it('should handle batch buffer flushing errors', async () => {
      // Mock database insert failure
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockRejectedValue(new Error('Insert failed')),
          }),
        }),
      });

      // Should handle gracefully and fall back to individual inserts
      await service['flushBatchBuffer']();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle module destruction gracefully', async () => {
      service['flushBatchBuffer'] = vi.fn().mockResolvedValue(undefined);
      service.stopAllTailers = vi.fn().mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(service['flushBatchBuffer']).toHaveBeenCalled();
      expect(service.stopAllTailers).toHaveBeenCalled();
    });
  });
  describe('batch insert concurrency handling', () => {
    const makeEntry = (message: string, second = 0) => ({
      timestamp: new Date(Date.UTC(2024, 0, 1, 0, 0, second)),
      level: 'info' as const,
      message,
      source: 'src',
      raw: message,
    });

    /** Build a db.insert mock; each call to `.returning()` consumes the next behaviour. */
    function mockInsert(behaviours: Array<unknown | Error>) {
      const valuesSpy = vi.fn();
      const returning = vi.fn().mockImplementation(() => {
        const next = behaviours.shift();
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? []);
      });
      mockDb.insert.mockReturnValue({
        values: valuesSpy.mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
        }),
      });
      return { valuesSpy, returning };
    }

    const deadlock = () =>
      Object.assign(new Error('deadlock detected'), { code: '40P01', name: 'PostgresError' });

    beforeEach(() => {
      vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
      vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    it('de-duplicates and sorts rows by (serverId, deduplicationKey) before inserting', async () => {
      const { valuesSpy } = mockInsert([[]]);
      const a = makeEntry('alpha', 1);
      const b = makeEntry('bravo', 2);

      // Same entry twice (e.g. duplicated across debug/main log) plus reversed order
      service['queueEntryForBatch']('s1', b, '/logs/a.txt');
      service['queueEntryForBatch']('s1', a, '/logs/b.txt');
      service['queueEntryForBatch']('s1', b, '/logs/b.txt');
      await service['flushBatchBuffer']();

      const rows = valuesSpy.mock.calls[0]![0] as Array<{ deduplicationKey: string }>;
      expect(rows).toHaveLength(2);
      const keys = rows.map((r) => r.deduplicationKey);
      expect(keys).toEqual([...keys].sort());
    });

    it('inserts the same row order regardless of queue order', async () => {
      const { valuesSpy } = mockInsert([[], []]);
      const entries = [makeEntry('one', 1), makeEntry('two', 2), makeEntry('three', 3)];

      for (const e of entries) service['queueEntryForBatch']('s1', e, '/f');
      await service['flushBatchBuffer']();
      for (const e of [...entries].reverse()) service['queueEntryForBatch']('s1', e, '/f');
      await service['flushBatchBuffer']();

      const order = (i: number) =>
        (valuesSpy.mock.calls[i]![0] as Array<{ deduplicationKey: string }>).map(
          (r) => r.deduplicationKey
        );
      expect(order(0)).toEqual(order(1));
    });

    it('retries the batch on deadlock (40P01) and then succeeds without falling back', async () => {
      const { returning } = mockInsert([deadlock(), deadlock(), []]);
      const errorSpy = vi.spyOn(service['logger'], 'error');

      service['queueEntryForBatch']('s1', makeEntry('x'), '/f');
      await service['flushBatchBuffer']();

      expect(returning).toHaveBeenCalledTimes(3);
      expect(service['sleep']).toHaveBeenCalledTimes(2);
      // deterministic backoff (jitter pinned to 0): 25ms * attempt
      expect((service['sleep'] as any).mock.calls.map((c: number[]) => c[0])).toEqual([25, 50]);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('falls back to individual inserts after exhausting deadlock retries and logs the cause', async () => {
      // 1 initial + 3 retries fail, then the single-row fallback succeeds
      const { returning } = mockInsert([deadlock(), deadlock(), deadlock(), deadlock(), []]);
      const errorSpy = vi.spyOn(service['logger'], 'error');

      service['queueEntryForBatch']('s1', makeEntry('x'), '/f');
      await service['flushBatchBuffer']();

      expect(returning).toHaveBeenCalledTimes(5);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = errorSpy.mock.calls[0]![0] as string;
      expect(message).toContain('deadlock detected');
      expect(message).toContain('code=40P01');
    });

    it('does not retry non-deadlock errors', async () => {
      const err = Object.assign(new Error('connection reset'), { code: '08006' });
      const { returning } = mockInsert([err, []]);
      const errorSpy = vi.spyOn(service['logger'], 'error');

      service['queueEntryForBatch']('s1', makeEntry('x'), '/f');
      await service['flushBatchBuffer']();

      expect(service['sleep']).not.toHaveBeenCalled();
      expect(returning).toHaveBeenCalledTimes(2); // batch + single fallback
      expect(errorSpy.mock.calls[0]![0]).toContain('connection reset');
      expect(errorSpy.mock.calls[0]![0]).toContain('code=08006');
    });

    it('runs issue detection in the fallback only for rows the single insert actually inserted', async () => {
      const errEntry = { ...makeEntry('boom', 1), level: 'error' as const };
      const dupEntry = { ...makeEntry('dup', 2), level: 'error' as const };
      const row = (e: typeof errEntry, id: string) => ({
        id,
        serverId: 's1',
        timestamp: e.timestamp,
        level: e.level,
        message: e.message,
        source: 'src',
      });
      // batch fails (non-deadlock), then single inserts: first inserted, second skipped by conflict
      const { returning } = mockInsert([new Error('batch down'), [], []]);
      returning
        .mockReset()
        .mockRejectedValueOnce(new Error('batch down'))
        .mockResolvedValueOnce([row(errEntry, 'log-1')])
        .mockResolvedValueOnce([]);
      mockIssuesService.processLogEntryDetailed.mockResolvedValue({
        issueId: 'issue-1',
        created: true,
      });
      // occurrenceCount deliberately not 1: the broadcast must follow `created`, not the count
      mockIssuesService.findOne.mockResolvedValue({ id: 'issue-1', occurrenceCount: 7 });

      service['queueEntryForBatch']('s1', errEntry, '/f');
      service['queueEntryForBatch']('s1', dupEntry, '/f');
      await service['flushBatchBuffer']();

      expect(mockIssuesService.processLogEntryDetailed).toHaveBeenCalledTimes(1);
      expect(mockIssuesService.processLogEntryDetailed).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'log-1' })
      );
      expect(mockIssuesGateway.broadcastNewIssue).toHaveBeenCalledTimes(1);
      expect(mockLogsGateway.broadcastLog).toHaveBeenCalledTimes(1);
    });

    it('does not run issue detection in the fallback for info-level rows', async () => {
      const e = makeEntry('fine', 1);
      const returning = vi
        .fn()
        .mockRejectedValueOnce(new Error('batch down'))
        .mockResolvedValueOnce([
          { id: 'l', serverId: 's1', timestamp: e.timestamp, level: 'info', message: 'fine' },
        ]);
      mockDb.insert.mockReturnValue({
        values: vi
          .fn()
          .mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning }) }),
      });

      service['queueEntryForBatch']('s1', e, '/f');
      await service['flushBatchBuffer']();

      expect(mockIssuesService.processLogEntryDetailed).not.toHaveBeenCalled();
      expect(mockLogsGateway.broadcastLog).toHaveBeenCalledTimes(1);
    });

    it('a rejected flush does not poison the next one', async () => {
      // Non-Error rejection from the chain's perspective: make the whole batch+fallback path throw
      const returning = vi
        .fn()
        .mockRejectedValueOnce(new Error('batch down'))
        .mockResolvedValue([]);
      mockDb.insert.mockReturnValue({
        values: vi
          .fn()
          .mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning }) }),
      });
      vi.spyOn(service as any, 'flushEntries').mockRejectedValueOnce(new Error('flush blew up'));

      service['queueEntryForBatch']('s1', makeEntry('a', 1), '/f');
      await expect(service['flushBatchBuffer']()).rejects.toThrow('flush blew up');

      // the in-flight set is cleaned up and a subsequent flush still inserts
      expect(service['inFlightFlushes'].size).toBe(0);
      service['queueEntryForBatch']('s1', makeEntry('b', 2), '/f');
      await service['flushBatchBuffer']();
      expect(returning).toHaveBeenCalled();
    });

    it('a failed batch insert does not poison the insert chain', async () => {
      const returning = vi
        .fn()
        .mockRejectedValueOnce(new Error('batch down'))
        .mockResolvedValue([]);
      mockDb.insert.mockReturnValue({
        values: vi
          .fn()
          .mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning }) }),
      });
      service['queueEntryForBatch']('s1', makeEntry('a', 1), '/f');
      await service['flushBatchBuffer']();
      service['queueEntryForBatch']('s1', makeEntry('b', 2), '/f');
      await service['flushBatchBuffer']();
      // 1 failed batch + 1 fallback single + 1 later batch
      expect(returning).toHaveBeenCalledTimes(3);
    });

    it('onModuleDestroy waits for in-flight flushes before stopping tailers', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const order: string[] = [];
      vi.spyOn(service as any, 'flushEntries').mockImplementation(async () => {
        await gate;
        order.push('flush-done');
      });
      service.stopAllTailers = vi.fn().mockImplementation(async () => {
        order.push('tailers-stopped');
      });

      service['queueEntryForBatch']('s1', makeEntry('a', 1), '/f');
      void service['flushBatchBuffer'](); // in flight, blocked on gate
      await Promise.resolve();
      const destroyed = service.onModuleDestroy();
      await new Promise((r) => setTimeout(r, 5));
      expect(order).toEqual([]);

      release();
      await destroyed;
      expect(order).toEqual(['flush-done', 'tailers-stopped']);
    });

    it('bounds concurrent flushes and drains the buffer as slots free up', async () => {
      const max = service['MAX_IN_FLIGHT_FLUSHES'] as number;
      let active = 0;
      let peak = 0;
      const releases: Array<() => void> = [];
      const flushed: number[] = [];
      vi.spyOn(service as any, 'flushEntries').mockImplementation(async (...args: unknown[]) => {
        const e = args[0] as unknown[];
        active++;
        peak = Math.max(peak, active);
        flushed.push(e.length);
        await new Promise<void>((r) => releases.push(r));
        active--;
      });

      // fill far beyond what the allowed slots can take at once
      const batch = service['BATCH_SIZE'] as number;
      for (let i = 0; i < batch * (max + 3); i++) {
        service['queueEntryForBatch']('s1', makeEntry(`m${i}`, i % 50), '/f');
        // let triggered flushes start; each flush takes everything buffered so far
        if ((i + 1) % batch === 0) await Promise.resolve();
      }
      await new Promise((r) => setTimeout(r, 0));
      expect(service['inFlightFlushes'].size).toBeLessThanOrEqual(max);
      expect(peak).toBeLessThanOrEqual(max);

      // release everything repeatedly until drained
      for (let i = 0; i < 50 && (releases.length > 0 || service['batchBuffer'].length > 0); i++) {
        releases.splice(0).forEach((r) => r());
        await new Promise((r) => setTimeout(r, 0));
        if (service['batchBuffer'].length > 0 && service['inFlightFlushes'].size === 0) {
          void service['flushBatchBuffer']();
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      expect(peak).toBeLessThanOrEqual(max);
      expect(service['batchBuffer']).toHaveLength(0);
      expect(flushed.reduce((a, b) => a + b, 0)).toBe(batch * (max + 3));
    });

    it('never runs two batch inserts at the same time', async () => {
      let active = 0;
      let maxActive = 0;
      const returning = vi.fn().mockImplementation(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return [];
      });
      mockDb.insert.mockReturnValue({
        values: vi
          .fn()
          .mockReturnValue({ onConflictDoNothing: vi.fn().mockReturnValue({ returning }) }),
      });

      service['queueEntryForBatch']('s1', makeEntry('a', 1), '/f');
      const first = service['flushBatchBuffer']();
      service['queueEntryForBatch']('s1', makeEntry('b', 2), '/f');
      const second = service['flushBatchBuffer']();
      await Promise.all([first, second]);

      expect(returning).toHaveBeenCalledTimes(2);
      expect(maxActive).toBe(1);
    });
  });
});
