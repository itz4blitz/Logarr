import { Test } from '@nestjs/testing';

import { DATABASE_CONNECTION } from '../../database';

import { AuditService } from './audit.service';

import type { CreateAuditLogDto, AuditLogFilters } from './audit.service';
import type { TestingModule } from '@nestjs/testing';

describe('AuditService', () => {
  let service: AuditService;
  let mockDb: any;

  const mockAuditLog = {
    id: 'audit-1',
    userId: 'user-1',
    sessionId: 'session-1',
    action: 'create' as const,
    category: 'server' as const,
    entityType: 'server',
    entityId: 'server-1',
    description: 'POST /api/servers - Success (201)',
    endpoint: '/api/servers',
    method: 'POST',
    statusCode: 201,
    responseTime: 150,
    success: true,
    errorMessage: null,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    metadata: { key: 'value' },
    apiKeyId: 'api-key-1',
    timestamp: new Date(),
  };

  beforeEach(async () => {
    mockDb = {
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: DATABASE_CONNECTION,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createLog', () => {
    it('should create an audit log entry', async () => {
      const dto: CreateAuditLogDto = {
        userId: 'user-1',
        sessionId: 'session-1',
        action: 'create',
        category: 'server',
        entityType: 'server',
        entityId: 'server-1',
        description: 'Created server',
        endpoint: '/api/servers',
        method: 'POST',
        statusCode: 201,
        responseTime: 150,
        success: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: { key: 'value' },
        apiKeyId: 'api-key-1',
      };

      mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      await service.createLog(dto);

      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      const dto: CreateAuditLogDto = {
        action: 'create',
        category: 'server',
        entityType: 'server',
        description: 'Created server',
        endpoint: '/api/servers',
        method: 'POST',
        statusCode: 201,
        responseTime: 150,
        success: true,
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('Database error')),
      });

      // Should not throw
      await expect(service.createLog(dto)).resolves.toBeUndefined();
    });

    it('should handle non-Error exceptions gracefully', async () => {
      const dto: CreateAuditLogDto = {
        action: 'read',
        category: 'log_entry',
        entityType: 'log',
        description: 'Read logs',
        endpoint: '/api/logs',
        method: 'GET',
        statusCode: 200,
        responseTime: 50,
        success: true,
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue('String error'),
      });

      await expect(service.createLog(dto)).resolves.toBeUndefined();
    });

    it('should create log with error message when request fails', async () => {
      const dto: CreateAuditLogDto = {
        action: 'error',
        category: 'server',
        entityType: 'server',
        description: 'Failed to create server',
        endpoint: '/api/servers',
        method: 'POST',
        statusCode: 500,
        responseTime: 100,
        success: false,
        errorMessage: 'Internal server error',
      };

      mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });

      await service.createLog(dto);

      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('getLogs', () => {
    it('should return audit logs with default pagination', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const result = await service.getLogs();

      expect(result).toEqual([mockAuditLog]);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(100);
      expect(mockDb.offset).toHaveBeenCalledWith(0);
    });

    it('should filter by userId', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const filters: AuditLogFilters = { userId: 'user-1' };
      await service.getLogs(filters);

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should filter by action', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const filters: AuditLogFilters = { action: 'create' };
      await service.getLogs(filters);

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should filter by category', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const filters: AuditLogFilters = { category: 'server' };
      await service.getLogs(filters);

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should filter by entityType', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const filters: AuditLogFilters = { entityType: 'server' };
      await service.getLogs(filters);

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should filter by entityId', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const filters: AuditLogFilters = { entityId: 'server-1' };
      await service.getLogs(filters);

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should filter by success status', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const filters: AuditLogFilters = { success: true };
      await service.getLogs(filters);

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const filters: AuditLogFilters = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
      };
      await service.getLogs(filters);

      expect(mockDb.where).toHaveBeenCalled();
    });

    it('should apply custom pagination', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const filters: AuditLogFilters = { limit: 50, offset: 100 };
      await service.getLogs(filters);

      expect(mockDb.limit).toHaveBeenCalledWith(50);
      expect(mockDb.offset).toHaveBeenCalledWith(100);
    });

    it('should handle empty string filters', async () => {
      mockDb.offset.mockResolvedValue([]);

      const filters: AuditLogFilters = {
        userId: '',
        action: '',
        category: '',
        entityType: '',
        entityId: '',
      };
      await service.getLogs(filters);

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should handle null filters', async () => {
      mockDb.offset.mockResolvedValue([]);

      const filters: AuditLogFilters = {
        userId: undefined,
        action: undefined,
      };
      await service.getLogs(filters);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    it('should return statistics for default 30 days', async () => {
      // The service makes 4 separate queries, need to mock each chain
      const selectMock = vi.fn().mockReturnThis();
      const fromMock = vi.fn().mockReturnThis();
      const whereMock = vi.fn().mockReturnThis();
      const groupByMock = vi.fn().mockReturnThis();
      const orderByMock = vi.fn().mockReturnThis();
      const limitMock = vi.fn();

      // First call - main stats
      limitMock.mockResolvedValueOnce([{ total: 100, success: 90, errors: 10 }]);
      // Second call - by category
      groupByMock.mockResolvedValueOnce([
        { category: 'server', count: 50 },
        { category: 'log_entry', count: 30 },
      ]);
      // Third call - by action
      groupByMock.mockResolvedValueOnce([
        { action: 'read', count: 60 },
        { action: 'create', count: 40 },
      ]);
      // Fourth call - by user
      limitMock.mockResolvedValueOnce([
        { userId: 'user-1', count: 50 },
        { userId: 'user-2', count: 30 },
      ]);

      mockDb.select = selectMock;
      selectMock.mockReturnValue({
        from: fromMock.mockReturnValue({
          where: whereMock.mockReturnValue({
            groupBy: groupByMock,
            orderBy: orderByMock.mockReturnValue({
              limit: limitMock,
            }),
            limit: limitMock,
          }),
        }),
      });

      // For the first query (no groupBy)
      whereMock.mockReturnValueOnce(Promise.resolve([{ total: 100, success: 90, errors: 10 }]));

      const result = await service.getStatistics();

      expect(result).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return statistics for custom days', async () => {
      // Need to mock all 4 queries the service makes
      const createChainMock = (result: any) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(result),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
      });

      // First call returns stats, subsequent calls return empty arrays
      mockDb.select = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ total: 50, success: 45, errors: 5 }]),
          }),
        })
        .mockReturnValueOnce(createChainMock([]))
        .mockReturnValueOnce(createChainMock([]))
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        });

      const result = await service.getStatistics(7);

      expect(result).toBeDefined();
      expect(result.totalLogs).toBe(50);
    });

    it('should handle empty results', async () => {
      const createChainMock = (result: any) => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue(result),
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(result),
            }),
          }),
        }),
      });

      mockDb.select = vi
        .fn()
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        })
        .mockReturnValueOnce(createChainMock([]))
        .mockReturnValueOnce(createChainMock([]))
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        });

      const result = await service.getStatistics();

      expect(result.totalLogs).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(result.byCategory).toEqual({});
      expect(result.byAction).toEqual({});
      expect(result.byUser).toEqual([]);
    });

    it('should handle null userId in user stats', async () => {
      mockDb.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ userId: null, count: 5 }]),
              }),
            }),
          }),
        }),
      });

      // Mock the first query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ total: 10, success: 10, errors: 0 }]),
        }),
      });
      // Mock category query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      // Mock action query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      // Mock user query
      mockDb.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            groupBy: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ userId: null, count: 5 }]),
              }),
            }),
          }),
        }),
      });

      const result = await service.getStatistics();

      expect(result.byUser[0]?.userId).toBe('unknown');
    });
  });

  describe('getUserActivity', () => {
    it('should return user activity with default limit', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const result = await service.getUserActivity('user-1');

      expect(result).toEqual([mockAuditLog]);
    });

    it('should return user activity with custom limit', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      await service.getUserActivity('user-1', 25);

      expect(mockDb.limit).toHaveBeenCalledWith(25);
    });
  });

  describe('getEntityActivity', () => {
    it('should return entity activity with default limit', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      const result = await service.getEntityActivity('server', 'server-1');

      expect(result).toEqual([mockAuditLog]);
    });

    it('should return entity activity with custom limit', async () => {
      mockDb.offset.mockResolvedValue([mockAuditLog]);

      await service.getEntityActivity('server', 'server-1', 25);

      expect(mockDb.limit).toHaveBeenCalledWith(25);
    });
  });
});
