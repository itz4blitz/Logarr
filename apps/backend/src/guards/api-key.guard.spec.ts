import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { describe, expect, vi, beforeEach, it } from 'vitest';

import { ApiKeysService } from '../modules/api-keys/api-keys.service';

import { ApiKeyGuard } from './api-key.guard';

type MockRequest = {
  headers: Record<string, string | null | undefined>;
  apiKey?:
    | {
        id: string;
        name: string;
        type: string;
        rateLimit?: number | null;
        rateLimitTtl?: number | null;
      }
    | undefined;
  existingProperty?: string;
  [key: string]: unknown;
};

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockApiKeysService: ApiKeysService;
  let mockContext: ExecutionContext;

  beforeEach(async () => {
    mockApiKeysService = {
      validateApiKey: vi.fn(),
    } as unknown as ApiKeysService;

    const module = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
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
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);

    // Mock execution context with both getRequest and getResponse
    const mockResponse = {
      statusCode: 200,
      on: vi.fn(),
    };

    mockContext = {
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn(),
        getResponse: vi.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ExecutionContext;
  });

  describe('canActivate', () => {
    it('should allow access with valid API key', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Device',
        keyHash: 'hash',
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

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
        },
        apiKey: undefined,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key'] as string
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.apiKey).toEqual({
        id: mockApiKey.id,
        name: mockApiKey.name,
      });
    });

    it('should throw UnauthorizedException when no API key provided', async () => {
      const mockRequest: MockRequest = {
        headers: {},
        apiKey: undefined,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(undefined);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'API key is required. Use X-API-Key header.'
      );
    });

    it('should throw UnauthorizedException for empty API key', async () => {
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': '',
        },
        apiKey: undefined,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue('');

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid API key', async () => {
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_invalid_' + 'a'.repeat(64),
        },
        apiKey: undefined,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key']
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(null);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
      await expect(guard.canActivate(mockContext)).rejects.toThrow('Invalid or expired API key');
    });

    it('should throw UnauthorizedException for disabled API key', async () => {
      // Disabled keys return null from validateApiKey (handled by service layer)
      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
        },
        apiKey: undefined,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key']
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(null);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should include rate limit in request.apiKey when present', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Device',
        keyHash: 'hash',
        deviceInfo: 'iPhone 15 Pro',
        isEnabled: true,
        rateLimit: 1000,
        rateLimitTtl: 60000,
        lastUsedAt: null,
        lastUsedIp: null,
        requestCount: 0,
        scopes: [],
        expiresAt: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
        },
        apiKey: undefined,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key']
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      await guard.canActivate(mockContext);

      expect(mockRequest.apiKey).toEqual({
        id: mockApiKey.id,
        name: mockApiKey.name,
        rateLimit: 1000,
        rateLimitTtl: 60000,
      });
    });

    it('should handle null rate limits correctly', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Device',
        keyHash: 'hash',
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

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
        },
        apiKey: undefined,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key']
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      await guard.canActivate(mockContext);

      expect(mockRequest.apiKey).toEqual({
        id: mockApiKey.id,
        name: mockApiKey.name,
      });
      expect(mockRequest.apiKey).not.toHaveProperty('rateLimit');
      expect(mockRequest.apiKey).not.toHaveProperty('rateLimitTtl');
    });

    it('should handle all API key types', async () => {
      const types = ['mobile', 'web', 'cli', 'integration'] as const;

      for (const type of types) {
        const mockApiKey = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: `${type} Key`,
          keyHash: 'hash',
          deviceInfo: 'Test Device',
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

        const mockRequest: MockRequest = {
          headers: {
            'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
          },
          apiKey: undefined,
        };

        vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
          mockRequest.headers['x-api-key']
        );
        vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

        (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

        const result = await guard.canActivate(mockContext);

        expect(result).toBe(true);
        expect(mockRequest.apiKey?.name).toBe(`${type} Key`);
      }
    });
  });

  describe('extractApiKeyFromHeader', () => {
    it('should extract API key from header', () => {
      const mockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
        },
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractApiKeyFromHeader(mockRequest);

      expect(result).toBe('lk_abc123de_' + 'f'.repeat(64));
    });

    it('should return undefined when header is missing', () => {
      const mockRequest = {
        headers: {},
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractApiKeyFromHeader(mockRequest);

      expect(result).toBeUndefined();
    });

    it('should return undefined when header is null', () => {
      const mockRequest = {
        headers: {
          'x-api-key': null,
        },
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractApiKeyFromHeader(mockRequest);

      expect(result).toBeUndefined();
    });

    it('should return undefined when header is empty string', () => {
      const mockRequest = {
        headers: {
          'x-api-key': '',
        },
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractApiKeyFromHeader(mockRequest);

      expect(result).toBeUndefined();
    });

    it('should trim whitespace from API key', () => {
      const mockRequest = {
        headers: {
          'x-api-key': '  lk_abc123de_' + 'f'.repeat(64) + '  ',
        },
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractApiKeyFromHeader(mockRequest);

      expect(result).toBe('lk_abc123de_' + 'f'.repeat(64));
    });

    it('should handle case-sensitive header name', () => {
      const mockRequest = {
        headers: {
          'X-API-KEY': 'lk_abc123de_' + 'f'.repeat(64),
        },
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractApiKeyFromHeader(mockRequest);

      // Note: The guard looks for lowercase 'x-api-key' specifically
      // Express headers are typically lowercase, but this documents the behavior
      expect(result).toBeUndefined();
    });

    it('should return undefined for non-string header values', () => {
      const mockRequest = {
        headers: {
          'x-api-key': ['key1', 'key2'],
        },
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractApiKeyFromHeader(mockRequest);

      expect(result).toBeUndefined();
    });
  });

  describe('extractIpAddress', () => {
    it('should extract IP from x-forwarded-for header (string)', () => {
      const mockRequest = {
        headers: {
          'x-forwarded-for': '192.168.1.100, 10.0.0.1',
        },
        ip: '127.0.0.1',
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractIpAddress(mockRequest);

      expect(result).toBe('192.168.1.100');
    });

    it('should extract IP from x-forwarded-for header (array)', () => {
      const mockRequest = {
        headers: {
          'x-forwarded-for': ['10.0.0.50', '192.168.1.1'],
        },
        ip: '127.0.0.1',
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractIpAddress(mockRequest);

      expect(result).toBe('10.0.0.50');
    });

    it('should extract IP from x-real-ip header', () => {
      const mockRequest = {
        headers: {
          'x-real-ip': '203.0.113.50',
        },
        ip: '127.0.0.1',
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractIpAddress(mockRequest);

      expect(result).toBe('203.0.113.50');
    });

    it('should fall back to request.ip when no proxy headers', () => {
      const mockRequest = {
        headers: {},
        ip: '192.168.1.1',
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractIpAddress(mockRequest);

      expect(result).toBe('192.168.1.1');
    });

    it('should handle empty x-forwarded-for string', () => {
      const mockRequest = {
        headers: {
          'x-forwarded-for': '',
        },
        ip: '127.0.0.1',
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractIpAddress(mockRequest);

      expect(result).toBe('127.0.0.1');
    });

    it('should handle empty x-forwarded-for array', () => {
      const mockRequest = {
        headers: {
          'x-forwarded-for': [],
        },
        ip: '127.0.0.1',
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractIpAddress(mockRequest);

      expect(result).toBe('127.0.0.1');
    });

    it('should handle x-forwarded-for with empty first element', () => {
      const mockRequest = {
        headers: {
          'x-forwarded-for': '   , 10.0.0.1',
        },
        ip: '127.0.0.1',
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractIpAddress(mockRequest);

      // Falls through to x-real-ip or request.ip
      expect(result).toBe('127.0.0.1');
    });

    it('should handle empty x-real-ip', () => {
      const mockRequest = {
        headers: {
          'x-real-ip': '',
        },
        ip: '10.0.0.1',
      };

      const guardInstance = guard as any;
      const result = guardInstance.extractIpAddress(mockRequest);

      expect(result).toBe('10.0.0.1');
    });
  });

  describe('response finish event logging', () => {
    it('should register response finish event handler', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Device',
        keyHash: 'hash',
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

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
          'user-agent': 'TestAgent/1.0',
        },
        apiKey: undefined,
        url: '/api/test',
        method: 'GET',
        ip: '192.168.1.1',
      };

      const onMock = vi.fn();
      const mockResponse = {
        statusCode: 200,
        on: onMock,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key'] as string
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      (mockContext.switchToHttp().getResponse as any).mockReturnValue(mockResponse);

      await guard.canActivate(mockContext);

      expect(onMock).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should call logUsage when response finishes', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Device',
        keyHash: 'hash',
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

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
          'user-agent': 'TestAgent/1.0',
        },
        apiKey: undefined,
        url: '/api/test',
        method: 'GET',
        ip: '192.168.1.1',
      };

      let finishCallback: (() => void) | null = null;
      const mockResponse = {
        statusCode: 200,
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'finish') {
            finishCallback = cb;
          }
        }),
      };

      // Add logUsage mock
      (mockApiKeysService as any).logUsage = vi.fn().mockResolvedValue(undefined);

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key'] as string
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      (mockContext.switchToHttp().getResponse as any).mockReturnValue(mockResponse);

      await guard.canActivate(mockContext);

      // Trigger the finish callback
      expect(finishCallback).not.toBeNull();
      finishCallback!();

      // Wait for async logUsage call
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect((mockApiKeysService as any).logUsage).toHaveBeenCalledWith(
        mockApiKey.id,
        '/api/test',
        'GET',
        200,
        expect.any(Number),
        true,
        undefined,
        '192.168.1.1',
        'TestAgent/1.0'
      );
    });

    it('should log error status codes as failures', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Device',
        keyHash: 'hash',
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

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
        },
        apiKey: undefined,
        url: '/api/test',
        method: 'POST',
        ip: '10.0.0.1',
      };

      let finishCallback: (() => void) | null = null;
      const mockResponse = {
        statusCode: 500,
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'finish') {
            finishCallback = cb;
          }
        }),
      };

      (mockApiKeysService as any).logUsage = vi.fn().mockResolvedValue(undefined);

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key'] as string
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      (mockContext.switchToHttp().getResponse as any).mockReturnValue(mockResponse);

      await guard.canActivate(mockContext);

      finishCallback!();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect((mockApiKeysService as any).logUsage).toHaveBeenCalledWith(
        mockApiKey.id,
        '/api/test',
        'POST',
        500,
        expect.any(Number),
        false,
        'HTTP 500',
        '10.0.0.1',
        undefined
      );
    });

    it('should handle logUsage errors gracefully', async () => {
      const mockApiKey = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Device',
        keyHash: 'hash',
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

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_abc123de_' + 'f'.repeat(64),
        },
        apiKey: undefined,
        url: '/api/test',
        method: 'GET',
      };

      let finishCallback: (() => void) | null = null;
      const mockResponse = {
        statusCode: 200,
        on: vi.fn((event: string, cb: () => void) => {
          if (event === 'finish') {
            finishCallback = cb;
          }
        }),
      };

      (mockApiKeysService as any).logUsage = vi.fn().mockRejectedValue(new Error('DB error'));

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key'] as string
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      (mockContext.switchToHttp().getResponse as any).mockReturnValue(mockResponse);

      await guard.canActivate(mockContext);

      // Should not throw when finish callback is called
      expect(() => finishCallback!()).not.toThrow();
    });
  });

  describe('request object mutation', () => {
    it('should attach apiKey to request object', async () => {
      const mockApiKey = {
        id: 'key-id-123',
        name: 'Test Device',
        keyHash: 'hash',
        deviceInfo: 'Test Device',
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

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_test_' + 'a'.repeat(64),
        },
        apiKey: undefined,
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key']
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      await guard.canActivate(mockContext);

      expect(mockRequest.apiKey).toBeDefined();
      expect(mockRequest.apiKey?.id).toBe('key-id-123');
      expect(mockRequest.apiKey?.name).toBe('Test Device');
    });

    it('should preserve existing request properties', async () => {
      const mockApiKey = {
        id: 'key-id-123',
        name: 'Test Device',
        keyHash: 'hash',
        deviceInfo: 'Test Device',
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

      const mockRequest: MockRequest = {
        headers: {
          'x-api-key': 'lk_test_' + 'a'.repeat(64),
          'content-type': 'application/json',
          'user-agent': 'ArrCaptain/1.0',
        },
        apiKey: undefined,
        existingProperty: 'should-preserve',
      };

      vi.spyOn(guard as any, 'extractApiKeyFromHeader').mockReturnValue(
        mockRequest.headers['x-api-key']
      );
      vi.mocked(mockApiKeysService.validateApiKey).mockResolvedValue(mockApiKey);

      (mockContext.switchToHttp().getRequest as any).mockReturnValue(mockRequest);

      await guard.canActivate(mockContext);

      expect(mockRequest.existingProperty).toBe('should-preserve');
      expect(mockRequest.headers['content-type']).toBe('application/json');
    });
  });
});
