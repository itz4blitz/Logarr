import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { LogsService } from './logs.service';
import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';

describe('LogsService', () => {
  let service: LogsService;
  let mockDb: MockDb;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogsService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
      ],
    }).compile();

    service = module.get<LogsService>(LogsService);
  });

  describe('search', () => {
    it('should return paginated log results', async () => {
      const mockLogs = [
        { id: '1', message: 'Error 1', level: 'error', timestamp: new Date() },
        { id: '2', message: 'Warning 1', level: 'warn', timestamp: new Date() },
      ];
      configureMockDb(mockDb, { select: mockLogs });

      const result = await service.search({ limit: 10, offset: 0 });

      expect(result.data).toEqual(mockLogs);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should apply serverId filter', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ serverId: 'server-1' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply level filter as array', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ levels: ['error', 'warn'] });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should handle single level as string', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ levels: 'error' as unknown as string[] });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply search text filter', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ search: 'connection failed' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply date range filters', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply source filter', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ sources: ['jellyfin', 'sonarr'] });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply logSource filter', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ logSources: ['api', 'file'] });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply sessionId filter', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ sessionId: 'session-123' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should apply userId filter', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ userId: 'user-456' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should cap limit at 1000', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.search({ limit: 5000 });

      expect(result.limit).toBe(1000);
    });

    it('should default limit to 100', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.search({});

      expect(result.limit).toBe(100);
    });

    it('should default offset to 0', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.search({});

      expect(result.offset).toBe(0);
    });
  });

  describe('findOne', () => {
    it('should return a log entry by id', async () => {
      const mockLog = { id: '1', message: 'Test error', level: 'error' };
      configureMockDb(mockDb, { select: [mockLog] });

      const result = await service.findOne('1');

      expect(result).toEqual(mockLog);
    });

    it('should return null if log not found', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.findOne('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return log statistics', async () => {
      const mockLevelCounts = [
        { level: 'error', count: 10 },
        { level: 'warn', count: 20 },
        { level: 'info', count: 100 },
        { level: 'debug', count: 50 },
      ];
      configureMockDb(mockDb, { select: mockLevelCounts });

      const result = await service.getStats();

      expect(result).toHaveProperty('totalCount');
      expect(result).toHaveProperty('errorCount');
      expect(result).toHaveProperty('warnCount');
      expect(result).toHaveProperty('infoCount');
      expect(result).toHaveProperty('debugCount');
      expect(result).toHaveProperty('errorRate');
      expect(result).toHaveProperty('topSources');
      expect(result).toHaveProperty('topErrors');
    });

    it('should filter stats by serverId', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.getStats('server-1');

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should calculate error rate correctly', async () => {
      const mockLevelCounts = [
        { level: 'error', count: 10 },
        { level: 'info', count: 90 },
      ];
      configureMockDb(mockDb, { select: mockLevelCounts });

      const result = await service.getStats();

      expect(result.errorRate).toBe(0.1);
    });

    it('should return 0 error rate when no logs', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getStats();

      expect(result.errorRate).toBe(0);
    });
  });

  describe('getSources', () => {
    it('should return distinct sources', async () => {
      const mockSources = [
        { source: 'jellyfin' },
        { source: 'sonarr' },
        { source: 'radarr' },
      ];
      configureMockDb(mockDb, { selectDistinct: mockSources });

      const result = await service.getSources();

      expect(result).toEqual(['jellyfin', 'sonarr', 'radarr']);
    });

    it('should filter by serverId', async () => {
      configureMockDb(mockDb, { selectDistinct: [] });

      await service.getSources('server-1');

      expect(mockDb.selectDistinct).toHaveBeenCalled();
    });

    it('should filter out null sources', async () => {
      const mockSources = [
        { source: 'jellyfin' },
        { source: null },
        { source: 'sonarr' },
      ];
      configureMockDb(mockDb, { selectDistinct: mockSources });

      const result = await service.getSources();

      expect(result).toEqual(['jellyfin', 'sonarr']);
    });
  });

  describe('getLogWithRelations', () => {
    it('should return log with server info', async () => {
      const mockLogResult = [{
        id: '1',
        message: 'Error message',
        level: 'error',
        serverId: 'server-1',
        serverName: 'My Jellyfin Server',
        serverProviderId: 'jellyfin',
        serverUrl: 'http://localhost:8096',
      }];
      configureMockDb(mockDb, { select: mockLogResult });

      const result = await service.getLogWithRelations('1');

      expect(result).toHaveProperty('serverName');
    });

    it('should return null if log not found', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getLogWithRelations('non-existent');

      expect(result).toBeNull();
    });

    it('should include related issue if exists', async () => {
      const mockLogResult = [{
        id: '1',
        message: 'Error message',
        level: 'error',
      }];
      const mockIssue = [{
        id: 'issue-1',
        title: 'Connection Error',
        severity: 'high',
        status: 'open',
        source: 'jellyfin',
        occurrenceCount: 5,
      }];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? mockLogResult : mockIssue;
        return {
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getLogWithRelations('1');

      expect(result).toHaveProperty('relatedIssue');
    });
  });
});
