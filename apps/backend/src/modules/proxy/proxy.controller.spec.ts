import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ApiKeyGuard } from '../../guards/api-key.guard';
import { ApiKeysService } from '../api-keys/api-keys.service';

import { ProxyAuditService } from './proxy-audit.service';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

import type { TestingModule } from '@nestjs/testing';

describe('ProxyController', () => {
  let controller: ProxyController;
  let mockProxyService: ProxyService;
  let mockAuditService: ProxyAuditService;

  beforeEach(async () => {
    mockProxyService = {
      getUserServers: vi.fn(),
      proxyRequest: vi.fn(),
    } as unknown as ProxyService;

    mockAuditService = {
      logRequest: vi.fn(),
    } as unknown as ProxyAuditService;

    const mockApiKeysService = {
      validateApiKey: vi.fn(),
    } as unknown as ApiKeysService;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        {
          provide: ProxyService,
          useValue: mockProxyService,
        },
        {
          provide: ProxyAuditService,
          useValue: mockAuditService,
        },
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
        {
          provide: Reflector,
          useValue: {
            get: vi.fn(),
            getAll: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProxyController>(ProxyController);
  });

  describe('proxyRequest', () => {
    it('should proxy GET request successfully', async () => {
      const mockResponse = { queue: [{ id: 1, name: 'Test Download' }] };
      vi.mocked(mockProxyService.proxyRequest).mockResolvedValue(mockResponse);

      const result = await controller.proxyRequest(
        'server-1',
        {
          endpoint: 'queue',
          method: 'GET',
        },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        data: mockResponse,
        timestamp: expect.any(String),
      });
      expect(mockProxyService.proxyRequest).toHaveBeenCalledWith('server-1', {
        endpoint: 'queue',
        method: 'GET',
      });
      expect(mockAuditService.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: 'server-1',
          method: 'GET',
          endpoint: 'queue',
          statusCode: 200,
          success: true,
        })
      );
    });

    it('should proxy POST request with body', async () => {
      const mockResponse = { id: 123, title: 'Test Movie' };
      vi.mocked(mockProxyService.proxyRequest).mockResolvedValue(mockResponse);

      const result = await controller.proxyRequest(
        'server-2',
        {
          endpoint: 'movie',
          method: 'POST',
          body: { title: 'Test Movie', tmdbId: 123 },
        },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        data: mockResponse,
        timestamp: expect.any(String),
      });
      expect(mockProxyService.proxyRequest).toHaveBeenCalledWith('server-2', {
        endpoint: 'movie',
        method: 'POST',
        body: { title: 'Test Movie', tmdbId: 123 },
      });
      expect(mockAuditService.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: 'server-2',
          method: 'POST',
          endpoint: 'movie',
          statusCode: 200,
          success: true,
        })
      );
    });

    it('should proxy DELETE request', async () => {
      vi.mocked(mockProxyService.proxyRequest).mockResolvedValue(undefined);

      const result = await controller.proxyRequest(
        'server-3',
        {
          endpoint: 'queue/1',
          method: 'DELETE',
        },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        data: undefined,
        timestamp: expect.any(String),
      });
      expect(mockProxyService.proxyRequest).toHaveBeenCalledWith('server-3', {
        endpoint: 'queue/1',
        method: 'DELETE',
      });
    });

    it('should handle 404 errors from target service', async () => {
      const mockResponse = { error: 'Not found' };
      vi.mocked(mockProxyService.proxyRequest).mockResolvedValue(mockResponse);

      const result = await controller.proxyRequest(
        'server-4',
        {
          endpoint: 'series/999',
          method: 'GET',
        },
        {} as any
      );

      expect(result).toEqual({
        success: true,
        data: mockResponse,
        timestamp: expect.any(String),
      });
    });

    it('should throw errors and log failed request', async () => {
      const error = new Error('Server not found');
      vi.mocked(mockProxyService.proxyRequest).mockRejectedValue(error);

      await expect(
        controller.proxyRequest(
          'server-5',
          {
            endpoint: 'queue',
            method: 'GET',
          },
          {} as any
        )
      ).rejects.toThrow('Server not found');

      expect(mockAuditService.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          serverId: 'server-5',
          method: 'GET',
          endpoint: 'queue',
          success: false,
          errorMessage: 'Server not found',
        })
      );
    });

    it('should include audit log with response time', async () => {
      const mockResponse = { data: 'test' };
      vi.mocked(mockProxyService.proxyRequest).mockResolvedValue(mockResponse);

      await controller.proxyRequest(
        'server-8',
        {
          endpoint: 'test',
          method: 'GET',
        },
        {} as any
      );

      const auditCall = vi.mocked(mockAuditService.logRequest).mock.calls[0]?.[0];
      expect(auditCall).toBeDefined();
      expect(auditCall?.responseTime).toBeGreaterThanOrEqual(0);
      expect(auditCall?.responseTime).toBeLessThan(1000); // Should be fast
    });

    it('should include userId from request', async () => {
      const mockResponse = { data: 'test' };
      vi.mocked(mockProxyService.proxyRequest).mockResolvedValue(mockResponse);

      const mockReq = { user: { id: 'user-123' } };

      await controller.proxyRequest(
        'server-9',
        {
          endpoint: 'test',
          method: 'GET',
        },
        mockReq as any
      );

      const auditCall = vi.mocked(mockAuditService.logRequest).mock.calls[0]?.[0];
      expect(auditCall).toHaveProperty('userId', 'user-123');
    });

    it('should pass all request fields to service', async () => {
      const mockResponse = { data: 'test' };
      vi.mocked(mockProxyService.proxyRequest).mockResolvedValue(mockResponse);

      await controller.proxyRequest(
        'server-10',
        {
          endpoint: 'movie/:id',
          method: 'POST',
          params: { id: '123' },
          query: { force: 'true' },
          headers: { 'X-Custom': 'value' },
          body: { title: 'Test' },
        },
        {} as any
      );

      expect(mockProxyService.proxyRequest).toHaveBeenCalledWith('server-10', {
        endpoint: 'movie/:id',
        method: 'POST',
        params: { id: '123' },
        query: { force: 'true' },
        headers: { 'X-Custom': 'value' },
        body: { title: 'Test' },
      });
    });
  });

  describe('getServices', () => {
    it('should return all user services', async () => {
      const mockServices = [
        {
          id: 'server-1',
          name: 'My Sonarr',
          providerId: 'sonarr',
          url: 'http://localhost:8989',
          apiKey: 'test-key',
          isEnabled: true,
          status: 'online',
          lastChecked: new Date(),
        },
        {
          id: 'server-2',
          name: 'My Radarr',
          providerId: 'radarr',
          url: 'http://localhost:7878',
          apiKey: 'test-key',
          isEnabled: true,
          status: 'online',
          lastChecked: new Date(),
        },
      ];

      vi.mocked(mockProxyService.getUserServers).mockResolvedValue(mockServices);

      const result = await controller.getServices({} as any);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!).toEqual({
        id: 'server-1',
        name: 'My Sonarr',
        providerId: 'sonarr',
        status: 'online',
        lastChecked: mockServices[0]!.lastChecked,
      });
      expect(result.data[1]!).toEqual({
        id: 'server-2',
        name: 'My Radarr',
        providerId: 'radarr',
        status: 'online',
        lastChecked: mockServices[1]!.lastChecked,
      });
      expect(result.data[0]).not.toHaveProperty('url');
      expect(result.data[0]).not.toHaveProperty('apiKey');
    });

    it('should return empty array when no services exist', async () => {
      vi.mocked(mockProxyService.getUserServers).mockResolvedValue([]);

      const result = await controller.getServices({} as any);

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.data).toEqual([]);
    });

    it('should not expose sensitive service information', async () => {
      const mockServices = [
        {
          id: 'server-1',
          name: 'My Sonarr',
          providerId: 'sonarr',
          url: 'http://localhost:8989',
          apiKey: 'secret-key',
          isEnabled: true,
          status: 'online',
          lastChecked: new Date(),
        },
      ];

      vi.mocked(mockProxyService.getUserServers).mockResolvedValue(mockServices);

      const result = await controller.getServices({} as any);

      expect(result.data[0]).not.toHaveProperty('url');
      expect(result.data[0]).not.toHaveProperty('apiKey');
      expect(result.data[0]).not.toHaveProperty('isEnabled');
    });
  });
});
