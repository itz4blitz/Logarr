import { Test, TestingModule } from '@nestjs/testing';
import { AuditMiddleware } from './audit.middleware';
import { AuditService } from './audit.service';
import { AuditGateway } from './audit.gateway';
import { Request, Response } from 'express';

describe('AuditMiddleware', () => {
  let middleware: AuditMiddleware;
  let auditService: any;
  let auditGateway: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditMiddleware,
        {
          provide: AuditService,
          useValue: {
            createLog: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditGateway,
          useValue: {
            broadcastAuditLog: vi.fn(),
          },
        },
      ],
    }).compile();

    middleware = module.get<AuditMiddleware>(AuditMiddleware);
    auditService = module.get(AuditService);
    auditGateway = module.get(AuditGateway);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      path: '/api/servers',
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0',
      },
      ip: '127.0.0.1',
      ...overrides,
    } as unknown as Request;
  };

  const createMockResponse = (): Response & { finishCallback?: () => void } => {
    const res: any = {
      statusCode: 200,
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          res.finishCallback = callback;
        }
      }),
    };
    return res;
  };

  describe('use', () => {
    it('should skip excluded paths - /health', () => {
      const req = createMockRequest({ path: '/health' });
      const res = createMockResponse();
      const next = vi.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('should skip excluded paths - /api/docs', () => {
      const req = createMockRequest({ path: '/api/docs' });
      const res = createMockResponse();
      const next = vi.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('should skip excluded paths - /api/json', () => {
      const req = createMockRequest({ path: '/api/json' });
      const res = createMockResponse();
      const next = vi.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('should skip excluded paths - /settings/audit', () => {
      const req = createMockRequest({ path: '/settings/audit/logs' });
      const res = createMockResponse();
      const next = vi.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('should register finish listener for non-excluded paths', () => {
      const req = createMockRequest({ path: '/api/servers' });
      const res = createMockResponse();
      const next = vi.fn();

      middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should create audit log on response finish', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'POST',
      });
      const res = createMockResponse();
      res.statusCode = 201;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalled();
      expect(auditGateway.broadcastAuditLog).toHaveBeenCalled();
    });

    it('should handle GET requests as read action', async () => {
      const req = createMockRequest({
        path: '/api/logs',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'read',
          method: 'GET',
        })
      );
    });

    it('should handle POST requests as create action', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'POST',
      });
      const res = createMockResponse();
      res.statusCode = 201;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          method: 'POST',
        })
      );
    });

    it('should handle PUT requests as update action', async () => {
      const req = createMockRequest({
        path: '/api/servers/123',
        method: 'PUT',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          method: 'PUT',
        })
      );
    });

    it('should handle PATCH requests as update action', async () => {
      const req = createMockRequest({
        path: '/api/servers/123',
        method: 'PATCH',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          method: 'PATCH',
        })
      );
    });

    it('should handle DELETE requests as delete action', async () => {
      const req = createMockRequest({
        path: '/api/servers/123',
        method: 'DELETE',
      });
      const res = createMockResponse();
      res.statusCode = 204;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          method: 'DELETE',
        })
      );
    });

    it('should handle unknown methods as other action', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'OPTIONS',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'other',
        })
      );
    });

    it('should mark failed requests as error action', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'POST',
      });
      const res = createMockResponse();
      res.statusCode = 500;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'error',
          success: false,
        })
      );
    });

    it('should categorize auth paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/auth/login',
        method: 'POST',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'auth',
        })
      );
    });

    it('should categorize server paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'server',
        })
      );
    });

    it('should categorize logs paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/logs',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'log_entry',
        })
      );
    });

    it('should categorize sessions paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/sessions',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'session',
        })
      );
    });

    it('should categorize issues paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/issues',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'issue',
        })
      );
    });

    it('should categorize ai paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/ai/analyze',
        method: 'POST',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'ai_analysis',
        })
      );
    });

    it('should categorize api-keys paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/api-keys',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'api_key',
        })
      );
    });

    it('should categorize settings paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/settings',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'settings',
        })
      );
    });

    it('should categorize retention paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/retention',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'retention',
        })
      );
    });

    it('should categorize proxy paths correctly', async () => {
      const req = createMockRequest({
        path: '/api/proxy/sonarr',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'proxy',
        })
      );
    });

    it('should categorize unknown paths as other', async () => {
      const req = createMockRequest({
        path: '/api/unknown',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'other',
        })
      );
    });

    it('should extract entity ID from UUID in path', async () => {
      const uuid = '12345678-1234-1234-1234-123456789012';
      const req = createMockRequest({
        path: `/api/servers/${uuid}`,
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'servers',
          entityId: uuid,
        })
      );
    });

    it('should extract IP from x-forwarded-for header (string)', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
        headers: {
          'x-forwarded-for': '10.0.0.1, 192.168.1.1',
          'user-agent': 'Mozilla/5.0',
        },
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.1',
        })
      );
    });

    it('should extract IP from x-forwarded-for header (array)', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
        headers: {
          'x-forwarded-for': ['10.0.0.2', '192.168.1.1'],
          'user-agent': 'Mozilla/5.0',
        },
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.2',
        })
      );
    });

    it('should extract IP from x-real-ip header', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
        headers: {
          'x-real-ip': '10.0.0.3',
          'user-agent': 'Mozilla/5.0',
        },
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.3',
        })
      );
    });

    it('should fall back to req.ip when no headers present', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
        ip: '127.0.0.1',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '127.0.0.1',
        })
      );
    });

    it('should include user info when present', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
      }) as any;
      req.user = { id: 'user-123', email: 'test@example.com' };
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
        })
      );
    });

    it('should include session info when present', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
      }) as any;
      req.session = { id: 'session-123' };
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-123',
        })
      );
    });

    it('should include API key info when present', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
      }) as any;
      req.apiKey = { id: 'api-key-123', name: 'Test Key', type: 'full' };
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKeyId: 'api-key-123',
        })
      );
    });

    it('should handle audit service errors gracefully', async () => {
      auditService.createLog.mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);

      // Should not throw
      await expect(res.finishCallback?.()).resolves.toBeUndefined();
    });

    it('should handle non-Error exceptions gracefully', async () => {
      auditService.createLog.mockRejectedValue('String error');

      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);

      await expect(res.finishCallback?.()).resolves.toBeUndefined();
    });

    it('should handle 4xx status codes as failures', async () => {
      const req = createMockRequest({
        path: '/api/servers',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 404;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          action: 'error',
        })
      );
    });

    it('should handle playback paths as session category', async () => {
      const req = createMockRequest({
        path: '/api/playback',
        method: 'GET',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'session',
        })
      );
    });

    it('should handle login path as auth category', async () => {
      const req = createMockRequest({
        path: '/login',
        method: 'POST',
      });
      const res = createMockResponse();
      res.statusCode = 200;
      const next = vi.fn();

      middleware.use(req, res, next);
      await res.finishCallback?.();

      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'auth',
        })
      );
    });
  });
});
