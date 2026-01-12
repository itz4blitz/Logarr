import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';

import { ApiKeysService } from './api-keys.service';

import type { TestingModule } from '@nestjs/testing';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let mockDb: MockDb;

  beforeEach(async () => {
    mockDb = createMockDb();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  describe('createApiKey', () => {
    it('should create a new API key with correct format', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Device',
        keyHash: 'abc123',
        deviceInfo: 'iPhone 15 Pro',
        isEnabled: true,
        rateLimit: null,
        rateLimitTtl: null,
        lastUsedAt: null,
        lastUsedIp: null,
        requestCount: 0,
        scopes: [],
        expiresAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      configureMockDb(mockDb, { insert: [mockApiKey] });

      const result = await service.createApiKey({
        name: 'Test Device',
        deviceInfo: 'iPhone 15 Pro',
      });

      expect(result).toHaveProperty('key');
      expect(result.key).toMatch(/^lk_[a-f0-9]{8}_[a-f0-9]{64}$/);
      expect(result.apiKey).toEqual(mockApiKey);
    });

    it('should store API key with all provided properties', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Key',
        keyHash: 'abc123',
        deviceInfo: 'CI/CD Pipeline',
        isEnabled: true,
        rateLimit: 1000,
        rateLimitTtl: 60000,
        lastUsedAt: null,
        lastUsedIp: null,
        requestCount: 0,
        scopes: ['read', 'write'],
        expiresAt: new Date('2025-12-31'),
        notes: 'Production key',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      configureMockDb(mockDb, { insert: [mockApiKey] });

      const result = await service.createApiKey({
        name: 'Test Key',
        deviceInfo: 'CI/CD Pipeline',
        rateLimit: 1000,
        rateLimitTtl: 60000,
        scopes: ['read', 'write'],
        expiresAt: new Date('2025-12-31'),
        notes: 'Production key',
      });

      expect(result.apiKey.rateLimit).toBe(1000);
      expect(result.apiKey.scopes).toEqual(['read', 'write']);
    });

    it('should throw ConflictException on hash collision', async () => {
      const error = { code: '23505' };
      mockDb.insert = vi.fn().mockImplementation(() => {
        throw error;
      });

      await expect(
        service.createApiKey({
          name: 'Test',
        })
      ).rejects.toThrow(ConflictException);
    });

    it('should generate unique keys for multiple creations', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test',
        keyHash: 'hash',
        deviceInfo: null,
        isEnabled: true,
        rateLimit: null,
        rateLimitTtl: null,
        lastUsedAt: null,
        lastUsedIp: null,
        requestCount: 0,
        scopes: [],
        expiresAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      configureMockDb(mockDb, { insert: [mockApiKey] });

      const key1 = await service.createApiKey({ name: 'Test1' });
      const key2 = await service.createApiKey({ name: 'Test2' });

      expect(key1.key).not.toBe(key2.key);
    });
  });

  describe('validateApiKey', () => {
    it('should validate a correct API key format', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test',
        keyHash: 'abc123',
        isEnabled: true,
        requestCount: 0,
        scopes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      configureMockDb(mockDb, { select: [mockApiKey] });

      // Use the private hashKey method through the validation
      const testKey = 'lk_abc123de_' + 'f'.repeat(64);
      const result = await service.validateApiKey(testKey);

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockApiKey.id);
    });

    it('should return null for invalid key format', async () => {
      const result = await service.validateApiKey('invalid-key');
      expect(result).toBeNull();
    });

    it('should return null for key without lk_ prefix', async () => {
      const result = await service.validateApiKey('abc123_def456');
      expect(result).toBeNull();
    });

    it('should return null for disabled keys', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test',
        keyHash: 'abc123',
        isEnabled: false,
        requestCount: 0,
        scopes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      configureMockDb(mockDb, { select: [mockApiKey] });

      const testKey = 'lk_abc123de_' + 'f'.repeat(64);
      const result = await service.validateApiKey(testKey);

      expect(result).toBeNull();
    });

    it('should return null for expired keys', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test',
        keyHash: 'abc123',
        isEnabled: true,
        requestCount: 0,
        scopes: [],
        expiresAt: new Date('2020-01-01'),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      configureMockDb(mockDb, { select: [mockApiKey] });

      const testKey = 'lk_abc123de_' + 'f'.repeat(64);
      const result = await service.validateApiKey(testKey);

      expect(result).toBeNull();
    });

    it('should return null for non-existent keys', async () => {
      configureMockDb(mockDb, { select: [] });

      const testKey = 'lk_abc123de_' + 'f'.repeat(64);
      const result = await service.validateApiKey(testKey);

      expect(result).toBeNull();
    });

    it('should handle empty string key', async () => {
      const result = await service.validateApiKey('');
      expect(result).toBeNull();
    });

    it('should handle null/undefined key', async () => {
      const result1 = await service.validateApiKey(null as unknown as string);
      const result2 = await service.validateApiKey(undefined as unknown as string);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe('getAllApiKeys', () => {
    it('should return all API keys', async () => {
      const mockKeys = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Key 1',
          keyHash: 'hash1',
          isEnabled: true,
          requestCount: 10,
          scopes: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '987fcfed-cba9-8765-4321-155574277555',
          name: 'Key 2',
          keyHash: 'hash2',
          isEnabled: true,
          requestCount: 5,
          scopes: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      configureMockDb(mockDb, { select: mockKeys });

      const result = await service.getAllApiKeys();

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Key 1');
      expect(result[1]?.name).toBe('Key 2');
    });

    it('should return empty array when no keys exist', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getAllApiKeys();

      expect(result).toEqual([]);
    });
  });

  describe('getApiKeyById', () => {
    it('should return API key by ID', async () => {
      const mockKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Key',
        keyHash: 'hash',
        isEnabled: true,
        requestCount: 100,
        scopes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      configureMockDb(mockDb, { select: [mockKey] });

      const result = await service.getApiKeyById('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toBeDefined();
      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(result.name).toBe('Test Key');
    });

    it('should throw NotFoundException for non-existent ID', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.getApiKeyById('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateApiKey', () => {
    it('should update API key properties', async () => {
      const existingKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Old Name',
        keyHash: 'hash',
        deviceInfo: null,
        isEnabled: true,
        rateLimit: null,
        rateLimitTtl: null,
        lastUsedAt: null,
        lastUsedIp: null,
        requestCount: 0,
        scopes: [],
        expiresAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedKey = {
        ...existingKey,
        name: 'New Name',
        notes: 'Updated notes',
      };

      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        const result = selectCallCount++ === 0 ? [existingKey] : [updatedKey];
        const chain = {
          from: vi.fn().mockReturnValue({}),
          where: vi.fn().mockReturnValue({}),
          limit: vi.fn().mockReturnValue({}),
          orderBy: vi.fn().mockReturnValue({}),
          then: vi
            .fn()
            .mockImplementation((resolve: (value: unknown) => unknown) =>
              Promise.resolve(result).then(resolve)
            ),
          [Symbol.toStringTag]: 'Promise' as const,
        };

        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        chain.limit.mockReturnValue(chain);
        chain.orderBy.mockReturnValue(chain);

        return chain;
      });

      configureMockDb(mockDb, { update: [updatedKey] });

      const result = await service.updateApiKey('123e4567-e89b-12d3-a456-426614174000', {
        name: 'New Name',
        notes: 'Updated notes',
      });

      expect(result.name).toBe('New Name');
    });

    it('should throw NotFoundException when updating non-existent key', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.updateApiKey('non-existent-id', { name: 'New Name' })).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an existing API key', async () => {
      const mockKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test',
        keyHash: 'hash',
        isEnabled: true,
        requestCount: 0,
        scopes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      configureMockDb(mockDb, { select: [mockKey], delete: undefined });

      await expect(
        service.deleteApiKey('123e4567-e89b-12d3-a456-426614174000')
      ).resolves.not.toThrow();
    });

    it('should throw NotFoundException when deleting non-existent key', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.deleteApiKey('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateLastUsed', () => {
    it('should update last used timestamp and increment request count', async () => {
      mockDb.update = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await expect(service.updateLastUsed('key-id', '192.168.1.1')).resolves.not.toThrow();
    });
  });

  describe('logUsage', () => {
    it('should log successful API usage', async () => {
      mockDb.insert = vi.fn().mockResolvedValue(Promise.resolve());

      await expect(
        service.logUsage(
          'key-id',
          '/api/proxy/queue',
          'GET',
          200,
          150,
          true,
          undefined,
          '192.168.1.1',
          'ArrCaptain/1.0'
        )
      ).resolves.not.toThrow();
    });

    it('should log failed API usage', async () => {
      mockDb.insert = vi.fn().mockResolvedValue(Promise.resolve());

      await expect(
        service.logUsage(
          'key-id',
          '/api/proxy/queue',
          'POST',
          401,
          50,
          false,
          'Unauthorized',
          '192.168.1.1',
          'ArrCaptain/1.0'
        )
      ).resolves.not.toThrow();
    });

    it('should not throw errors when logging fails', async () => {
      mockDb.insert = vi.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      // Should not throw despite database error
      await expect(
        service.logUsage('key-id', '/api/proxy/queue', 'GET', 200, 100, true)
      ).resolves.not.toThrow();
    });
  });

  describe('getUsageStats', () => {
    it('should calculate usage statistics correctly', async () => {
      configureMockDb(mockDb, {
        select: [
          {
            total: 1000,
            success: 980,
            avgResponseTime: 245,
            errors: 20,
          },
        ],
      });

      const stats = await service.getUsageStats('key-id', 30);

      expect(stats.totalRequests).toBe(1000);
      expect(stats.successRate).toBe(98);
      expect(stats.avgResponseTime).toBe(245);
      expect(stats.errorCount).toBe(20);
    });

    it('should handle zero requests', async () => {
      configureMockDb(mockDb, {
        select: [
          {
            total: 0,
            success: 0,
            avgResponseTime: 0,
            errors: 0,
          },
        ],
      });

      const stats = await service.getUsageStats('key-id', 30);

      expect(stats.totalRequests).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it('should use default 30 days when not specified', async () => {
      configureMockDb(mockDb, {
        select: [
          {
            total: 100,
            success: 100,
            avgResponseTime: 200,
            errors: 0,
          },
        ],
      });

      await service.getUsageStats('key-id');

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should handle null stats result', async () => {
      configureMockDb(mockDb, {
        select: [],
      });

      const stats = await service.getUsageStats('key-id', 30);

      expect(stats.totalRequests).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.avgResponseTime).toBe(0);
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('getAuditLogs', () => {
    it('should return audit logs for an API key', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          keyId: 'key-id',
          endpoint: '/api/proxy/queue',
          method: 'GET',
          statusCode: 200,
          responseTime: 150,
          success: true,
          timestamp: new Date(),
        },
        {
          id: 'log-2',
          keyId: 'key-id',
          endpoint: '/api/proxy/history',
          method: 'POST',
          statusCode: 201,
          responseTime: 200,
          success: true,
          timestamp: new Date(),
        },
      ];

      configureMockDb(mockDb, { select: mockLogs });

      const result = await service.getAuditLogs('key-id', 100, 0);

      expect(result).toHaveLength(2);
      expect(result[0]?.endpoint).toBe('/api/proxy/queue');
    });

    it('should use default limit and offset', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getAuditLogs('key-id');

      expect(result).toEqual([]);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when no logs exist', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getAuditLogs('key-id', 50, 0);

      expect(result).toEqual([]);
    });

    it('should support pagination with offset', async () => {
      const mockLogs = [
        {
          id: 'log-3',
          keyId: 'key-id',
          endpoint: '/api/proxy/queue',
          method: 'GET',
          statusCode: 200,
          responseTime: 100,
          success: true,
          timestamp: new Date(),
        },
      ];

      configureMockDb(mockDb, { select: mockLogs });

      const result = await service.getAuditLogs('key-id', 10, 20);

      expect(result).toHaveLength(1);
    });
  });

  describe('createApiKey error handling', () => {
    it('should throw error when insert returns empty result', async () => {
      configureMockDb(mockDb, { insert: [] });

      await expect(
        service.createApiKey({
          name: 'Test',
        })
      ).rejects.toThrow('Failed to create API key');
    });

    it('should re-throw non-conflict errors', async () => {
      const error = new Error('Database connection failed');
      mockDb.insert = vi.fn().mockImplementation(() => {
        throw error;
      });

      await expect(
        service.createApiKey({
          name: 'Test',
        })
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('validateApiKey error handling', () => {
    it('should return null and log error on database failure', async () => {
      mockDb.select = vi.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      const testKey = 'lk_abc123de_' + 'f'.repeat(64);
      const result = await service.validateApiKey(testKey);

      expect(result).toBeNull();
    });
  });

  describe('updateApiKey error handling', () => {
    it('should throw NotFoundException when update returns empty', async () => {
      const existingKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test',
        keyHash: 'hash',
        isEnabled: true,
        requestCount: 0,
        scopes: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // First call returns existing key, update returns empty
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const result = selectCallCount === 1 ? [existingKey] : [];
        const chain = {
          from: vi.fn().mockReturnValue({}),
          where: vi.fn().mockReturnValue({}),
          limit: vi.fn().mockReturnValue({}),
          orderBy: vi.fn().mockReturnValue({}),
          then: vi
            .fn()
            .mockImplementation((resolve: (value: unknown) => unknown) =>
              Promise.resolve(result).then(resolve)
            ),
          [Symbol.toStringTag]: 'Promise' as const,
        };

        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        chain.limit.mockReturnValue(chain);
        chain.orderBy.mockReturnValue(chain);

        return chain;
      });

      configureMockDb(mockDb, { update: [] });

      await expect(
        service.updateApiKey('123e4567-e89b-12d3-a456-426614174000', { name: 'New Name' })
      ).rejects.toThrow(NotFoundException);
    });
  });
});
