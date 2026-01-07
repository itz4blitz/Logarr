import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';
import { SettingsService } from '../settings/settings.service';

import { RetentionService } from './retention.service';

import type { RetentionSettings } from '../settings/settings.service';
import type { TestingModule } from '@nestjs/testing';

describe('RetentionService', () => {
  let service: RetentionService;
  let mockDb: MockDb;
  let mockSettingsService: {
    getRetentionSettings: ReturnType<typeof vi.fn>;
    recordRetentionRun: ReturnType<typeof vi.fn>;
    updateRetentionRun: ReturnType<typeof vi.fn>;
  };

  const defaultRetentionSettings: RetentionSettings = {
    enabled: true,
    infoRetentionDays: 30,
    errorRetentionDays: 90,
    batchSize: 10000,
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    mockSettingsService = {
      getRetentionSettings: vi.fn().mockResolvedValue(defaultRetentionSettings),
      recordRetentionRun: vi.fn().mockResolvedValue('test-history-id'),
      updateRetentionRun: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<RetentionService>(RetentionService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should log initialization info', async () => {
      const logSpy = vi.spyOn(service['logger'], 'log');

      await service.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith('Retention service initialized:');
      expect(logSpy).toHaveBeenCalledWith('  - Enabled: true');
      expect(logSpy).toHaveBeenCalledWith('  - Info/Debug retention: 30 days');
      expect(logSpy).toHaveBeenCalledWith('  - Error/Warn retention: 90 days');
    });

    it('should setup cleanup interval when enabled', async () => {
      const logSpy = vi.spyOn(service['logger'], 'log');

      await service.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith('Cleanup interval set (hourly check, runs at 3 AM)');
    });

    it('should not setup cleanup interval when disabled', async () => {
      mockSettingsService.getRetentionSettings.mockResolvedValue({
        ...defaultRetentionSettings,
        enabled: false,
      });

      const logSpy = vi.spyOn(service['logger'], 'log');

      await service.onModuleInit();

      expect(logSpy).not.toHaveBeenCalledWith('Cleanup interval set (hourly check, runs at 3 AM)');
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear cleanup interval', async () => {
      await service.onModuleInit();

      service.onModuleDestroy();

      expect(service['cleanupInterval']).toBeNull();
    });

    it('should handle destroy when no interval is set', () => {
      // No init called, so no interval
      service.onModuleDestroy();

      expect(service['cleanupInterval']).toBeNull();
    });
  });

  describe('runScheduledCleanup', () => {
    it('should skip cleanup when disabled', async () => {
      mockSettingsService.getRetentionSettings.mockResolvedValue({
        ...defaultRetentionSettings,
        enabled: false,
      });

      const debugSpy = vi.spyOn(service['logger'], 'debug');
      const runCleanupSpy = vi.spyOn(service, 'runCleanup');

      await service['runScheduledCleanup']();

      expect(debugSpy).toHaveBeenCalledWith('Cleanup skipped - disabled via settings');
      expect(runCleanupSpy).not.toHaveBeenCalled();
    });

    it('should run cleanup when enabled', async () => {
      configureMockDb(mockDb, { delete: [] });
      const logSpy = vi.spyOn(service['logger'], 'log');

      await service['runScheduledCleanup']();

      expect(logSpy).toHaveBeenCalledWith('Starting scheduled retention cleanup...');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Scheduled cleanup complete'));
    });

    it('should log error when cleanup fails', async () => {
      const testError = new Error('Cleanup failed');
      mockDb.delete = vi.fn().mockImplementation(() => {
        throw testError;
      });

      const errorSpy = vi.spyOn(service['logger'], 'error');

      await service['runScheduledCleanup']();

      expect(errorSpy).toHaveBeenCalledWith('Scheduled cleanup failed:', testError);
    });
  });

  describe('getConfig', () => {
    it('should return retention configuration', async () => {
      const config = await service.getConfig();

      expect(config).toEqual({
        enabled: true,
        infoRetentionDays: 30,
        errorRetentionDays: 90,
        cleanupCron: '0 3 * * *',
        batchSize: 10000,
      });
    });

    it('should call settings service for config', async () => {
      await service.getConfig();

      expect(mockSettingsService.getRetentionSettings).toHaveBeenCalled();
    });
  });

  describe('previewCleanup', () => {
    it('should return preview of what would be deleted', async () => {
      // Mock count queries - each level returns different counts
      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const counts = [
          [{ count: 100 }], // info
          [{ count: 50 }], // debug
          [{ count: 25 }], // warn
          [{ count: 10 }], // error
        ];
        const result = counts[callCount - 1] || [{ count: 0 }];

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
              [Symbol.toStringTag]: 'Promise',
            }),
          }),
        };
      });

      const preview = await service.previewCleanup();

      expect(preview).toHaveProperty('infoLogsToDelete');
      expect(preview).toHaveProperty('debugLogsToDelete');
      expect(preview).toHaveProperty('warnLogsToDelete');
      expect(preview).toHaveProperty('errorLogsToDelete');
      expect(preview).toHaveProperty('totalLogsToDelete');
      expect(preview).toHaveProperty('estimatedSpaceSavingsBytes');
      expect(preview).toHaveProperty('estimatedSpaceSavingsFormatted');
      expect(preview).toHaveProperty('infoCutoffDate');
      expect(preview).toHaveProperty('errorCutoffDate');
    });

    it('should calculate total from all levels', async () => {
      // Create simple mock that returns counts
      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const counts = [100, 50, 25, 10];
        const count = counts[callCount - 1] || 0;

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              then: vi
                .fn()
                .mockImplementation((resolve) => Promise.resolve([{ count }]).then(resolve)),
              [Symbol.toStringTag]: 'Promise',
            }),
          }),
        };
      });

      const preview = await service.previewCleanup();

      expect(preview.totalLogsToDelete).toBe(100 + 50 + 25 + 10);
    });

    it('should estimate space savings based on log count', async () => {
      // Mock to return 1000 total logs
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) => Promise.resolve([{ count: 250 }]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const preview = await service.previewCleanup();

      // 4 levels x 250 = 1000 logs x 1024 bytes = 1,024,000 bytes
      expect(preview.estimatedSpaceSavingsBytes).toBe(1000 * 1024);
    });

    it('should handle zero logs to delete', async () => {
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) => Promise.resolve([{ count: 0 }]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const preview = await service.previewCleanup();

      expect(preview.totalLogsToDelete).toBe(0);
      expect(preview.estimatedSpaceSavingsBytes).toBe(0);
      expect(preview.estimatedSpaceSavingsFormatted).toBe('0 B');
    });

    it('should handle null count values gracefully', async () => {
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) => Promise.resolve([{ count: null }]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const preview = await service.previewCleanup();

      expect(preview.totalLogsToDelete).toBe(0);
    });

    it('should handle empty result arrays', async () => {
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const preview = await service.previewCleanup();

      expect(preview.totalLogsToDelete).toBe(0);
    });
  });

  describe('countLogsBefore', () => {
    it('should return count of logs before cutoff', async () => {
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) => Promise.resolve([{ count: 42 }]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const countLogsBefore = service['countLogsBefore'].bind(service);
      const count = await countLogsBefore('info', new Date());

      expect(count).toBe(42);
    });

    it('should return 0 for null count', async () => {
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) => Promise.resolve([{ count: null }]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const countLogsBefore = service['countLogsBefore'].bind(service);
      const count = await countLogsBefore('error', new Date());

      expect(count).toBe(0);
    });

    it('should return 0 for empty result', async () => {
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const countLogsBefore = service['countLogsBefore'].bind(service);
      const count = await countLogsBefore('debug', new Date());

      expect(count).toBe(0);
    });
  });

  describe('runCleanup', () => {
    beforeEach(() => {
      // Mock delete to return empty arrays (no logs deleted)
      configureMockDb(mockDb, { delete: [] });
    });

    it('should record cleanup run in history', async () => {
      await service.runCleanup();

      expect(mockSettingsService.recordRetentionRun).toHaveBeenCalledWith(
        expect.objectContaining({
          startedAt: expect.any(Date),
          status: 'running',
        })
      );
    });

    it('should update history on successful completion', async () => {
      await service.runCleanup();

      expect(mockSettingsService.updateRetentionRun).toHaveBeenCalledWith(
        'test-history-id',
        expect.objectContaining({
          completedAt: expect.any(Date),
          status: 'completed',
        })
      );
    });

    it('should return cleanup result with counts', async () => {
      const result = await service.runCleanup();

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('info');
      expect(result).toHaveProperty('debug');
      expect(result).toHaveProperty('warn');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('orphanedOccurrences');
      expect(result).toHaveProperty('totalDeleted');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('completedAt');
    });

    it('should calculate total deleted correctly', async () => {
      // Mock delete to return specific counts
      let deleteCallCount = 0;
      mockDb.delete = vi.fn().mockImplementation(() => {
        deleteCallCount++;
        // Return different counts for each delete call
        // First 4 calls are for info, debug, warn, error
        // 5th call is for orphaned occurrences
        const results = [
          [{ id: '1' }, { id: '2' }], // 2 info
          [{ id: '3' }], // 1 debug
          [{ id: '4' }, { id: '5' }, { id: '6' }], // 3 warn
          [{ id: '7' }], // 1 error
          [{ id: '8' }], // 1 orphaned
        ];
        const result = results[deleteCallCount - 1] || [];

        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
              [Symbol.toStringTag]: 'Promise',
            }),
          }),
        };
      });

      const result = await service.runCleanup();

      expect(result.totalDeleted).toBe(2 + 1 + 3 + 1);
    });

    it('should update history with failure on error', async () => {
      const testError = new Error('Database connection failed');
      mockDb.delete = vi.fn().mockImplementation(() => {
        throw testError;
      });

      await expect(service.runCleanup()).rejects.toThrow('Database connection failed');

      expect(mockSettingsService.updateRetentionRun).toHaveBeenCalledWith(
        'test-history-id',
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Database connection failed',
        })
      );
    });

    it('should handle non-Error exception in cleanup', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => {
        throw 'String error';
      });

      await expect(service.runCleanup()).rejects.toThrow();

      expect(mockSettingsService.updateRetentionRun).toHaveBeenCalledWith(
        'test-history-id',
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Unknown error',
        })
      );
    });

    it('should handle batched deletion when results exceed batch size limit', async () => {
      // Mock delete to return many results initially, then few
      let deleteCallCount = 0;
      mockDb.delete = vi.fn().mockImplementation(() => {
        deleteCallCount++;
        // For first 4 log level deletes, return empty
        // 5th call (orphaned) returns empty
        const resultCount = deleteCallCount <= 5 ? 0 : 0;
        const result = Array(resultCount).fill({ id: 'test-id' });

        return {
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockReturnValue({
              then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
              [Symbol.toStringTag]: 'Promise',
            }),
          }),
        };
      });

      const result = await service.runCleanup();

      expect(result.success).toBe(true);
      expect(result.totalDeleted).toBe(0);
    });
  });

  describe('getStorageStats', () => {
    beforeEach(() => {
      // Setup complex mocks for storage stats
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        // Return different results based on call order
        const results: unknown[] = [
          [{ count: 1000 }], // Total log count
          [{ oldest: '2024-01-01T00:00:00Z' }], // Oldest log
          [{ newest: '2024-12-31T00:00:00Z' }], // Newest log
          [
            // Level counts
            { level: 'info', count: 500 },
            { level: 'debug', count: 200 },
            { level: 'warn', count: 200 },
            { level: 'error', count: 100 },
          ],
          [], // Servers list (empty for simple test)
        ];

        const result = results[selectCallCount - 1] || [];

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockReturnThis(),
            then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        };
      });

      // Mock execute for raw SQL queries
      mockDb.execute = vi.fn().mockImplementation(() => {
        return Promise.resolve([
          { size: '1073741824' }, // 1 GB database size
        ]);
      });
    });

    it('should return storage statistics', async () => {
      const stats = await service.getStorageStats();

      expect(stats).toHaveProperty('logCount');
      expect(stats).toHaveProperty('databaseSizeBytes');
      expect(stats).toHaveProperty('databaseSizeFormatted');
      expect(stats).toHaveProperty('retentionConfig');
      expect(stats).toHaveProperty('logCountsByLevel');
    });

    it('should format database size correctly', async () => {
      mockDb.execute = vi.fn().mockResolvedValue([{ size: '1073741824' }]); // 1 GB

      const stats = await service.getStorageStats();

      expect(stats.databaseSizeBytes).toBe(1073741824);
      expect(stats.databaseSizeFormatted).toBe('1.00 GB');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.select = vi.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(service.getStorageStats()).rejects.toThrow('Database error');
    });

    it('should handle null oldest/newest timestamps', async () => {
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const results: unknown[] = [
          [{ count: 0 }], // Total log count
          [{ oldest: null }], // Oldest log - null
          [{ newest: null }], // Newest log - null
          [], // No level counts
          [], // No servers
        ];

        const result = results[selectCallCount - 1] || [];

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockReturnThis(),
            then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        };
      });

      mockDb.execute = vi.fn().mockImplementation(() => {
        return Promise.resolve([{ size: '0' }]);
      });

      const stats = await service.getStorageStats();

      expect(stats.oldestLogTimestamp).toBeNull();
      expect(stats.newestLogTimestamp).toBeNull();
      expect(stats.logCount).toBe(0);
    });

    it('should handle empty level counts', async () => {
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const results: unknown[] = [
          [{ count: 100 }],
          [{ oldest: '2024-01-01' }],
          [{ newest: '2024-12-31' }],
          [], // Empty level counts
          [],
        ];

        const result = results[selectCallCount - 1] || [];

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockReturnThis(),
            then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        };
      });

      mockDb.execute = vi.fn().mockImplementation(() => {
        return Promise.resolve([{ size: '1024' }]);
      });

      const stats = await service.getStorageStats();

      expect(stats.logCountsByLevel).toEqual({
        info: 0,
        debug: 0,
        warn: 0,
        error: 0,
      });
    });

    it('should handle unknown log levels gracefully', async () => {
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const results: unknown[] = [
          [{ count: 100 }],
          [{ oldest: '2024-01-01' }],
          [{ newest: '2024-12-31' }],
          [
            { level: 'info', count: 50 },
            { level: 'unknown_level', count: 25 }, // Unknown level
            { level: null, count: 10 }, // Null level
          ],
          [],
        ];

        const result = results[selectCallCount - 1] || [];

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockReturnThis(),
            then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        };
      });

      mockDb.execute = vi.fn().mockImplementation(() => {
        return Promise.resolve([{ size: '1024' }]);
      });

      const stats = await service.getStorageStats();

      // Only known level should be counted
      expect(stats.logCountsByLevel.info).toBe(50);
      expect(stats.logCountsByLevel.debug).toBe(0);
    });
  });

  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      const formatBytes = service['formatBytes'].bind(service);

      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1073741824)).toBe('1.00 GB');
    });

    it('should handle zero bytes', () => {
      const formatBytes = service['formatBytes'].bind(service);
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should handle edge case at KB boundary', () => {
      const formatBytes = service['formatBytes'].bind(service);
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('should handle edge case at MB boundary', () => {
      const formatBytes = service['formatBytes'].bind(service);
      expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KB');
    });

    it('should handle edge case at GB boundary', () => {
      const formatBytes = service['formatBytes'].bind(service);
      expect(formatBytes(1024 * 1024 * 1024 - 1)).toBe('1024.0 MB');
    });
  });

  describe('getInfoCutoffDate', () => {
    it('should calculate correct cutoff date', () => {
      const getCutoff = service['getInfoCutoffDate'].bind(service);

      const cutoff = getCutoff(30);

      const expected = new Date();
      expected.setDate(expected.getDate() - 30);

      // Compare dates within 1 second tolerance
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });

  describe('getErrorCutoffDate', () => {
    it('should calculate correct cutoff date', () => {
      const getCutoff = service['getErrorCutoffDate'].bind(service);

      const cutoff = getCutoff(90);

      const expected = new Date();
      expected.setDate(expected.getDate() - 90);

      // Compare dates within 1 second tolerance
      expect(Math.abs(cutoff.getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });

  describe('delay', () => {
    it('should delay for specified milliseconds', async () => {
      const delay = service['delay'].bind(service);
      const start = Date.now();

      await delay(50);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });

  describe('deleteLogsByServerAndLevel', () => {
    it('should delete logs for a server by specific levels', async () => {
      // Mock delete to return 5 deleted items
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) =>
                Promise.resolve([
                  { id: '1' },
                  { id: '2' },
                  { id: '3' },
                  { id: '4' },
                  { id: '5' },
                ]).then(resolve)
              ),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const result = await service.deleteLogsByServerAndLevel('server-1', ['error', 'warn']);

      expect(result.deleted).toBe(5);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should return zero when no logs match', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const result = await service.deleteLogsByServerAndLevel('server-1', ['debug']);

      expect(result.deleted).toBe(0);
    });

    it('should log deletion operation', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) => Promise.resolve([{ id: '1' }]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const logSpy = vi.spyOn(service['logger'], 'log');

      await service.deleteLogsByServerAndLevel('server-123', ['error']);

      expect(logSpy).toHaveBeenCalledWith('Deleting logs for server server-123, levels: error');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Deleted 1 logs'));
    });

    it('should clean up orphaned occurrences after deletion', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      await service.deleteLogsByServerAndLevel('server-1', ['info']);

      // Delete should be called twice: once for logs, once for orphaned occurrences
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple levels', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) =>
                Promise.resolve([{ id: '1' }, { id: '2' }]).then(resolve)
              ),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const result = await service.deleteLogsByServerAndLevel('server-1', [
        'error',
        'warn',
        'info',
      ]);

      expect(result.deleted).toBe(2);
    });
  });

  describe('deleteAllLogsByServer', () => {
    it('should delete all logs for a server', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) =>
                Promise.resolve([{ id: '1' }, { id: '2' }, { id: '3' }]).then(resolve)
              ),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const result = await service.deleteAllLogsByServer('server-1');

      expect(result.deleted).toBe(3);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return zero when server has no logs', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const result = await service.deleteAllLogsByServer('empty-server');

      expect(result.deleted).toBe(0);
    });

    it('should log deletion operation', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi
              .fn()
              .mockImplementation((resolve) =>
                Promise.resolve([{ id: '1' }, { id: '2' }]).then(resolve)
              ),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const logSpy = vi.spyOn(service['logger'], 'log');

      await service.deleteAllLogsByServer('server-456');

      expect(logSpy).toHaveBeenCalledWith('Deleting all logs for server server-456');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Deleted 2 logs'));
    });

    it('should clean up orphaned occurrences after deletion', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      await service.deleteAllLogsByServer('server-1');

      // Delete should be called twice: once for logs, once for orphaned occurrences
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteAllLogs', () => {
    it('should delete all logs globally', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockReturnValue({
          then: vi
            .fn()
            .mockImplementation((resolve) =>
              Promise.resolve([
                { id: '1' },
                { id: '2' },
                { id: '3' },
                { id: '4' },
                { id: '5' },
              ]).then(resolve)
            ),
          [Symbol.toStringTag]: 'Promise',
        }),
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const result = await service.deleteAllLogs();

      expect(result.deleted).toBe(5);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should return zero when database is empty', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        }),
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const result = await service.deleteAllLogs();

      expect(result.deleted).toBe(0);
    });

    it('should log warning for dangerous operation', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        }),
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const warnSpy = vi.spyOn(service['logger'], 'warn');

      await service.deleteAllLogs();

      expect(warnSpy).toHaveBeenCalledWith('Deleting ALL logs from database');
    });

    it('should clean up orphaned occurrences after deletion', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        }),
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      await service.deleteAllLogs();

      // Delete should be called twice: once for logs, once for orphaned occurrences
      expect(mockDb.delete).toHaveBeenCalledTimes(2);
    });

    it('should measure duration correctly', async () => {
      mockDb.delete = vi.fn().mockImplementation(() => ({
        returning: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((resolve) =>
            // Add small delay to ensure measurable duration
            new Promise((res) => setTimeout(() => res([{ id: '1' }]), 10)).then(resolve)
          ),
          [Symbol.toStringTag]: 'Promise',
        }),
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockReturnValue({
            then: vi.fn().mockImplementation((resolve) => Promise.resolve([]).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          }),
        }),
      }));

      const result = await service.deleteAllLogs();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
