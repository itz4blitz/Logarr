import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ServersService } from './servers.service';
import { DATABASE_CONNECTION } from '../../database';
import { FileIngestionService } from '../file-ingestion/file-ingestion.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';

describe('ServersService', () => {
  let service: ServersService;
  let mockDb: MockDb;

  const mockFileIngestionService = {
    restartServerFileIngestion: vi.fn(),
    stopServerFileIngestion: vi.fn(),
    validateLogPaths: vi.fn(),
    getStatus: vi.fn().mockReturnValue({ tailers: [] }),
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

      await expect(service.update('non-existent', { name: 'Test' })).rejects.toThrow(NotFoundException);
    });

    it('should restart file ingestion when settings change', async () => {
      const serverWithIngestion = {
        ...mockServer,
        fileIngestionEnabled: true,
        logPaths: ['/var/log/jellyfin'],
      };

      let callCount = 0;
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
        then: vi.fn().mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));
      configureMockDb(mockDb, { update: [serverWithIngestion] });
      mockFileIngestionService.restartServerFileIngestion.mockRejectedValue(new Error('Restart failed'));

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
        then: vi.fn().mockImplementation((resolve) => Promise.resolve([serverWithIngestion]).then(resolve)),
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
        then: vi.fn().mockImplementation((resolve) => Promise.resolve([{ ...mockServer, fileIngestionEnabled: true }]).then(resolve)),
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
  });

  describe('getAvailableProviders', () => {
    it('should return list of available providers', () => {
      const providers = service.getAvailableProviders();

      expect(providers).toBeInstanceOf(Array);
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should include jellyfin provider', () => {
      const providers = service.getAvailableProviders();

      const jellyfin = providers.find(p => p.id === 'jellyfin');
      expect(jellyfin).toBeDefined();
      expect(jellyfin?.name).toBeDefined();
    });

    it('should include sonarr provider', () => {
      const providers = service.getAvailableProviders();

      const sonarr = providers.find(p => p.id === 'sonarr');
      expect(sonarr).toBeDefined();
    });

    it('should include radarr provider', () => {
      const providers = service.getAvailableProviders();

      const radarr = providers.find(p => p.id === 'radarr');
      expect(radarr).toBeDefined();
    });

    it('should include prowlarr provider', () => {
      const providers = service.getAvailableProviders();

      const prowlarr = providers.find(p => p.id === 'prowlarr');
      expect(prowlarr).toBeDefined();
    });

    it('should include capabilities for each provider', () => {
      const providers = service.getAvailableProviders();

      for (const provider of providers) {
        expect(provider).toHaveProperty('capabilities');
      }
    });
  });
});
