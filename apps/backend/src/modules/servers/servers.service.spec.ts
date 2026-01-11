import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';
import { FileIngestionService } from '../file-ingestion/file-ingestion.service';
import { IngestionService } from '../ingestion/ingestion.service';

import { ServersService } from './servers.service';

import type { TestingModule } from '@nestjs/testing';

describe('ServersService', () => {
  let service: ServersService;
  let mockDb: MockDb;

  const mockFileIngestionService = {
    restartServerFileIngestion: vi.fn(),
    stopServerFileIngestion: vi.fn(),
    validateLogPaths: vi.fn(),
    getStatus: vi.fn().mockReturnValue({ tailers: [] }),
    isServerWatching: vi.fn().mockReturnValue(false),
    resetServerState: vi.fn(),
  };

  const mockIngestionService = {
    getProviders: vi.fn().mockReturnValue(new Map()),
  };

  const mockServer = {
    id: 'server-1',
    name: 'My Jellyfin Server',
    providerId: 'jellyfin',
    url: 'http://localhost:8096',
    apiKey: 'test-api-key',
    logPath: '/var/log/jellyfin',
    isConnected: true,
    fileIngestionEnabled: false,
    logPaths: [],
    logFilePatterns: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServersService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: FileIngestionService, useValue: mockFileIngestionService },
        { provide: IngestionService, useValue: mockIngestionService },
      ],
    }).compile();

    service = module.get<ServersService>(ServersService);
  });

  describe('findAll', () => {
    it('should return all servers', async () => {
      const servers = [mockServer, { ...mockServer, id: 'server-2', name: 'Sonarr' }];
      configureMockDb(mockDb, { select: servers });

      const result = await service.findAll();

      expect(result).toEqual(servers);
    });

    it('should return empty array when no servers', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return server by id', async () => {
      configureMockDb(mockDb, { select: [mockServer] });

      const result = await service.findOne('server-1');

      expect(result).toEqual(mockServer);
    });

    it('should throw NotFoundException when server not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new server', async () => {
      configureMockDb(mockDb, { insert: [mockServer] });

      const dto = {
        name: 'My Jellyfin Server',
        providerId: 'jellyfin',
        url: 'http://localhost:8096',
        apiKey: 'test-api-key',
      };

      const result = await service.create(dto);

      expect(result).toEqual(mockServer);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw error for unknown provider', async () => {
      const dto = {
        name: 'Unknown Server',
        providerId: 'unknown-provider',
        url: 'http://localhost:9999',
        apiKey: 'test-key',
      };

      await expect(service.create(dto)).rejects.toThrow('Unknown provider');
    });

    it('should start file ingestion if enabled', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { insert: [serverWithIngestion], select: [serverWithIngestion] });

      const dto = {
        name: 'My Jellyfin Server',
        providerId: 'jellyfin',
        url: 'http://localhost:8096',
        apiKey: 'test-api-key',
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      await service.create(dto);

      // File ingestion is started asynchronously
    });
  });

  describe('update', () => {
    it('should update server and return updated data', async () => {
      const updatedServer = { ...mockServer, name: 'Updated Server' };

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        const result = callCount++ === 0 ? [mockServer] : [updatedServer];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      configureMockDb(mockDb, { update: [updatedServer] });

      const result = await service.update('server-1', { name: 'Updated Server' });

      expect(result.name).toBe('Updated Server');
    });

    it('should throw NotFoundException when updating non-existent server', async () => {
      configureMockDb(mockDb, { select: [], update: [] });

      await expect(service.update('non-existent', { name: 'Test' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('should restart file ingestion when settings change', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      mockDb.select = vi.fn().mockImplementation(() => {
        const result = [serverWithIngestion];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      configureMockDb(mockDb, { update: [serverWithIngestion] });

      await service.update('server-1', { logPaths: ['/new/path'] });

      expect(mockFileIngestionService.restartServerFileIngestion).toHaveBeenCalled();
    });

    it('should handle file ingestion restart error gracefully', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });
      mockFileIngestionService.restartServerFileIngestion.mockRejectedValue(
        new Error('Restart failed')
      );

      // Should not throw
      await service.update('server-1', { logPaths: ['/new/path'] });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should update connection status after file ingestion restart', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });
      mockFileIngestionService.getStatus.mockReturnValue({
        tailers: ['server-1:/var/log/jellyfin/log.txt'],
      });

      await service.update('server-1', { logPaths: ['/new/path'] });

      // Should update connection status in DB
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should disable file ingestion when turned off', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: false,
        logPaths: ['/var/log/jellyfin'],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) =>
            Promise.resolve([{ ...mockServer, fileIngestionEnabled: true }]).then(resolve)
          ),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });

      await service.update('server-1', { fileIngestionEnabled: false });

      expect(mockFileIngestionService.restartServerFileIngestion).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete server and return success', async () => {
      configureMockDb(mockDb, { select: [mockServer], delete: [mockServer] });

      const result = await service.delete('server-1');

      expect(result).toEqual({ success: true });
    });

    it('should stop file ingestion before deleting', async () => {
      configureMockDb(mockDb, { delete: [mockServer] });

      await service.delete('server-1');

      expect(mockFileIngestionService.stopServerFileIngestion).toHaveBeenCalledWith('server-1');
    });

    it('should throw NotFoundException when server not found', async () => {
      configureMockDb(mockDb, { delete: [] });

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('testConnection', () => {
    it('should test connection and return result', async () => {
      configureMockDb(mockDb, { select: [mockServer], update: [mockServer] });

      const result = await service.testConnection('server-1');

      expect(result).toHaveProperty('connected');
    });

    it('should return error for unknown provider', async () => {
      const serverWithUnknownProvider = { ...mockServer, providerId: 'unknown' };
      configureMockDb(mockDb, { select: [serverWithUnknownProvider] });

      const result = await service.testConnection('server-1');

      expect(result.connected).toBe(false);
      expect(result.error).toContain('Unknown provider');
    });

    it('should test file ingestion paths if enabled', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });
      mockFileIngestionService.validateLogPaths.mockResolvedValue({
        valid: true,
        results: [{ path: '/var/log/jellyfin', accessible: true }],
      });

      const result = await service.testConnection('server-1');

      expect(result).toHaveProperty('fileIngestion');
    });

    it('should update database with test results', async () => {
      configureMockDb(mockDb, { select: [mockServer], update: [mockServer] });

      await service.testConnection('server-1');

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle invalid file ingestion paths', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/invalid/path'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });
      mockFileIngestionService.validateLogPaths.mockResolvedValue({
        valid: false,
        results: [{ path: '/invalid/path', accessible: false, error: 'Path not found' }],
      });

      const result = await service.testConnection('server-1');

      expect(result.fileIngestion?.connected).toBe(false);
      expect(result.fileIngestion?.error).toContain('not accessible');
    });

    it('should report no log paths configured when enabled but empty', async () => {
      const serverWithNoLogPaths = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: [],
      };
      configureMockDb(mockDb, { select: [serverWithNoLogPaths], update: [serverWithNoLogPaths] });

      const result = await service.testConnection('server-1');

      expect(result.fileIngestion?.error).toContain('No log paths configured');
    });

    it('should handle file ingestion validation error', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });
      mockFileIngestionService.validateLogPaths.mockRejectedValue(new Error('Validation failed'));

      const result = await service.testConnection('server-1');

      expect(result.fileIngestion?.connected).toBe(false);
      expect(result.fileIngestion?.error).toBe('Validation failed');
    });

    it('should start file ingestion after successful path validation', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });
      mockFileIngestionService.validateLogPaths.mockResolvedValue({
        valid: true,
        results: [{ path: '/var/log/jellyfin', accessible: true }],
      });
      mockFileIngestionService.getStatus.mockReturnValue({ tailers: [] });

      await service.testConnection('server-1');

      expect(mockFileIngestionService.restartServerFileIngestion).toHaveBeenCalledWith(
        'server-1',
        expect.any(Map)
      );
    });

    it('should not restart file ingestion if already tailing', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });
      mockFileIngestionService.validateLogPaths.mockResolvedValue({
        valid: true,
        results: [{ path: '/var/log/jellyfin', accessible: true }],
      });
      // Already tailing for this server
      mockFileIngestionService.getStatus.mockReturnValue({
        tailers: ['server-1:/var/log/jellyfin/log.txt'],
      });

      await service.testConnection('server-1');

      expect(mockFileIngestionService.restartServerFileIngestion).not.toHaveBeenCalled();
    });

    it('should not restart file ingestion if already watching (sync complete)', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });
      mockFileIngestionService.validateLogPaths.mockResolvedValue({
        valid: true,
        results: [{ path: '/var/log/jellyfin', accessible: true }],
      });
      // No active tailers (sync completed, files are being watched)
      mockFileIngestionService.getStatus.mockReturnValue({ tailers: [] });
      // But server is already in watching state
      mockFileIngestionService.isServerWatching.mockReturnValue(true);

      await service.testConnection('server-1');

      expect(mockFileIngestionService.restartServerFileIngestion).not.toHaveBeenCalled();
    });

    it('should start file ingestion if not tailing and not watching', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });
      mockFileIngestionService.validateLogPaths.mockResolvedValue({
        valid: true,
        results: [{ path: '/var/log/jellyfin', accessible: true }],
      });
      // No active tailers
      mockFileIngestionService.getStatus.mockReturnValue({ tailers: [] });
      // Not watching either
      mockFileIngestionService.isServerWatching.mockReturnValue(false);

      await service.testConnection('server-1');

      expect(mockFileIngestionService.restartServerFileIngestion).toHaveBeenCalledWith(
        'server-1',
        expect.any(Map)
      );
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of available providers', () => {
      const providers = service.getAvailableProviders();

      expect(providers).toBeInstanceOf(Array);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should include jellyfin provider', () => {
      const providers = service.getAvailableProviders();

      const jellyfin = providers.find((p) => p.id === 'jellyfin');
      expect(jellyfin).toBeDefined();
      expect(jellyfin?.name).toBeDefined();
    });

    it('should include sonarr provider', () => {
      const providers = service.getAvailableProviders();

      const sonarr = providers.find((p) => p.id === 'sonarr');
      expect(sonarr).toBeDefined();
    });

    it('should include radarr provider', () => {
      const providers = service.getAvailableProviders();

      const radarr = providers.find((p) => p.id === 'radarr');
      expect(radarr).toBeDefined();
    });

    it('should include prowlarr provider', () => {
      const providers = service.getAvailableProviders();

      const prowlarr = providers.find((p) => p.id === 'prowlarr');
      expect(prowlarr).toBeDefined();
    });

    it('should include capabilities for each provider', () => {
      const providers = service.getAvailableProviders();

      for (const provider of providers) {
        expect(provider).toHaveProperty('capabilities');
      }
    });
  });

  describe('testAllConnections', () => {
    it('should test all server connections in parallel', async () => {
      const servers = [
        mockServer,
        { ...mockServer, id: 'server-2', name: 'Sonarr', providerId: 'sonarr' },
      ];

      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        // First call returns all servers, subsequent calls return individual servers
        const result = selectCallCount === 1 ? servers : [servers[(selectCallCount - 2) % 2]];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      configureMockDb(mockDb, { update: [mockServer] });

      const result = await service.testAllConnections();

      expect(result).toHaveProperty('server-1');
      expect(result).toHaveProperty('server-2');
    });

    it('should return empty object when no servers exist', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.testAllConnections();

      expect(result).toEqual({});
    });

    it('should handle individual connection test failures gracefully', async () => {
      const servers = [mockServer];

      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            then: vi.fn().mockImplementation((resolve) => Promise.resolve(servers).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          };
        }
        // Subsequent calls for individual server lookups
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          then: vi
            .fn()
            .mockImplementation((resolve) => Promise.resolve([mockServer]).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      configureMockDb(mockDb, { update: [mockServer] });

      const result = await service.testAllConnections();

      expect(result).toHaveProperty('server-1');
    });
  });

  describe('create with file ingestion error handling', () => {
    it('should handle file ingestion start error gracefully', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { insert: [serverWithIngestion], select: [serverWithIngestion] });
      mockFileIngestionService.restartServerFileIngestion.mockRejectedValue(
        new Error('Failed to start')
      );

      const dto = {
        name: 'My Jellyfin Server',
        providerId: 'jellyfin',
        url: 'http://localhost:8096',
        apiKey: 'test-api-key',
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      // Should not throw - file ingestion errors are logged but don't fail creation
      const result = await service.create(dto);

      expect(result).toBeDefined();
    });

    it('should log error when file ingestion fails to start for new server', async () => {
      const serverWithIngestion = {
        ...mockServer,
        id: 'new-server-123',
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { insert: [serverWithIngestion], select: [serverWithIngestion] });

      const testError = new Error('File ingestion startup failed');
      mockFileIngestionService.restartServerFileIngestion.mockRejectedValue(testError);

      const errorSpy = vi.spyOn(service['logger'], 'error');

      const dto = {
        name: 'My Jellyfin Server',
        providerId: 'jellyfin',
        url: 'http://localhost:8096',
        apiKey: 'test-api-key',
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      await service.create(dto);

      // Wait for async catch handler to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorSpy).toHaveBeenCalledWith(
        `Failed to start file ingestion for new server new-server-123:`,
        testError
      );
    });
  });

  describe('delete with file ingestion error handling', () => {
    it('should handle file ingestion stop error gracefully', async () => {
      configureMockDb(mockDb, { delete: [mockServer] });
      mockFileIngestionService.stopServerFileIngestion.mockRejectedValue(
        new Error('Failed to stop')
      );

      // Should not throw - file ingestion errors are logged but don't fail deletion
      const result = await service.delete('server-1');

      expect(result).toEqual({ success: true });
    });
  });

  describe('update with file ingestion status updates', () => {
    it('should set fileIngestionConnected to false when no log files found', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });
      // No tailers found after restart
      mockFileIngestionService.getStatus.mockReturnValue({ tailers: [] });

      await service.update('server-1', { logPaths: ['/new/path'] });

      // Should update with fileIngestionConnected: false
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should set fileIngestionConnected to true when tailers are active', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });
      // Tailers found after restart
      mockFileIngestionService.getStatus.mockReturnValue({
        tailers: ['server-1:/var/log/jellyfin/log.txt'],
      });

      await service.update('server-1', { logPaths: ['/new/path'] });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should clear fileIngestionError when file ingestion is disabled', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: false,
        logPaths: [],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) =>
            Promise.resolve([{ ...mockServer, fileIngestionEnabled: true }]).then(resolve)
          ),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });

      await service.update('server-1', { fileIngestionEnabled: false });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should detect file ingestion change when logFilePatterns changes', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
        logFilePatterns: ['*.log'],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });
      mockFileIngestionService.getStatus.mockReturnValue({ tailers: [] });

      await service.update('server-1', { logFilePatterns: ['*.txt'] });

      expect(mockFileIngestionService.restartServerFileIngestion).toHaveBeenCalled();
    });

    it('should log error and update database when file ingestion restart fails', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });

      const restartError = new Error('Restart failed due to permission denied');
      mockFileIngestionService.restartServerFileIngestion.mockRejectedValue(restartError);

      const errorSpy = vi.spyOn(service['logger'], 'error');

      await service.update('server-1', { logPaths: ['/new/path'] });

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to restart file ingestion for server server-1:',
        restartError
      );
      // Should update database with error status
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle non-Error exception during file ingestion restart', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });

      // Throw a non-Error value
      mockFileIngestionService.restartServerFileIngestion.mockRejectedValue('String error');

      await service.update('server-1', { logPaths: ['/new/path'] });

      // Should still update database with 'Unknown error'
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('testConnection', () => {
    it('should return unknown provider error when provider not found', async () => {
      configureMockDb(mockDb, { select: [{ ...mockServer, providerId: 'unknown-provider' }] });

      const result = await service.testConnection('server-1');

      expect(result.connected).toBe(false);
      expect(result.error).toContain('Unknown provider');
    });

    it('should update database when connection test succeeds with server info', async () => {
      const mockProvider = {
        id: 'jellyfin',
        name: 'Jellyfin',
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        testConnection: vi.fn().mockResolvedValue({
          connected: true,
          serverInfo: { name: 'My Server', version: '10.8.0', id: 'server-id' },
        }),
      };

      // Register the mock provider
      service['providers'].set('jellyfin', mockProvider as any);

      configureMockDb(mockDb, { select: [mockServer], update: [mockServer] });

      const result = await service.testConnection('server-1');

      expect(result.connected).toBe(true);
      expect(result.serverInfo).toEqual({ name: 'My Server', version: '10.8.0', id: 'server-id' });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle connection error and return error message', async () => {
      const mockProvider = {
        id: 'jellyfin',
        name: 'Jellyfin',
        connect: vi.fn().mockRejectedValue(new Error('Connection refused')),
        disconnect: vi.fn().mockResolvedValue(undefined),
        testConnection: vi.fn(),
      };

      service['providers'].set('jellyfin', mockProvider as any);

      configureMockDb(mockDb, { select: [mockServer] });

      const result = await service.testConnection('server-1');

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Connection refused');
    });

    it('should handle non-Error thrown during connection', async () => {
      const mockProvider = {
        id: 'jellyfin',
        name: 'Jellyfin',
        connect: vi.fn().mockRejectedValue('String error'),
        disconnect: vi.fn().mockResolvedValue(undefined),
        testConnection: vi.fn(),
      };

      service['providers'].set('jellyfin', mockProvider as any);

      configureMockDb(mockDb, { select: [mockServer] });

      const result = await service.testConnection('server-1');

      expect(result.connected).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('should always call disconnect in finally block after successful connection', async () => {
      const mockProvider = {
        id: 'jellyfin',
        name: 'Jellyfin',
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        testConnection: vi.fn().mockResolvedValue({
          connected: true,
          serverInfo: { name: 'Server', version: '1.0', id: 'id' },
        }),
      };

      service['providers'].set('jellyfin', mockProvider as any);
      configureMockDb(mockDb, { select: [mockServer], update: [mockServer] });

      await service.testConnection('server-1');

      expect(mockProvider.disconnect).toHaveBeenCalled();
    });

    it('should always call disconnect in finally block even after connection error', async () => {
      const mockProvider = {
        id: 'jellyfin',
        name: 'Jellyfin',
        connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        disconnect: vi.fn().mockResolvedValue(undefined),
        testConnection: vi.fn(),
      };

      service['providers'].set('jellyfin', mockProvider as any);
      configureMockDb(mockDb, { select: [mockServer], update: [mockServer] });

      await service.testConnection('server-1');

      expect(mockProvider.disconnect).toHaveBeenCalled();
    });

    it('should always call disconnect in finally block even after testConnection error', async () => {
      const mockProvider = {
        id: 'jellyfin',
        name: 'Jellyfin',
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        testConnection: vi.fn().mockRejectedValue(new Error('Test failed')),
      };

      service['providers'].set('jellyfin', mockProvider as any);
      configureMockDb(mockDb, { select: [mockServer], update: [mockServer] });

      await service.testConnection('server-1');

      expect(mockProvider.disconnect).toHaveBeenCalled();
    });
  });

  describe('startFileIngestionForServer', () => {
    it('should not start file ingestion when disabled', async () => {
      configureMockDb(mockDb, {
        select: [{ ...mockServer, fileIngestionEnabled: false, logPaths: [] }],
      });

      await service['startFileIngestionForServer']('server-1');

      expect(mockFileIngestionService.restartServerFileIngestion).not.toHaveBeenCalled();
    });

    it('should not start file ingestion when no log paths', async () => {
      configureMockDb(mockDb, {
        select: [{ ...mockServer, fileIngestionEnabled: true, logPaths: [] }],
      });

      await service['startFileIngestionForServer']('server-1');

      expect(mockFileIngestionService.restartServerFileIngestion).not.toHaveBeenCalled();
    });

    it('should start file ingestion when enabled with log paths', async () => {
      configureMockDb(mockDb, {
        select: [{ ...mockServer, fileIngestionEnabled: true, logPaths: ['/var/log'] }],
      });
      mockFileIngestionService.restartServerFileIngestion.mockResolvedValue(undefined);

      await service['startFileIngestionForServer']('server-1');

      expect(mockFileIngestionService.restartServerFileIngestion).toHaveBeenCalledWith(
        'server-1',
        expect.anything()
      );
    });
  });

  describe('resetFileIngestionState', () => {
    it('should return error when file ingestion is not enabled', async () => {
      const serverWithoutIngestion = {
        ...mockServer,
        fileIngestionEnabled: false,
      };
      configureMockDb(mockDb, { select: [serverWithoutIngestion] });

      const result = await service.resetFileIngestionState('server-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('File ingestion is not enabled for this server');
    });

    it('should successfully reset file ingestion state', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });

      mockFileIngestionService.stopServerFileIngestion.mockResolvedValue(undefined);
      mockFileIngestionService.resetServerState.mockResolvedValue(undefined);
      mockFileIngestionService.restartServerFileIngestion.mockResolvedValue(undefined);

      const result = await service.resetFileIngestionState('server-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('File ingestion state reset and restarted successfully');
      expect(mockFileIngestionService.stopServerFileIngestion).toHaveBeenCalledWith('server-1');
      expect(mockFileIngestionService.resetServerState).toHaveBeenCalledWith('server-1');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockFileIngestionService.restartServerFileIngestion).toHaveBeenCalled();
    });

    it('should handle errors during reset process', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion] });

      const resetError = new Error('Failed to reset state');
      mockFileIngestionService.stopServerFileIngestion.mockResolvedValue(undefined);
      mockFileIngestionService.resetServerState.mockRejectedValue(resetError);

      const result = await service.resetFileIngestionState('server-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to reset state');
    });

    it('should handle non-Error exceptions during reset', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion] });

      mockFileIngestionService.stopServerFileIngestion.mockResolvedValue(undefined);
      mockFileIngestionService.resetServerState.mockRejectedValue('String error');

      const result = await service.resetFileIngestionState('server-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Unknown error occurred');
    });

    it('should handle database update errors gracefully', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion] });

      mockFileIngestionService.stopServerFileIngestion.mockResolvedValue(undefined);
      mockFileIngestionService.resetServerState.mockResolvedValue(undefined);

      // Mock database update failure
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error('Database update failed')),
        }),
      });

      const result = await service.resetFileIngestionState('server-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Database update failed');
    });

    it('should handle restart file ingestion errors gracefully', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };
      configureMockDb(mockDb, { select: [serverWithIngestion], update: [serverWithIngestion] });

      mockFileIngestionService.stopServerFileIngestion.mockResolvedValue(undefined);
      mockFileIngestionService.resetServerState.mockResolvedValue(undefined);
      mockFileIngestionService.restartServerFileIngestion.mockRejectedValue(
        new Error('Restart failed')
      );

      const result = await service.resetFileIngestionState('server-1');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Restart failed');
    });
  });
});
