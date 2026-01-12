import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';

import type { TestingModule } from '@nestjs/testing';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let mockApiKeysService: ApiKeysService;

  beforeEach(async () => {
    mockApiKeysService = {
      createApiKey: vi.fn(),
      getAllApiKeys: vi.fn(),
      getApiKeyById: vi.fn(),
      updateApiKey: vi.fn(),
      deleteApiKey: vi.fn(),
      getUsageStats: vi.fn(),
    } as unknown as ApiKeysService;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
      ],
    }).compile();

    controller = module.get<ApiKeysController>(ApiKeysController);
  });

  describe('createApiKey', () => {
    it('should create an API key with minimal fields', async () => {
      const mockResult = {
        key: 'lk_abc123de_' + 'f'.repeat(64),
        apiKey: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test Device',
          type: 'mobile' as const,
          isEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deviceInfo: null,
          rateLimit: null,
          rateLimitTtl: null,
          lastUsedAt: null,
          lastUsedIp: null,
          requestCount: 0,
          scopes: [],
          expiresAt: null,
          notes: null,
          keyHash: 'hash1',
        },
      };

      vi.mocked(mockApiKeysService.createApiKey).mockResolvedValue(mockResult);

      const dto = {
        name: 'Test Device',
        type: 'mobile' as const,
      };

      const result = await controller.createApiKey(dto);

      expect(result).toEqual(mockResult);
      expect(mockApiKeysService.createApiKey).toHaveBeenCalledWith({
        name: 'Test Device',
      });
    });

    it('should create an API key with all optional fields', async () => {
      const mockResult = {
        key: 'lk_abc123de_' + 'f'.repeat(64),
        apiKey: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Integration Key',
          type: 'integration' as const,
          deviceInfo: 'CI/CD Pipeline',
          isEnabled: true,
          rateLimit: 1000,
          rateLimitTtl: 60000,
          scopes: ['read', 'write'],
          expiresAt: new Date('2025-12-31'),
          notes: 'Production key',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: null,
          lastUsedIp: null,
          requestCount: 0,
          keyHash: 'hash2',
        },
      };

      vi.mocked(mockApiKeysService.createApiKey).mockResolvedValue(mockResult);

      const dto = {
        name: 'Integration Key',
        type: 'integration' as const,
        deviceInfo: 'CI/CD Pipeline',
        rateLimit: 1000,
        rateLimitTtl: 60000,
        scopes: ['read', 'write'],
        expiresAt: '2025-12-31',
        notes: 'Production key',
      };

      const result = await controller.createApiKey(dto);

      expect(result).toEqual(mockResult);
      expect(mockApiKeysService.createApiKey).toHaveBeenCalledWith({
        name: 'Integration Key',
        deviceInfo: 'CI/CD Pipeline',
        rateLimit: 1000,
        rateLimitTtl: 60000,
        scopes: ['read', 'write'],
        expiresAt: new Date('2025-12-31'),
        notes: 'Production key',
      });
    });

    it('should filter out empty strings but not whitespace from optional fields', async () => {
      const mockResult = {
        key: 'lk_abc123de_' + 'f'.repeat(64),
        apiKey: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test',
          type: 'web' as const,
          isEnabled: true,
          deviceInfo: null,
          notes: '  ', // Controller doesn't trim, only checks for empty string
          createdAt: new Date(),
          updatedAt: new Date(),
          rateLimit: null,
          rateLimitTtl: null,
          lastUsedAt: null,
          lastUsedIp: null,
          requestCount: 0,
          scopes: [],
          expiresAt: null,
          keyHash: 'hash123',
        },
      };

      vi.mocked(mockApiKeysService.createApiKey).mockResolvedValue(mockResult);

      const dto = {
        name: 'Test',
        type: 'web' as const,
        deviceInfo: '',
        notes: '  ',
      };

      await controller.createApiKey(dto);

      expect(mockApiKeysService.createApiKey).toHaveBeenCalledWith({
        name: 'Test',
        notes: '  ',
      });
    });

    it('should filter out null values from optional fields', async () => {
      const mockResult = {
        key: 'lk_abc123de_' + 'f'.repeat(64),
        apiKey: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test',
          type: 'cli' as const,
          isEnabled: true,
          deviceInfo: null,
          rateLimit: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          rateLimitTtl: null,
          lastUsedAt: null,
          lastUsedIp: null,
          requestCount: 0,
          scopes: [],
          expiresAt: null,
          notes: null,
          keyHash: 'hash456',
        },
      };

      vi.mocked(mockApiKeysService.createApiKey).mockResolvedValue(mockResult);

      const dto = {
        name: 'Test',
        type: 'cli' as const,
      };

      await controller.createApiKey(dto);

      expect(mockApiKeysService.createApiKey).toHaveBeenCalledWith({
        name: 'Test',
      });
    });
  });

  describe('getAllApiKeys', () => {
    it('should return all API keys without sensitive data', async () => {
      const mockKeys = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Mobile Key',
          type: 'mobile' as const,
          deviceInfo: 'iPhone 15 Pro',
          isEnabled: true,
          rateLimit: null,
          rateLimitTtl: null,
          lastUsedAt: new Date('2024-01-09'),
          lastUsedIp: '192.168.1.1',
          requestCount: 42,
          scopes: [],
          expiresAt: null,
          notes: null,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-09'),
          keyHash: 'should-be-removed',
        },
        {
          id: '987fcfed-cba9-8765-4321-155574277555',
          name: 'Web Key',
          type: 'web' as const,
          deviceInfo: null,
          isEnabled: true,
          rateLimit: 1000,
          rateLimitTtl: 60000,
          lastUsedAt: null,
          lastUsedIp: null,
          requestCount: 0,
          scopes: ['read'],
          expiresAt: new Date('2025-12-31'),
          notes: 'Test key',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
          keyHash: 'should-also-be-removed',
        },
      ];

      vi.mocked(mockApiKeysService.getAllApiKeys).mockResolvedValue(mockKeys);

      const result = await controller.getAllApiKeys();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Mobile Key',
        deviceInfo: 'iPhone 15 Pro',
        isEnabled: true,
        rateLimit: null,
        rateLimitTtl: null,
        lastUsedAt: new Date('2024-01-09'),
        lastUsedIp: '192.168.1.1',
        requestCount: 42,
        scopes: [],
        expiresAt: null,
        notes: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-09'),
      });
      expect(result[0]).not.toHaveProperty('keyHash');
    });

    it('should return empty array when no keys exist', async () => {
      vi.mocked(mockApiKeysService.getAllApiKeys).mockResolvedValue([]);

      const result = await controller.getAllApiKeys();

      expect(result).toEqual([]);
    });
  });

  describe('getApiKey', () => {
    it('should return API key by ID without sensitive data', async () => {
      const mockKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Key',
        type: 'integration' as const,
        deviceInfo: 'CI/CD',
        isEnabled: true,
        rateLimit: 500,
        rateLimitTtl: 30000,
        lastUsedAt: new Date('2024-01-09'),
        lastUsedIp: '10.0.0.1',
        requestCount: 100,
        scopes: ['read', 'write', 'delete'],
        expiresAt: new Date('2025-06-30'),
        notes: 'Production integration',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-09'),
        keyHash: 'must-not-appear',
      };

      vi.mocked(mockApiKeysService.getApiKeyById).mockResolvedValue(mockKey);

      const result = await controller.getApiKey('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Key',
        deviceInfo: 'CI/CD',
        isEnabled: true,
        rateLimit: 500,
        rateLimitTtl: 30000,
        lastUsedAt: new Date('2024-01-09'),
        lastUsedIp: '10.0.0.1',
        requestCount: 100,
        scopes: ['read', 'write', 'delete'],
        expiresAt: new Date('2025-06-30'),
        notes: 'Production integration',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-09'),
      });
      expect(result).not.toHaveProperty('keyHash');
    });

    it('should throw NotFoundException when key does not exist', async () => {
      vi.mocked(mockApiKeysService.getApiKeyById).mockRejectedValue(
        new NotFoundException('API key with ID non-existent not found')
      );

      await expect(controller.getApiKey('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getApiKeyStats', () => {
    it('should return usage statistics with default 30 days', async () => {
      const mockStats = {
        totalRequests: 5000,
        successRate: 98.5,
        avgResponseTime: 245,
        errorCount: 75,
      };

      vi.mocked(mockApiKeysService.getUsageStats).mockResolvedValue(mockStats);

      const result = await controller.getApiKeyStats('key-id', undefined);

      expect(result).toEqual(mockStats);
      expect(mockApiKeysService.getUsageStats).toHaveBeenCalledWith('key-id', 30);
    });

    it('should return usage statistics with custom days parameter', async () => {
      const mockStats = {
        totalRequests: 1000,
        successRate: 95,
        avgResponseTime: 320,
        errorCount: 50,
      };

      vi.mocked(mockApiKeysService.getUsageStats).mockResolvedValue(mockStats);

      const result = await controller.getApiKeyStats('key-id', '7');

      expect(result).toEqual(mockStats);
      expect(mockApiKeysService.getUsageStats).toHaveBeenCalledWith('key-id', 7);
    });

    it('should handle empty string days parameter', async () => {
      const mockStats = {
        totalRequests: 100,
        successRate: 100,
        avgResponseTime: 150,
        errorCount: 0,
      };

      vi.mocked(mockApiKeysService.getUsageStats).mockResolvedValue(mockStats);

      await controller.getApiKeyStats('key-id', '');

      expect(mockApiKeysService.getUsageStats).toHaveBeenCalledWith('key-id', 30);
    });

    it('should handle null days parameter', async () => {
      const mockStats = {
        totalRequests: 200,
        successRate: 99,
        avgResponseTime: 200,
        errorCount: 2,
      };

      vi.mocked(mockApiKeysService.getUsageStats).mockResolvedValue(mockStats);

      await controller.getApiKeyStats('key-id', null as unknown as string);

      expect(mockApiKeysService.getUsageStats).toHaveBeenCalledWith('key-id', 30);
    });
  });

  describe('updateApiKey', () => {
    it('should update API key with provided fields', async () => {
      const mockKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Updated Name',
        type: 'mobile' as const,
        deviceInfo: 'New Device',
        isEnabled: false,
        rateLimit: 2000,
        rateLimitTtl: 120000,
        lastUsedAt: null,
        lastUsedIp: null,
        requestCount: 0,
        scopes: ['admin'],
        expiresAt: new Date('2025-12-31'),
        notes: 'Updated notes',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-09'),
        keyHash: 'hash',
      };

      vi.mocked(mockApiKeysService.updateApiKey).mockResolvedValue(mockKey);

      const dto = {
        name: 'Updated Name',
        isEnabled: false,
        rateLimit: 2000,
        rateLimitTtl: 120000,
        scopes: ['admin'],
        expiresAt: '2025-12-31',
        notes: 'Updated notes',
      };

      const result = await controller.updateApiKey('123e4567-e89b-12d3-a456-426614174000', dto);

      expect(result).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Updated Name',
        deviceInfo: 'New Device',
        isEnabled: false,
        rateLimit: 2000,
        rateLimitTtl: 120000,
        lastUsedAt: null,
        lastUsedIp: null,
        requestCount: 0,
        scopes: ['admin'],
        expiresAt: new Date('2025-12-31'),
        notes: 'Updated notes',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-09'),
      });
      expect(result).not.toHaveProperty('keyHash');
    });

    it('should filter out empty strings but not whitespace from update DTO', async () => {
      const mockKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Key',
        type: 'mobile' as const,
        deviceInfo: null,
        isEnabled: true,
        rateLimit: null,
        rateLimitTtl: null,
        lastUsedAt: null,
        lastUsedIp: null,
        requestCount: 0,
        scopes: [],
        expiresAt: null,
        notes: '  ', // Controller doesn't trim, only checks for empty string
        createdAt: new Date(),
        updatedAt: new Date(),
        keyHash: 'hash',
      };

      vi.mocked(mockApiKeysService.updateApiKey).mockResolvedValue(mockKey);

      const dto = {
        name: '',
        notes: '  ',
        expiresAt: '',
      };

      await controller.updateApiKey('123e4567-e89b-12d3-a456-426614174000', dto);

      expect(mockApiKeysService.updateApiKey).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        {
          notes: '  ',
        }
      );
    });

    it('should filter out null values from update DTO', async () => {
      const mockKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Key',
        type: 'mobile' as const,
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
        keyHash: 'hash',
      };

      vi.mocked(mockApiKeysService.updateApiKey).mockResolvedValue(mockKey);

      const dto: Partial<Record<string, unknown>> = {
        name: undefined,
        isEnabled: undefined,
        rateLimit: undefined,
      };

      await controller.updateApiKey('123e4567-e89b-12d3-a456-426614174000', dto);

      expect(mockApiKeysService.updateApiKey).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        {}
      );
    });

    it('should throw NotFoundException when updating non-existent key', async () => {
      vi.mocked(mockApiKeysService.updateApiKey).mockRejectedValue(
        new NotFoundException('API key with ID non-existent not found')
      );

      await expect(controller.updateApiKey('non-existent', { name: 'New Name' })).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an existing API key', async () => {
      vi.mocked(mockApiKeysService.deleteApiKey).mockResolvedValue(undefined);

      await expect(
        controller.deleteApiKey('123e4567-e89b-12d3-a456-426614174000')
      ).resolves.not.toThrow();

      expect(mockApiKeysService.deleteApiKey).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000'
      );
    });

    it('should throw NotFoundException when deleting non-existent key', async () => {
      vi.mocked(mockApiKeysService.deleteApiKey).mockRejectedValue(
        new NotFoundException('API key with ID non-existent not found')
      );

      await expect(controller.deleteApiKey('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
