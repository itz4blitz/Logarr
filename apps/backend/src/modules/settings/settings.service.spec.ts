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
});
