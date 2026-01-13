import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { createMockDb } from '../../test/mock-db';
import { AuditService } from '../audit/audit.service';

import { ProxyAuditService } from './proxy-audit.service';

import type { TestingModule } from '@nestjs/testing';

describe('ProxyAuditService', () => {
  let service: ProxyAuditService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockAuditService: { createLog: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDb = createMockDb();
    mockAuditService = {
      createLog: vi.fn().mockResolvedValue(undefined),
    };
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyAuditService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<ProxyAuditService>(ProxyAuditService);
  });

  describe('logRequest', () => {
    it('should log successful request', async () => {
      const consoleSpy = vi.spyOn(service['logger'], 'log').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'My Sonarr',
        providerId: 'sonarr',
        method: 'GET',
        endpoint: 'queue',
        statusCode: 200,
        responseTime: 150,
        success: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith('Proxy: GET My Sonarr/queue - 200 (150ms)');
    });

    it('should log failed request', async () => {
      const consoleSpy = vi.spyOn(service['logger'], 'error').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'My Radarr',
        providerId: 'radarr',
        method: 'POST',
        endpoint: 'movie',
        responseTime: 500,
        success: false,
        errorMessage: 'Connection refused',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Proxy: POST My Radarr/movie - FAILED: Connection refused'
      );
    });

    it('should handle database insert errors gracefully', async () => {
      const consoleSpy = vi.spyOn(service['logger'], 'error').mockImplementation(() => {});

      // Make auditService.createLog throw to simulate error
      mockAuditService.createLog.mockRejectedValue(new Error('Database connection failed'));

      // Should not throw despite database error
      await expect(
        service.logRequest({
          userId: 'user-123',
          serverId: 'server-456',
          serverName: 'Test Server',
          providerId: 'sonarr',
          method: 'GET',
          endpoint: 'test',
          statusCode: 200,
          responseTime: 100,
          success: true,
        })
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to write audit log: Database connection failed'
      );
    });

    it('should handle request without status code', async () => {
      const consoleSpy = vi.spyOn(service['logger'], 'log').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'My qBittorrent',
        providerId: 'qbittorrent',
        method: 'POST',
        endpoint: 'torrents/pause',
        responseTime: 75,
        success: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Proxy: POST My qBittorrent/torrents/pause')
      );
    });

    it('should handle request without error message', async () => {
      const consoleSpy = vi.spyOn(service['logger'], 'error').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'Test Service',
        providerId: 'lidarr',
        method: 'DELETE',
        endpoint: 'album/123',
        statusCode: 404,
        responseTime: 200,
        success: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('FAILED: undefined'));
    });

    it('should include all required fields in log entry', async () => {
      const consoleSpy = vi.spyOn(service['logger'], 'log').mockImplementation(() => {});

      const entry = {
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'Integration Test',
        providerId: 'prowlarr',
        method: 'GET' as const,
        endpoint: 'search',
        statusCode: 200,
        responseTime: 300,
        success: true,
      };

      await service.logRequest(entry);

      expect(consoleSpy).toHaveBeenCalledWith(
        `Proxy: ${entry.method} ${entry.serverName}/${entry.endpoint} - ${entry.statusCode} (${entry.responseTime}ms)`
      );
    });

    it('should include ipAddress when provided', async () => {
      vi.spyOn(service['logger'], 'log').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'Test Server',
        providerId: 'sonarr',
        method: 'GET',
        endpoint: 'test',
        statusCode: 200,
        responseTime: 100,
        success: true,
        ipAddress: '192.168.1.100',
      });

      expect(mockAuditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '192.168.1.100',
        })
      );
    });

    it('should include userAgent when provided', async () => {
      vi.spyOn(service['logger'], 'log').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'Test Server',
        providerId: 'sonarr',
        method: 'GET',
        endpoint: 'test',
        statusCode: 200,
        responseTime: 100,
        success: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });

      expect(mockAuditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        })
      );
    });

    it('should include errorMessage when provided on failed request', async () => {
      vi.spyOn(service['logger'], 'error').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'Test Server',
        providerId: 'radarr',
        method: 'POST',
        endpoint: 'movie',
        responseTime: 500,
        success: false,
        errorMessage: 'Connection timeout',
      });

      expect(mockAuditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          errorMessage: 'Connection timeout',
        })
      );
    });

    it('should include all optional fields when provided together', async () => {
      vi.spyOn(service['logger'], 'log').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'Test Server',
        providerId: 'sonarr',
        method: 'GET',
        endpoint: 'test',
        statusCode: 200,
        responseTime: 100,
        success: true,
        ipAddress: '10.0.0.1',
        userAgent: 'TestAgent/1.0',
      });

      expect(mockAuditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.1',
          userAgent: 'TestAgent/1.0',
        })
      );
    });

    it('should not include optional fields when not provided', async () => {
      vi.spyOn(service['logger'], 'log').mockImplementation(() => {});

      await service.logRequest({
        userId: 'user-123',
        serverId: 'server-456',
        serverName: 'Test Server',
        providerId: 'sonarr',
        method: 'GET',
        endpoint: 'test',
        statusCode: 200,
        responseTime: 100,
        success: true,
      });

      const callArg = mockAuditService.createLog.mock.calls[0]?.[0];
      expect(callArg).toBeDefined();
      expect(callArg).not.toHaveProperty('ipAddress');
      expect(callArg).not.toHaveProperty('userAgent');
      expect(callArg).not.toHaveProperty('errorMessage');
    });

    it('should handle non-Error exception in catch block', async () => {
      const consoleSpy = vi.spyOn(service['logger'], 'error').mockImplementation(() => {});

      // Make auditService.createLog throw a non-Error value
      mockAuditService.createLog.mockRejectedValue('String error');

      await expect(
        service.logRequest({
          userId: 'user-123',
          serverId: 'server-456',
          serverName: 'Test Server',
          providerId: 'sonarr',
          method: 'GET',
          endpoint: 'test',
          statusCode: 200,
          responseTime: 100,
          success: true,
        })
      ).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to write audit log: Unknown error');
    });
  });
});
