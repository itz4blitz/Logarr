import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';

import { SettingsService } from './settings.service';

import type { TestingModule } from '@nestjs/testing';

describe('SettingsService', () => {
  let service: SettingsService;
  let mockDb: MockDb;
  let mockConfigService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDb = createMockDb();
    mockConfigService = {
      get: vi.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  describe('getAppSettings', () => {
    it('should return default app settings', () => {
      const result = service.getAppSettings();

      expect(result).toEqual({
        aiEnabled: true,
        autoAnalyzeIssues: false,
        issueRetentionDays: 90,
        logRetentionDays: 30,
      });
    });

    it('should have aiEnabled set to true', () => {
      const result = service.getAppSettings();

      expect(result.aiEnabled).toBe(true);
    });

    it('should have autoAnalyzeIssues set to false', () => {
      const result = service.getAppSettings();

      expect(result.autoAnalyzeIssues).toBe(false);
    });

    it('should have issueRetentionDays set to 90', () => {
      const result = service.getAppSettings();

      expect(result.issueRetentionDays).toBe(90);
    });

    it('should have logRetentionDays set to 30', () => {
      const result = service.getAppSettings();

      expect(result.logRetentionDays).toBe(30);
    });
  });

  describe('getSystemInfo', () => {
    it('should return system info with counts', async () => {
      // getSystemInfo uses count() which returns [{ count: N }]
      configureMockDb(mockDb, { select: [{ count: 2 }] });

      const result = await service.getSystemInfo();

      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('dbConnected');
      expect(result).toHaveProperty('serverCount');
      expect(result).toHaveProperty('logCount');
      expect(result).toHaveProperty('issueCount');
    });

    it('should return version 0.1.0', async () => {
      configureMockDb(mockDb, { select: [{ count: 0 }] });

      const result = await service.getSystemInfo();

      expect(result.version).toBe('0.1.0');
    });

    it('should indicate db connected when queries succeed', async () => {
      configureMockDb(mockDb, { select: [{ count: 0 }] });

      const result = await service.getSystemInfo();

      expect(result.dbConnected).toBe(true);
    });

    it('should count servers correctly', async () => {
      // getSystemInfo uses count() which returns [{ count: N }]
      configureMockDb(mockDb, { select: [{ count: 3 }] });

      const result = await service.getSystemInfo();

      expect(result.serverCount).toBe(3);
    });

    it('should handle database error gracefully', async () => {
      mockDb.select = vi.fn().mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const result = await service.getSystemInfo();

      expect(result.dbConnected).toBe(false);
      expect(result.serverCount).toBe(0);
      expect(result.logCount).toBe(0);
      expect(result.issueCount).toBe(0);
    });

    it('should return zero counts when database is empty', async () => {
      configureMockDb(mockDb, { select: [{ count: 0 }] });

      const result = await service.getSystemInfo();

      expect(result.serverCount).toBe(0);
      expect(result.logCount).toBe(0);
      expect(result.issueCount).toBe(0);
    });
  });

  describe('getRetentionSettings', () => {
    it('should return default retention settings from env vars', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultVal: string) => {
        const values: Record<string, string> = {
          LOG_CLEANUP_ENABLED: 'true',
          LOG_RETENTION_DAYS: '30',
          LOG_RETENTION_ERROR_DAYS: '90',
          LOG_CLEANUP_BATCH_SIZE: '10000',
        };
        return values[key] ?? defaultVal;
      });

      // Mock DB returning no results (use env var defaults)
      configureMockDb(mockDb, { select: [] });

      const result = await service.getRetentionSettings();

      expect(result.enabled).toBe(true);
      expect(result.infoRetentionDays).toBe(30);
      expect(result.errorRetentionDays).toBe(90);
      expect(result.batchSize).toBe(10000);
    });

    it('should return database values when they exist', async () => {
      configureMockDb(mockDb, { select: [{ value: 45 }] });

      const result = await service.getRetentionSettings();

      expect(result.infoRetentionDays).toBe(45);
    });

    it('should handle disabled cleanup from env', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultVal: string) => {
        if (key === 'LOG_CLEANUP_ENABLED') return 'false';
        return defaultVal;
      });
      configureMockDb(mockDb, { select: [] });

      const result = await service.getRetentionSettings();

      expect(result.enabled).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultVal: string) => defaultVal);
      mockDb.select = vi.fn().mockImplementation(() => {
        throw new Error('DB Error');
      });

      const result = await service.getRetentionSettings();

      // Should fall back to env/default values
      expect(result.enabled).toBe(true);
      expect(result.infoRetentionDays).toBe(30);
    });
  });

  describe('updateRetentionSettings', () => {
    it('should update enabled setting', async () => {
      configureMockDb(mockDb, { select: [{ value: false }] });

      const result = await service.updateRetentionSettings({ enabled: false });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should update infoRetentionDays setting', async () => {
      configureMockDb(mockDb, { select: [{ value: 14 }] });

      const result = await service.updateRetentionSettings({ infoRetentionDays: 14 });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should update errorRetentionDays setting', async () => {
      configureMockDb(mockDb, { select: [{ value: 60 }] });

      const result = await service.updateRetentionSettings({ errorRetentionDays: 60 });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should update batchSize setting', async () => {
      configureMockDb(mockDb, { select: [{ value: 5000 }] });

      const result = await service.updateRetentionSettings({ batchSize: 5000 });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should update multiple settings at once', async () => {
      configureMockDb(mockDb, { select: [{ value: 7 }] });

      const result = await service.updateRetentionSettings({
        enabled: true,
        infoRetentionDays: 7,
        errorRetentionDays: 21,
        batchSize: 2000,
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('getRetentionHistory', () => {
    it('should return retention history records', async () => {
      const mockHistory = [
        {
          id: 'hist-1',
          startedAt: new Date(),
          completedAt: new Date(),
          infoDeleted: 100,
          debugDeleted: 50,
          warnDeleted: 25,
          errorDeleted: 10,
          orphanedOccurrencesDeleted: 5,
          status: 'completed',
          errorMessage: null,
        },
      ];
      configureMockDb(mockDb, { select: mockHistory });

      const result = await service.getRetentionHistory(10);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('hist-1');
      expect(result[0]?.totalDeleted).toBe(185);
    });

    it('should return empty array when no history', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getRetentionHistory();

      expect(result).toEqual([]);
    });
  });

  describe('recordRetentionRun', () => {
    it('should record a new retention run', async () => {
      configureMockDb(mockDb, { insert: [{ id: 'new-run-id' }] });

      const result = await service.recordRetentionRun({
        startedAt: new Date(),
        status: 'running',
      });

      expect(result).toBe('new-run-id');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should record a completed run with all counts', async () => {
      configureMockDb(mockDb, { insert: [{ id: 'completed-id' }] });

      const result = await service.recordRetentionRun({
        startedAt: new Date(),
        completedAt: new Date(),
        infoDeleted: 100,
        debugDeleted: 50,
        warnDeleted: 25,
        errorDeleted: 10,
        orphanedOccurrencesDeleted: 5,
        status: 'completed',
      });

      expect(result).toBe('completed-id');
    });

    it('should record a failed run with error message', async () => {
      configureMockDb(mockDb, { insert: [{ id: 'failed-id' }] });

      const result = await service.recordRetentionRun({
        startedAt: new Date(),
        status: 'failed',
        errorMessage: 'Database connection lost',
      });

      expect(result).toBe('failed-id');
    });

    it('should return empty string when no id returned', async () => {
      configureMockDb(mockDb, { insert: [] });

      const result = await service.recordRetentionRun({
        startedAt: new Date(),
        status: 'running',
      });

      expect(result).toBe('');
    });
  });

  describe('updateRetentionRun', () => {
    it('should update a retention run status', async () => {
      configureMockDb(mockDb, { update: { rowCount: 1 } });

      await service.updateRetentionRun('run-id', {
        status: 'completed',
        completedAt: new Date(),
      });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should update run with deletion counts', async () => {
      configureMockDb(mockDb, { update: { rowCount: 1 } });

      await service.updateRetentionRun('run-id', {
        infoDeleted: 100,
        debugDeleted: 50,
        warnDeleted: 25,
        errorDeleted: 10,
        orphanedOccurrencesDeleted: 5,
        status: 'completed',
      });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should update run with error message on failure', async () => {
      configureMockDb(mockDb, { update: { rowCount: 1 } });

      await service.updateRetentionRun('run-id', {
        status: 'failed',
        errorMessage: 'Timeout exceeded',
      });

      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
