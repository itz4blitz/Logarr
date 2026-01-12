import { HttpService } from '@nestjs/axios';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb } from '../../test/mock-db';

import { ProxyService } from './proxy.service';

import type { TestingModule } from '@nestjs/testing';

describe('ProxyService', () => {
  let service: ProxyService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockHttpService: Partial<HttpService>;

  beforeEach(async () => {
    mockDb = createMockDb();
    vi.clearAllMocks();

    mockHttpService = {
      request: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxyService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<ProxyService>(ProxyService);
  });

  describe('getUserServers', () => {
    it('should return all enabled servers for user', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'My Sonarr',
          providerId: 'sonarr',
          url: 'http://localhost:8989',
          apiKey: 'abc123',
          isEnabled: true,
          status: 'online',
          lastChecked: new Date(),
        },
        {
          id: 'server-2',
          name: 'My Radarr',
          providerId: 'radarr',
          url: 'http://localhost:7878',
          apiKey: 'def456',
          isEnabled: true,
          status: 'online',
          lastChecked: new Date(),
        },
      ];

      configureMockDb(mockDb, { select: mockServers });

      const result = await service.getUserServers('user-123');

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('My Sonarr');
      expect(result[1]?.name).toBe('My Radarr');
    });

    it('should return empty array when no servers exist', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getUserServers('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('findUserServer', () => {
    it('should return server by ID', async () => {
      const mockServer = {
        id: 'server-123',
        name: 'Test Sonarr',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const result = await service.findUserServer('server-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('server-123');
      expect(result.name).toBe('Test Sonarr');
    });

    it('should throw NotFoundException when server not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.findUserServer('non-existent')).rejects.toThrow(NotFoundException);
      await expect(service.findUserServer('non-existent')).rejects.toThrow(
        'Server with ID non-existent not found'
      );
    });
  });

  describe('proxyRequest', () => {
    it('should proxy GET request successfully', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'My Sonarr',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = {
        data: { queue: [{ id: 1, name: 'Test Download' }] },
        status: 200,
      };

      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      const result = await service.proxyRequest('server-1', {
        endpoint: 'queue',
        method: 'GET',
      });

      expect(result).toEqual({ queue: [{ id: 1, name: 'Test Download' }] });
    });

    it('should proxy POST request with body', async () => {
      const mockServer = {
        id: 'server-2',
        name: 'My Radarr',
        providerId: 'radarr',
        url: 'http://localhost:7878',
        apiKey: 'radarr-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = {
        data: { id: 123, title: 'Test Movie' },
        status: 201,
      };

      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      const result = await service.proxyRequest('server-2', {
        endpoint: 'movie',
        method: 'POST',
        body: { title: 'Test Movie', tmdbId: 123, qualityProfileId: 1 },
      });

      expect(result).toEqual({ id: 123, title: 'Test Movie' });
    });

    it('should handle 4xx responses from target service', async () => {
      const mockServer = {
        id: 'server-3',
        name: 'My Sonarr',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = {
        data: { error: 'Series not found' },
        status: 404,
      };

      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      const result = await service.proxyRequest('server-3', {
        endpoint: 'series/123',
        method: 'GET',
      });

      expect(result).toEqual({ error: 'Series not found' });
    });

    it('should throw ForbiddenException for 401 errors', async () => {
      const mockServer = {
        id: 'server-4',
        name: 'Bad Auth Server',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'bad-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const error = new Error('Request failed with status code 401') as any;
      error.response = { status: 401 };

      vi.mocked(mockHttpService.request)!.mockReturnValue(throwError(() => error));

      await expect(
        service.proxyRequest('server-4', {
          endpoint: 'queue',
          method: 'GET',
        })
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.proxyRequest('server-4', {
          endpoint: 'queue',
          method: 'GET',
        })
      ).rejects.toThrow('Invalid API key for Bad Auth Server');
    });

    it('should throw ForbiddenException for 403 errors', async () => {
      const mockServer = {
        id: 'server-5',
        name: 'No Permission Server',
        providerId: 'radarr',
        url: 'http://localhost:7878',
        apiKey: 'limited-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const error = new Error('Request failed with status code 403') as any;
      error.response = { status: 403 };

      vi.mocked(mockHttpService.request)!.mockReturnValue(throwError(() => error));

      await expect(
        service.proxyRequest('server-5', {
          endpoint: 'movie',
          method: 'DELETE',
        })
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for ECONNREFUSED', async () => {
      const mockServer = {
        id: 'server-6',
        name: 'Offline Server',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const error = new Error('connect ECONNREFUSED') as any;
      error.code = 'ECONNREFUSED';

      vi.mocked(mockHttpService.request)!.mockReturnValue(throwError(() => error));

      await expect(
        service.proxyRequest('server-6', {
          endpoint: 'queue',
          method: 'GET',
        })
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.proxyRequest('server-6', {
          endpoint: 'queue',
          method: 'GET',
        })
      ).rejects.toThrow('Cannot reach Offline Server');
    });

    it('should throw NotFoundException for ENOTFOUND', async () => {
      const mockServer = {
        id: 'server-7',
        name: 'Wrong URL Server',
        providerId: 'radarr',
        url: 'http://wrong-url:7878',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const error = new Error('getaddrinfo ENOTFOUND') as any;
      error.code = 'ENOTFOUND';

      vi.mocked(mockHttpService.request)!.mockReturnValue(throwError(() => error));

      await expect(
        service.proxyRequest('server-7', {
          endpoint: 'queue',
          method: 'GET',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for ETIMEDOUT', async () => {
      const mockServer = {
        id: 'server-8',
        name: 'Slow Server',
        providerId: 'sonarr',
        url: 'http://slow-server:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const error = new Error('connect ETIMEDOUT') as any;
      error.code = 'ETIMEDOUT';

      vi.mocked(mockHttpService.request)!.mockReturnValue(throwError(() => error));

      await expect(
        service.proxyRequest('server-8', {
          endpoint: 'queue',
          method: 'GET',
        })
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.proxyRequest('server-8', {
          endpoint: 'queue',
          method: 'GET',
        })
      ).rejects.toThrow('Slow Server timed out');
    });

    it('should build correct URL for Sonarr', async () => {
      const mockServer = {
        id: 'server-sonarr',
        name: 'My Sonarr',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-sonarr', {
        endpoint: 'queue',
        method: 'GET',
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:8989/api/queue',
        })
      );
    });

    it('should build correct URL for Radarr', async () => {
      const mockServer = {
        id: 'server-radarr',
        name: 'My Radarr',
        providerId: 'radarr',
        url: 'http://localhost:7878',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-radarr', {
        endpoint: 'movie/123',
        method: 'GET',
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:7878/api/v3/movie/123',
        })
      );
    });

    it('should build correct URL for qBittorrent', async () => {
      const mockServer = {
        id: 'server-qbit',
        name: 'My qBittorrent',
        providerId: 'qbittorrent',
        url: 'http://localhost:8080',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-qbit', {
        endpoint: 'torrents/info',
        method: 'GET',
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:8080/api/v2/torrents/info',
        })
      );
    });

    it('should replace path parameters in URL', async () => {
      const mockServer = {
        id: 'server-sonarr',
        name: 'My Sonarr',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-sonarr', {
        endpoint: 'series/:id',
        method: 'GET',
        params: { id: '123' },
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:8989/api/series/123',
        })
      );
    });

    it('should replace brace-style path parameters', async () => {
      const mockServer = {
        id: 'server-radarr',
        name: 'My Radarr',
        providerId: 'radarr',
        url: 'http://localhost:7878',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-radarr', {
        endpoint: 'movie/{id}',
        method: 'GET',
        params: { id: '456' },
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:7878/api/v3/movie/456',
        })
      );
    });

    it('should include custom headers', async () => {
      const mockServer = {
        id: 'server-9',
        name: 'Custom Header Server',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'server-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-9', {
        endpoint: 'queue',
        method: 'GET',
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'server-key',
            'X-Custom-Header': 'custom-value',
          }),
        })
      );
    });

    it('should include query parameters', async () => {
      const mockServer = {
        id: 'server-10',
        name: 'Query Test Server',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-10', {
        endpoint: 'queue',
        method: 'GET',
        query: { page: '1', pageSize: '20' },
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { page: '1', pageSize: '20' },
        })
      );
    });

    it('should handle server URL with trailing slash', async () => {
      const mockServer = {
        id: 'server-11',
        name: 'Trailing Slash Server',
        providerId: 'radarr',
        url: 'http://localhost:7878/',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-11', {
        endpoint: 'queue',
        method: 'GET',
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:7878/api/v3/queue',
        })
      );
    });

    it('should handle endpoint with leading slash', async () => {
      const mockServer = {
        id: 'server-12',
        name: 'Leading Slash Test',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-12', {
        endpoint: '/queue',
        method: 'GET',
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:8989/api/queue',
        })
      );
    });

    it('should use default /api path for unknown providers', async () => {
      const mockServer = {
        id: 'server-13',
        name: 'Unknown Provider',
        providerId: 'unknown-provider',
        url: 'http://localhost:9999',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-13', {
        endpoint: 'test',
        method: 'GET',
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://localhost:9999/api/test',
        })
      );
    });

    it('should set 30 second timeout', async () => {
      const mockServer = {
        id: 'server-14',
        name: 'Timeout Test',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = { data: {}, status: 200 };
      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      await service.proxyRequest('server-14', {
        endpoint: 'queue',
        method: 'GET',
      });

      expect(mockHttpService.request).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 30000,
        })
      );
    });

    it('should treat 4xx status as success', async () => {
      const mockServer = {
        id: 'server-15',
        name: '4xx Test Server',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const mockResponse = {
        data: { error: 'Not found' },
        status: 404,
      };

      vi.mocked(mockHttpService.request)!.mockReturnValue(of(mockResponse as any));

      const result = await service.proxyRequest('server-15', {
        endpoint: 'series/999',
        method: 'GET',
      });

      expect(result).toEqual({ error: 'Not found' });
    });

    it('should throw generic error for unknown errors', async () => {
      const mockServer = {
        id: 'server-16',
        name: 'Error Server',
        providerId: 'sonarr',
        url: 'http://localhost:8989',
        apiKey: 'test-key',
        isEnabled: true,
      };

      configureMockDb(mockDb, { select: [mockServer] });

      const error = new Error('Unknown error');
      vi.mocked(mockHttpService.request)!.mockReturnValue(throwError(() => error));

      await expect(
        service.proxyRequest('server-16', {
          endpoint: 'queue',
          method: 'GET',
        })
      ).rejects.toThrow('Failed to reach Error Server: Unknown error');
    });
  });
});
