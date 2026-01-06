import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SettingsService } from '../settings/settings.service';

import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

import type { TestingModule } from '@nestjs/testing';
import type { RetentionSettings } from '../settings/settings.service';
import type { RetentionConfig, StorageStats, CleanupPreview, RetentionResult } from './retention.dto';

describe('RetentionController', () => {
  let controller: RetentionController;
  let mockRetentionService: {
    getConfig: ReturnType<typeof vi.fn>;
    getStorageStats: ReturnType<typeof vi.fn>;
    previewCleanup: ReturnType<typeof vi.fn>;
    runCleanup: ReturnType<typeof vi.fn>;
  };
  let mockSettingsService: {
    getRetentionSettings: ReturnType<typeof vi.fn>;
    updateRetentionSettings: ReturnType<typeof vi.fn>;
    getRetentionHistory: ReturnType<typeof vi.fn>;
  };

  const mockConfig: RetentionConfig = {
    enabled: true,
    infoRetentionDays: 30,
    errorRetentionDays: 90,
    cleanupCron: '0 3 * * *',
    batchSize: 10000,
  };

  const mockStorageStats: StorageStats = {
    logCount: 1000,
    databaseSizeBytes: 1073741824,
    databaseSizeFormatted: '1.00 GB',
    oldestLogTimestamp: '2024-01-01T00:00:00Z',
    newestLogTimestamp: '2024-12-31T00:00:00Z',
    retentionConfig: mockConfig,
    logCountsByLevel: {
      info: 500,
      debug: 200,
      warn: 200,
      error: 100,
    },
    serverStats: [],
    ageDistribution: {
      last24h: 100,
      last7d: 300,
      last30d: 400,
      last90d: 150,
      older: 50,
    },
    tableSizes: {
      logEntries: 500000000,
      issues: 1000000,
      sessions: 500000,
      playbackEvents: 100000,
      total: 501600000,
    },
  };

  const mockCleanupPreview: CleanupPreview = {
    infoLogsToDelete: 100,
    debugLogsToDelete: 50,
    warnLogsToDelete: 25,
    errorLogsToDelete: 10,
    totalLogsToDelete: 185,
    estimatedSpaceSavingsBytes: 189440,
    estimatedSpaceSavingsFormatted: '185.0 KB',
    infoCutoffDate: '2024-11-01T00:00:00Z',
    errorCutoffDate: '2024-09-01T00:00:00Z',
  };

  const mockCleanupResult: RetentionResult = {
    success: true,
    info: 100,
    debug: 50,
    warn: 25,
    error: 10,
    orphanedOccurrences: 5,
    totalDeleted: 185,
    durationMs: 1234,
    startedAt: '2024-12-31T00:00:00Z',
    completedAt: '2024-12-31T00:00:01Z',
  };

  const mockRetentionSettings: RetentionSettings = {
    enabled: true,
    infoRetentionDays: 30,
    errorRetentionDays: 90,
    batchSize: 10000,
  };

  const mockRetentionHistory = [
    {
      id: 'history-1',
      startedAt: new Date('2024-12-30T03:00:00Z'),
      completedAt: new Date('2024-12-30T03:00:05Z'),
      infoDeleted: 100,
      debugDeleted: 50,
      warnDeleted: 25,
      errorDeleted: 10,
      orphanedOccurrencesDeleted: 5,
      totalDeleted: 185,
      status: 'completed',
      errorMessage: null,
    },
  ];

  beforeEach(async () => {
    mockRetentionService = {
      getConfig: vi.fn().mockResolvedValue(mockConfig),
      getStorageStats: vi.fn().mockResolvedValue(mockStorageStats),
      previewCleanup: vi.fn().mockResolvedValue(mockCleanupPreview),
      runCleanup: vi.fn().mockResolvedValue(mockCleanupResult),
    };

    mockSettingsService = {
      getRetentionSettings: vi.fn().mockResolvedValue(mockRetentionSettings),
      updateRetentionSettings: vi.fn().mockResolvedValue(mockRetentionSettings),
      getRetentionHistory: vi.fn().mockResolvedValue(mockRetentionHistory),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RetentionController],
      providers: [
        { provide: RetentionService, useValue: mockRetentionService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    controller = module.get<RetentionController>(RetentionController);
  });

  describe('getConfig', () => {
    it('should return retention configuration', async () => {
      const result = await controller.getConfig();

      expect(result).toEqual(mockConfig);
      expect(mockRetentionService.getConfig).toHaveBeenCalled();
    });

    it('should have correct config properties', async () => {
      const result = await controller.getConfig();

      expect(result).toHaveProperty('enabled');
      expect(result).toHaveProperty('infoRetentionDays');
      expect(result).toHaveProperty('errorRetentionDays');
      expect(result).toHaveProperty('cleanupCron');
      expect(result).toHaveProperty('batchSize');
    });
  });

  describe('getStats', () => {
    it('should return storage statistics', async () => {
      const result = await controller.getStats();

      expect(result).toEqual(mockStorageStats);
      expect(mockRetentionService.getStorageStats).toHaveBeenCalled();
    });

    it('should include all required properties', async () => {
      const result = await controller.getStats();

      expect(result).toHaveProperty('logCount');
      expect(result).toHaveProperty('databaseSizeBytes');
      expect(result).toHaveProperty('databaseSizeFormatted');
      expect(result).toHaveProperty('oldestLogTimestamp');
      expect(result).toHaveProperty('newestLogTimestamp');
      expect(result).toHaveProperty('retentionConfig');
      expect(result).toHaveProperty('logCountsByLevel');
      expect(result).toHaveProperty('serverStats');
      expect(result).toHaveProperty('ageDistribution');
    });
  });

  describe('previewCleanup', () => {
    it('should return cleanup preview', async () => {
      const result = await controller.previewCleanup();

      expect(result).toEqual(mockCleanupPreview);
      expect(mockRetentionService.previewCleanup).toHaveBeenCalled();
    });

    it('should include deletion counts for all levels', async () => {
      const result = await controller.previewCleanup();

      expect(result).toHaveProperty('infoLogsToDelete');
      expect(result).toHaveProperty('debugLogsToDelete');
      expect(result).toHaveProperty('warnLogsToDelete');
      expect(result).toHaveProperty('errorLogsToDelete');
      expect(result).toHaveProperty('totalLogsToDelete');
    });

    it('should include space savings estimate', async () => {
      const result = await controller.previewCleanup();

      expect(result).toHaveProperty('estimatedSpaceSavingsBytes');
      expect(result).toHaveProperty('estimatedSpaceSavingsFormatted');
    });

    it('should include cutoff dates', async () => {
      const result = await controller.previewCleanup();

      expect(result).toHaveProperty('infoCutoffDate');
      expect(result).toHaveProperty('errorCutoffDate');
    });
  });

  describe('runCleanup', () => {
    it('should run cleanup and return result', async () => {
      const result = await controller.runCleanup();

      expect(result).toEqual(mockCleanupResult);
      expect(mockRetentionService.runCleanup).toHaveBeenCalled();
    });

    it('should return success status', async () => {
      const result = await controller.runCleanup();

      expect(result.success).toBe(true);
    });

    it('should include deletion counts', async () => {
      const result = await controller.runCleanup();

      expect(result).toHaveProperty('info');
      expect(result).toHaveProperty('debug');
      expect(result).toHaveProperty('warn');
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('orphanedOccurrences');
      expect(result).toHaveProperty('totalDeleted');
    });

    it('should include timing information', async () => {
      const result = await controller.runCleanup();

      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('completedAt');
    });

    it('should log cleanup trigger', async () => {
      const logSpy = vi.spyOn(controller['logger'], 'log');

      await controller.runCleanup();

      expect(logSpy).toHaveBeenCalledWith('Manual cleanup triggered via API');
    });
  });

  describe('getSettings', () => {
    it('should return retention settings', async () => {
      const result = await controller.getSettings();

      expect(result).toEqual(mockRetentionSettings);
      expect(mockSettingsService.getRetentionSettings).toHaveBeenCalled();
    });

    it('should include all settings properties', async () => {
      const result = await controller.getSettings();

      expect(result).toHaveProperty('enabled');
      expect(result).toHaveProperty('infoRetentionDays');
      expect(result).toHaveProperty('errorRetentionDays');
      expect(result).toHaveProperty('batchSize');
    });
  });

  describe('updateSettings', () => {
    it('should update settings and return updated values', async () => {
      const newSettings: Partial<RetentionSettings> = {
        enabled: false,
        infoRetentionDays: 14,
      };

      const updatedSettings = {
        ...mockRetentionSettings,
        ...newSettings,
      };
      mockSettingsService.updateRetentionSettings.mockResolvedValue(updatedSettings);

      const result = await controller.updateSettings(newSettings);

      expect(result.enabled).toBe(false);
      expect(result.infoRetentionDays).toBe(14);
      expect(mockSettingsService.updateRetentionSettings).toHaveBeenCalledWith(newSettings);
    });

    it('should log settings update', async () => {
      const logSpy = vi.spyOn(controller['logger'], 'log');
      const newSettings: Partial<RetentionSettings> = { enabled: false };

      await controller.updateSettings(newSettings);

      expect(logSpy).toHaveBeenCalledWith(
        `Updating retention settings: ${JSON.stringify(newSettings)}`
      );
    });

    it('should allow partial updates', async () => {
      const partialSettings: Partial<RetentionSettings> = { batchSize: 5000 };

      await controller.updateSettings(partialSettings);

      expect(mockSettingsService.updateRetentionSettings).toHaveBeenCalledWith(partialSettings);
    });
  });

  describe('getHistory', () => {
    it('should return cleanup history with default limit', async () => {
      const result = await controller.getHistory();

      expect(result).toEqual(mockRetentionHistory);
      expect(mockSettingsService.getRetentionHistory).toHaveBeenCalledWith(20);
    });

    it('should accept custom limit', async () => {
      await controller.getHistory('50');

      expect(mockSettingsService.getRetentionHistory).toHaveBeenCalledWith(50);
    });

    it('should parse limit as integer', async () => {
      await controller.getHistory('10');

      expect(mockSettingsService.getRetentionHistory).toHaveBeenCalledWith(10);
    });

    it('should include history entry properties', async () => {
      const result = await controller.getHistory();

      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('startedAt');
      expect(result[0]).toHaveProperty('completedAt');
      expect(result[0]).toHaveProperty('status');
      expect(result[0]).toHaveProperty('infoDeleted');
      expect(result[0]).toHaveProperty('debugDeleted');
      expect(result[0]).toHaveProperty('warnDeleted');
      expect(result[0]).toHaveProperty('errorDeleted');
    });
  });
});
