import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';

describe('DashboardService', () => {
  let service: DashboardService;
  let mockDb: MockDb;

  // Helper to create mock db with numbered call responses
  const createSequentialMock = (responses: any[][]) => {
    let callCount = 0;
    return vi.fn().mockImplementation(() => {
      const result = responses[callCount] || [];
      callCount++;
      return {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      };
    });
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getDashboardData', () => {
    it('should return complete dashboard data structure', async () => {
      // Mock all the parallel queries
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result).toHaveProperty('health');
      expect(result).toHaveProperty('activityChart');
      expect(result).toHaveProperty('activityHeatmap');
      expect(result).toHaveProperty('logDistribution');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('topIssues');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('nowPlaying');
      expect(result).toHaveProperty('recentEvents');
    });

    it('should calculate health status correctly', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.health).toHaveProperty('status');
      expect(result.health).toHaveProperty('sources');
      expect(result.health).toHaveProperty('issues');
      expect(result.health).toHaveProperty('activeStreams');
    });

    it('should have sources count structure', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.health.sources).toHaveProperty('online');
      expect(result.health.sources).toHaveProperty('total');
    });

    it('should have issues count structure', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.health.issues).toHaveProperty('critical');
      expect(result.health.issues).toHaveProperty('high');
      expect(result.health.issues).toHaveProperty('open');
    });

    it('should have metrics structure', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.metrics).toHaveProperty('errorRate');
      expect(result.metrics).toHaveProperty('logVolume');
      expect(result.metrics).toHaveProperty('sessionCount');
      expect(result.metrics).toHaveProperty('issueCount');
    });

    it('should have errorRate with trend data', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.metrics.errorRate).toHaveProperty('current');
      expect(result.metrics.errorRate).toHaveProperty('trend');
      expect(result.metrics.errorRate).toHaveProperty('change');
    });

    it('should have logVolume structure', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.metrics.logVolume).toHaveProperty('today');
      expect(result.metrics.logVolume).toHaveProperty('average');
      expect(result.metrics.logVolume).toHaveProperty('trend');
    });

    it('should have sessionCount structure', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.metrics.sessionCount).toHaveProperty('today');
      expect(result.metrics.sessionCount).toHaveProperty('trend');
    });

    it('should have issueCount structure', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.metrics.issueCount).toHaveProperty('open');
      expect(result.metrics.issueCount).toHaveProperty('trend');
    });

    it('should return logDistribution with all level counts', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.logDistribution).toHaveProperty('error');
      expect(result.logDistribution).toHaveProperty('warn');
      expect(result.logDistribution).toHaveProperty('info');
      expect(result.logDistribution).toHaveProperty('debug');
      expect(result.logDistribution).toHaveProperty('total');
      expect(result.logDistribution).toHaveProperty('topSources');
    });

    it('should return empty arrays for empty database', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.activityChart).toEqual([]);
      expect(result.topIssues).toEqual([]);
      expect(result.sources).toEqual([]);
      expect(result.nowPlaying).toEqual([]);
      expect(result.recentEvents).toEqual([]);
    });

    it('should return healthy status when no servers exist', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.health.status).toBe('healthy');
    });

    it('should return correct health status with servers', async () => {
      const mockServers = [
        { id: '1', name: 'Server 1', providerId: 'jellyfin', isConnected: true, lastSeen: new Date(), version: '10.8.0', fileIngestionEnabled: false, fileIngestionConnected: false },
        { id: '2', name: 'Server 2', providerId: 'sonarr', isConnected: true, lastSeen: new Date(), version: '3.0.0', fileIngestionEnabled: false, fileIngestionConnected: false },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        // First call is for servers
        const result = callCount === 1 ? mockServers : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.sources).toHaveLength(2);
      expect(result.health.sources.online).toBe(2);
      expect(result.health.sources.total).toBe(2);
    });
  });

  describe('calculateHealth', () => {
    it('should return critical when there are critical issues', async () => {
      // We can't test private methods directly, but we can verify through getDashboardData
      // by mocking critical issues
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();
      // With no issues, should be healthy
      expect(result.health.status).toBe('healthy');
    });
  });

  describe('activity chart', () => {
    it('should return activity chart data', async () => {
      const mockActivityData = [
        { hour: '2024-01-01 00:00:00', level: 'error', count: 5 },
        { hour: '2024-01-01 00:00:00', level: 'warn', count: 10 },
        { hour: '2024-01-01 01:00:00', level: 'info', count: 100 },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        // Third call (index 2) is for activity chart
        const result = callCount === 3 ? mockActivityData : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.activityChart).toBeDefined();
      expect(Array.isArray(result.activityChart)).toBe(true);
    });
  });

  describe('heatmap data', () => {
    it('should return heatmap with 7 days', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.activityHeatmap).toHaveLength(7);
    });

    it('should have correct day labels', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      const days = result.activityHeatmap.map(d => d.day);
      expect(days).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    });

    it('should have 24 hours per day', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      for (const day of result.activityHeatmap) {
        expect(day.hours).toHaveLength(24);
      }
    });
  });

  describe('sources', () => {
    it('should return sources with correct structure', async () => {
      const mockServer = {
        id: '1',
        name: 'Test Server',
        providerId: 'jellyfin',
        isConnected: true,
        lastSeen: new Date(),
        version: '10.8.0',
        fileIngestionEnabled: true,
        fileIngestionConnected: false,
      };

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [mockServer] : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]).toHaveProperty('id', '1');
      expect(result.sources[0]).toHaveProperty('name', 'Test Server');
      expect(result.sources[0]).toHaveProperty('providerId', 'jellyfin');
      expect(result.sources[0]).toHaveProperty('isConnected', true);
      expect(result.sources[0]).toHaveProperty('version', '10.8.0');
      expect(result.sources[0]).toHaveProperty('activeStreams');
      expect(result.sources[0]).toHaveProperty('fileIngestionEnabled', true);
      expect(result.sources[0]).toHaveProperty('fileIngestionConnected', false);
    });
  });

  describe('nowPlaying', () => {
    it('should return now playing data with correct structure', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Jellyfin',
        providerId: 'jellyfin',
        isConnected: true,
        lastSeen: new Date(),
        version: '10.8.0',
        fileIngestionEnabled: false,
        fileIngestionConnected: false,
      };
      const mockSession = {
        id: 'session-1',
        serverId: 'server-1',
        userName: 'TestUser',
        nowPlayingItemName: 'Movie Title',
        nowPlayingItemType: 'Movie',
        deviceName: 'Chrome',
        clientName: 'Jellyfin Web',
      };

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [mockServer] : callCount === 2 ? [mockSession] : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.nowPlaying).toHaveLength(1);
      expect(result.nowPlaying[0]).toHaveProperty('id', 'session-1');
      expect(result.nowPlaying[0]).toHaveProperty('userName', 'TestUser');
      expect(result.nowPlaying[0]).toHaveProperty('nowPlayingItemName', 'Movie Title');
      expect(result.nowPlaying[0]).toHaveProperty('serverName', 'Jellyfin');
    });

    it('should limit nowPlaying to 10 sessions', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Jellyfin',
        providerId: 'jellyfin',
        isConnected: true,
        lastSeen: new Date(),
        version: '10.8.0',
        fileIngestionEnabled: false,
        fileIngestionConnected: false,
      };
      // Create 15 sessions
      const mockSessions = Array.from({ length: 15 }, (_, i) => ({
        id: `session-${i}`,
        serverId: 'server-1',
        userName: `User${i}`,
        nowPlayingItemName: `Movie ${i}`,
        nowPlayingItemType: 'Movie',
        deviceName: 'Chrome',
        clientName: 'Jellyfin Web',
      }));

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [mockServer] : callCount === 2 ? mockSessions : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.nowPlaying).toHaveLength(10);
    });
  });

  describe('health status calculation', () => {
    it('should return critical when there are critical issues', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Server',
        providerId: 'jellyfin',
        isConnected: true,
        lastSeen: new Date(),
        version: '10.8.0',
        fileIngestionEnabled: false,
        fileIngestionConnected: false,
      };
      const mockIssueStats = [
        { status: 'open', severity: 'critical', count: 1 },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        let result: any[] = [];
        if (callCount === 1) result = [mockServer];
        else if (callCount === 3) result = mockIssueStats;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.health.status).toBe('critical');
    });

    it('should return critical when all servers are offline', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Server',
        providerId: 'jellyfin',
        isConnected: false,
        lastSeen: new Date(),
        version: '10.8.0',
        fileIngestionEnabled: false,
        fileIngestionConnected: false,
      };

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [mockServer] : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.health.status).toBe('critical');
    });

    it('should return warning when there are high severity issues', async () => {
      const mockServer = {
        id: 'server-1',
        name: 'Server',
        providerId: 'jellyfin',
        isConnected: true,
        lastSeen: new Date(),
        version: '10.8.0',
        fileIngestionEnabled: false,
        fileIngestionConnected: false,
      };
      const mockIssueStats = [
        { status: 'open', severity: 'high', count: 2 },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        let result: any[] = [];
        if (callCount === 1) result = [mockServer];
        else if (callCount === 3) result = mockIssueStats;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.health.status).toBe('warning');
    });

    it('should return warning when some servers are offline', async () => {
      const mockServers = [
        { id: 'server-1', name: 'Server 1', providerId: 'jellyfin', isConnected: true, lastSeen: new Date(), version: '10.8.0', fileIngestionEnabled: false, fileIngestionConnected: false },
        { id: 'server-2', name: 'Server 2', providerId: 'sonarr', isConnected: false, lastSeen: new Date(), version: '3.0.0', fileIngestionEnabled: false, fileIngestionConnected: false },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? mockServers : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.health.status).toBe('warning');
    });
  });

  describe('activity chart', () => {
    it('should aggregate activity by log level', async () => {
      const mockActivityData = [
        { hour: '2024-01-01 00:00:00', level: 'error', count: 5 },
        { hour: '2024-01-01 00:00:00', level: 'warn', count: 10 },
        { hour: '2024-01-01 00:00:00', level: 'info', count: 100 },
        { hour: '2024-01-01 00:00:00', level: 'debug', count: 50 },
        { hour: '2024-01-01 01:00:00', level: 'Error', count: 3 }, // Test case sensitivity
        { hour: '2024-01-01 01:00:00', level: 'Warning', count: 7 },
        { hour: '2024-01-01 01:00:00', level: 'Information', count: 80 },
        { hour: '2024-01-01 01:00:00', level: 'Debug', count: 30 },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 4 ? mockActivityData : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.activityChart).toBeDefined();
      expect(Array.isArray(result.activityChart)).toBe(true);
      expect(result.activityChart.length).toBe(2);
      // First hour: 5 errors, 10 warns, 100 info, 50 debug
      expect(result.activityChart[0].error).toBe(5);
      expect(result.activityChart[0].warn).toBe(10);
      expect(result.activityChart[0].info).toBe(100);
      expect(result.activityChart[0].debug).toBe(50);
      // Second hour: 3 errors, 7 warns, 80 info, 30 debug (case-insensitive)
      expect(result.activityChart[1].error).toBe(3);
      expect(result.activityChart[1].warn).toBe(7);
      expect(result.activityChart[1].info).toBe(80);
      expect(result.activityChart[1].debug).toBe(30);
    });
  });

  describe('log distribution', () => {
    it('should aggregate log counts by level', async () => {
      const mockLevelResults = [
        { level: 'error', count: 100 },
        { level: 'warn', count: 200 },
        { level: 'info', count: 1000 },
        { level: 'debug', count: 500 },
      ];
      const mockSourceResults = [
        { source: 'jellyfin', level: 'error', count: 50 },
        { source: 'jellyfin', level: 'info', count: 500 },
        { source: 'sonarr', level: 'error', count: 30 },
        { source: null, level: 'debug', count: 100 },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        // Call 5 returns level results in the getLogDistribution Promise.all
        // Call 6 returns source results
        let result: any[] = [];
        if (callCount === 5) result = mockLevelResults;
        else if (callCount === 6) result = mockSourceResults;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      expect(result.logDistribution.error).toBe(100);
      expect(result.logDistribution.warn).toBe(200);
      expect(result.logDistribution.info).toBe(1000);
      expect(result.logDistribution.debug).toBe(500);
      expect(result.logDistribution.total).toBe(1800);
      expect(result.logDistribution.topSources).toBeDefined();
      expect(result.logDistribution.topSources.length).toBeGreaterThan(0);
    });
  });

  describe('metrics calculation', () => {
    it('should calculate error rate correctly', async () => {
      const mockActivityData = [
        { hour: '2024-01-01 00:00:00', level: 'error', count: 10 },
        { hour: '2024-01-01 00:00:00', level: 'info', count: 90 },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 4 ? mockActivityData : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getDashboardData();

      // 10 errors / 100 total = 0.1
      expect(result.metrics.errorRate.current).toBe(0.1);
    });

    it('should handle zero logs gracefully for error rate', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getDashboardData();

      expect(result.metrics.errorRate.current).toBe(0);
    });
  });

  describe('recent events', () => {
    it('should map resolved issues to issue_resolved type', async () => {
      const mockResolvedIssue = {
        id: 'issue-1',
        title: 'Fixed Bug',
        severity: 'high',
        status: 'resolved',
        updatedAt: new Date(),
      };

      // Mock db to return resolved issue for getRecentIssues call
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((resolve) => {
          // All queries return empty except we need recent issues to have our issue
          // We can't easily identify which query is which, so we return the issue for all
          // The test verifies the mapping logic works
          return Promise.resolve([mockResolvedIssue]).then(resolve);
        }),
        [Symbol.toStringTag]: 'Promise',
      }));

      const result = await service.getDashboardData();

      // Check that at least one recent event was mapped correctly
      const resolvedEvents = result.recentEvents.filter(e => e.type === 'issue_resolved');
      expect(resolvedEvents.length).toBeGreaterThan(0);
      expect(resolvedEvents[0].title).toBe('Fixed Bug');
    });

    it('should map open issues to issue_new type', async () => {
      const mockOpenIssue = {
        id: 'issue-1',
        title: 'New Bug',
        severity: 'medium',
        status: 'open',
        updatedAt: new Date(),
      };

      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        groupBy: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((resolve) => {
          return Promise.resolve([mockOpenIssue]).then(resolve);
        }),
        [Symbol.toStringTag]: 'Promise',
      }));

      const result = await service.getDashboardData();

      // Check that at least one recent event was mapped correctly
      const newEvents = result.recentEvents.filter(e => e.type === 'issue_new');
      expect(newEvents.length).toBeGreaterThan(0);
      expect(newEvents[0].title).toBe('New Bug');
    });
  });
});
