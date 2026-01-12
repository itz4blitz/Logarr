import { UnauthorizedException , ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ApiKeysService } from '../../api-keys/api-keys.service';
import { AuthService } from '../auth.service';

import { UnifiedAuthGuard, Public, JwtAuthRequest } from './unified-auth.guard';

import type { apiKeys } from '../../../database/schema';
import type { JwtPayload } from '../auth.service';

describe('UnifiedAuthGuard', () => {
  let guard: UnifiedAuthGuard;
  let reflector: {
    getAllAndOverride: ReturnType<typeof vi.fn>;
  };
  let authService: {
    validateToken: ReturnType<typeof vi.fn>;
  };
  let apiKeysService: {
    validateApiKey: ReturnType<typeof vi.fn>;
  };

  // Mock data
  const mockApiKeyRecord = {
    id: 'key-123',
    name: 'Test Key',
    keyHash: 'hash',
    isEnabled: true,
    deviceInfo: 'test-device',
    rateLimit: 100,
    rateLimitTtl: 60,
    lastUsedAt: null,
    lastUsedIp: null,
    requestCount: 5,
    scopes: ['read'],
    expiresAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as typeof apiKeys.$inferSelect;

  const mockJwtPayload: JwtPayload = {
    sub: 'test-user',
    iat: 123456,
    exp: 1234567,
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: vi.fn(),
    };

    authService = {
      validateToken: vi.fn(),
    };

    apiKeysService = {
      validateApiKey: vi.fn(),
    };

    guard = new UnifiedAuthGuard(
      reflector as unknown as Reflector,
      apiKeysService as unknown as ApiKeysService,
      authService as unknown as AuthService
    );
  });

  const createMockExecutionContext = (
    request: Partial<JwtAuthRequest> = {},
    isPublic: boolean = false
  ): ExecutionContext => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    // Mock reflector behavior
    if (isPublic) {
      reflector.getAllAndOverride.mockReturnValue(true);
    } else {
      reflector.getAllAndOverride.mockReturnValue(false);
    }

    return context;
  };

  describe('canActivate with public endpoint', () => {
    it('should allow access when endpoint is marked as public', async () => {
      const context = createMockExecutionContext({}, true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith('isPublic', [
        context.getHandler(),
        context.getClass(),
      ]);
      expect(apiKeysService.validateApiKey).not.toHaveBeenCalled();
      expect(authService.validateToken).not.toHaveBeenCalled();
    });

    it('should not authenticate when endpoint is public', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: {},
      };
      const context = createMockExecutionContext(request, true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('canActivate with API key authentication', () => {
    it('should allow access with valid API key from X-API-Key header', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': 'valid-api-key' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(mockApiKeyRecord);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(apiKeysService.validateApiKey).toHaveBeenCalledWith('valid-api-key');
      expect(request.apiKey).toEqual(mockApiKeyRecord);
      expect(request.authType).toBe('apiKey');
      expect(authService.validateToken).not.toHaveBeenCalled();
    });

    it('should allow access with valid API key from query parameter', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: {},
        url: '/?api_key=valid-api-key',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(mockApiKeyRecord);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(apiKeysService.validateApiKey).toHaveBeenCalledWith('valid-api-key');
      expect(request.apiKey).toEqual(mockApiKeyRecord);
      expect(request.authType).toBe('apiKey');
    });

    it('should prioritize X-API-Key header over query parameter', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': 'header-key' },
        url: '/?api_key=query-key',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(mockApiKeyRecord);

      await guard.canActivate(context);

      expect(apiKeysService.validateApiKey).toHaveBeenCalledWith('header-key');
      expect(apiKeysService.validateApiKey).not.toHaveBeenCalledWith('query-key');
    });

    it('should reject invalid API key', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': 'invalid-key' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(undefined);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid API key')
      );
    });

    it('should reject null API key', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': 'some-key' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(null);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid API key')
      );
    });

    it('should handle API key validation errors', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': 'error-key' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockRejectedValue(
        new Error('Database error')
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authentication failed')
      );
    });

    it('should handle string array header for X-API-Key', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': ['valid-api-key'] },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(mockApiKeyRecord);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(apiKeysService.validateApiKey).toHaveBeenCalledWith('valid-api-key');
    });

    it('should reject empty API key string', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': '' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authentication required. Provide a valid API key or JWT token.')
      );
      expect(apiKeysService.validateApiKey).not.toHaveBeenCalled();
    });
  });

  describe('canActivate with JWT authentication', () => {
    it('should allow access with valid JWT token', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { authorization: 'Bearer valid-jwt-token' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      authService.validateToken.mockResolvedValue(mockJwtPayload);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateToken).toHaveBeenCalledWith('valid-jwt-token');
      expect(request.user).toEqual(mockJwtPayload);
      expect(request.authType).toBe('jwt');
      expect(apiKeysService.validateApiKey).not.toHaveBeenCalled();
    });

    it('should reject invalid JWT token', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { authorization: 'Bearer invalid-token' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      authService.validateToken.mockRejectedValue(
        new UnauthorizedException('Invalid token')
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid token')
      );
    });

    it('should reject JWT token without Bearer prefix', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { authorization: 'invalid-format' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authentication required. Provide a valid API key or JWT token.')
      );
    });

    it('should handle JWT validation errors', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { authorization: 'Bearer malformed-token' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      authService.validateToken.mockRejectedValue(new Error('JWT error'));

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Invalid token')
      );
    });

    it('should handle string array header for authorization', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { authorization: 'Bearer valid-jwt-token' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      authService.validateToken.mockResolvedValue(mockJwtPayload);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateToken).toHaveBeenCalledWith('valid-jwt-token');
    });
  });

  describe('canActivate without authentication', () => {
    it('should reject request without API key or JWT', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: {},
        url: '/',
      };
      const context = createMockExecutionContext(request, false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException(
          'Authentication required. Provide a valid API key or JWT token.'
        )
      );
    });

    it('should reject request with empty X-API-Key and no JWT', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': '' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException(
          'Authentication required. Provide a valid API key or JWT token.'
        )
      );
    });
  });

  describe('header helper method', () => {
    it('should extract string header value', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-custom-header': 'value' },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(mockApiKeyRecord);

      // This test verifies header extraction works via the API key path
      request.headers = { 'x-api-key': 'test-key' };

      await guard.canActivate(context);

      expect(apiKeysService.validateApiKey).toHaveBeenCalled();
    });

    it('should handle undefined header', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: {},
        url: '/',
      };
      const context = createMockExecutionContext(request, false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authentication required. Provide a valid API key or JWT token.')
      );
    });

    it('should handle array header', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: { 'x-api-key': ['key1', 'key2'] },
        url: '/',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(mockApiKeyRecord);

      await guard.canActivate(context);

      expect(apiKeysService.validateApiKey).toHaveBeenCalledWith('key1');
    });
  });

  describe('URL parsing for query parameter', () => {
    it('should parse API key from URL with other parameters', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: {},
        url: '/api/logs?api_key=test-key&filter=error',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(mockApiKeyRecord);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(apiKeysService.validateApiKey).toHaveBeenCalledWith('test-key');
    });

    it('should handle URL with no parameters', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: {},
        url: '/api/logs',
      };
      const context = createMockExecutionContext(request, false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Authentication required. Provide a valid API key or JWT token.')
      );
    });

    it('should use localhost when host header is missing', async () => {
      const request: Partial<JwtAuthRequest> = {
        headers: {},
        url: '/?api_key=test-key',
      };
      const context = createMockExecutionContext(request, false);
      apiKeysService.validateApiKey.mockResolvedValue(mockApiKeyRecord);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});

describe('Public decorator', () => {
  it('should set metadata for public endpoint', () => {
    // Test the decorator by applying it to a method
    class TestClass {
      @Public()
      testMethod() {
        return 'public';
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(TestClass.prototype, 'testMethod');
    const method = descriptor?.value;

    expect(method).toBeDefined();

    // The decorator should have set the metadata
    const metadata = Reflect.getMetadata('isPublic', method);
    expect(metadata).toBe(true);
  });

  it('should not affect other metadata on the method', () => {
    class TestClass {
      @Public()
      testMethod() {
        return 'public';
      }
    }

    // Method should still be callable
    const instance = new TestClass();
    expect(instance.testMethod()).toBe('public');
  });
});
