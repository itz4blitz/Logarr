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
});
