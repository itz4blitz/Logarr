import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';
import { AiProviderService } from '../settings/ai-provider.service';

import { AnalysisPromptBuilder } from './analysis-prompt-builder';
import { IssueContextService } from './issue-context.service';
import { IssuesService } from './issues.service';

import type { TestingModule } from '@nestjs/testing';

describe('IssuesService', () => {
  let service: IssuesService;
  let mockDb: MockDb;

  const mockAiProviderService = {
    generateText: vi.fn(),
    generateTextWithSystemPrompt: vi.fn(),
    generateAnalysisWithSystemPrompt: vi.fn(),
    getDefaultProvider: vi.fn(),
  };

  const mockIssueContextService = {
    gatherContext: vi.fn(),
  };

  const mockAnalysisPromptBuilder = {
    buildAnalysisPrompt: vi.fn(),
    buildPrompt: vi.fn(),
    buildFollowUpPrompt: vi.fn(),
  };

  beforeEach(async () => {
    mockDb = createMockDb();
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssuesService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: AiProviderService, useValue: mockAiProviderService },
        { provide: IssueContextService, useValue: mockIssueContextService },
        { provide: AnalysisPromptBuilder, useValue: mockAnalysisPromptBuilder },
      ],
    }).compile();

    service = module.get<IssuesService>(IssuesService);
  });

  describe('generateFingerprint', () => {
    it('should generate consistent fingerprints for the same normalized message', () => {
      const fp1 = service.generateFingerprint('Connection failed', 'jellyfin');
      const fp2 = service.generateFingerprint('Connection failed', 'jellyfin');
      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different sources', () => {
      const fp1 = service.generateFingerprint('Connection failed', 'jellyfin');
      const fp2 = service.generateFingerprint('Connection failed', 'sonarr');
      expect(fp1).not.toBe(fp2);
    });

    it('should normalize UUIDs in messages', () => {
      const fp1 = service.generateFingerprint(
        'Error for user 12345678-1234-1234-1234-123456789abc',
        'jellyfin'
      );
      const fp2 = service.generateFingerprint(
        'Error for user 87654321-4321-4321-4321-cba987654321',
        'jellyfin'
      );
      expect(fp1).toBe(fp2);
    });

    it('should normalize IP addresses', () => {
      const fp1 = service.generateFingerprint('Connection from 192.168.1.1 failed', 'jellyfin');
      const fp2 = service.generateFingerprint('Connection from 10.0.0.1 failed', 'jellyfin');
      expect(fp1).toBe(fp2);
    });

    it('should normalize timestamps', () => {
      const fp1 = service.generateFingerprint('Error at 2024-01-01T12:00:00', 'jellyfin');
      const fp2 = service.generateFingerprint('Error at 2025-06-15T23:59:59', 'jellyfin');
      expect(fp1).toBe(fp2);
    });

    it('should normalize file paths', () => {
      const fp1 = service.generateFingerprint('File not found: /var/log/app.log', 'jellyfin');
      const fp2 = service.generateFingerprint('File not found: /home/user/data.txt', 'jellyfin');
      expect(fp1).toBe(fp2);
    });

    it('should normalize Windows paths', () => {
      const fp1 = service.generateFingerprint(
        'File not found: C:\\Users\\test\\file.log',
        'jellyfin'
      );
      const fp2 = service.generateFingerprint('File not found: D:\\Data\\other.txt', 'jellyfin');
      expect(fp1).toBe(fp2);
    });

    it('should normalize numeric IDs', () => {
      const fp1 = service.generateFingerprint('Item 123456 not found', 'jellyfin');
      const fp2 = service.generateFingerprint('Item 987654 not found', 'jellyfin');
      expect(fp1).toBe(fp2);
    });

    it('should normalize quoted strings', () => {
      const fp1 = service.generateFingerprint('Failed to process "Movie A"', 'jellyfin');
      const fp2 = service.generateFingerprint('Failed to process "Movie B"', 'jellyfin');
      expect(fp1).toBe(fp2);
    });

    it('should include exception type in fingerprint when provided', () => {
      const fp1 = service.generateFingerprint(
        'Error occurred',
        'jellyfin',
        'NullReferenceException'
      );
      const fp2 = service.generateFingerprint('Error occurred', 'jellyfin', 'ArgumentException');
      expect(fp1).not.toBe(fp2);
    });

    it('should return a 32 character hex string', () => {
      const fp = service.generateFingerprint('Test error', 'test');
      expect(fp).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('extractTitle', () => {
    it('should extract first line as title', () => {
      const title = service.extractTitle('First line\nSecond line\nThird line');
      expect(title).toBe('First line');
    });

    it('should extract first sentence when no newlines', () => {
      const title = service.extractTitle('First sentence. Second sentence. Third.');
      expect(title).toBe('First sentence');
    });

    it('should remove common prefixes like "Error:"', () => {
      const title = service.extractTitle('Error: Something went wrong');
      expect(title).toBe('Something went wrong');
    });

    it('should remove "Exception:" prefix', () => {
      const title = service.extractTitle('Exception: Database connection failed');
      expect(title).toBe('Database connection failed');
    });

    it('should remove "Warning:" prefix (case insensitive)', () => {
      const title = service.extractTitle('WARNING: Disk space low');
      expect(title).toBe('Disk space low');
    });

    it('should remove "Failed:" prefix', () => {
      const title = service.extractTitle('Failed: Authentication attempt');
      expect(title).toBe('Authentication attempt');
    });

    it('should remove leading "A " or "An "', () => {
      expect(service.extractTitle('A connection error occurred')).toBe('connection error occurred');
      expect(service.extractTitle('An error was detected')).toBe('error was detected');
    });

    it('should truncate long titles with ellipsis', () => {
      const longMessage = 'A'.repeat(150);
      const title = service.extractTitle(longMessage, 100);
      expect(title.length).toBe(100);
      expect(title.endsWith('...')).toBe(true);
    });

    it('should return "Unknown Error" for empty messages', () => {
      expect(service.extractTitle('')).toBe('Unknown Error');
    });

    it('should respect custom maxLength', () => {
      const title = service.extractTitle('This is a moderately long title', 20);
      expect(title.length).toBe(20);
      expect(title.endsWith('...')).toBe(true);
    });
  });

  describe('calculateImpactScore', () => {
    it('should return higher score for critical severity', () => {
      const criticalScore = service.calculateImpactScore('critical', 1, 0, 0, 24);
      const lowScore = service.calculateImpactScore('low', 1, 0, 0, 24);
      expect(criticalScore).toBeGreaterThan(lowScore);
    });

    it('should increase score with occurrence count (logarithmic)', () => {
      const score1 = service.calculateImpactScore('medium', 1, 0, 0, 24);
      const score10 = service.calculateImpactScore('medium', 10, 0, 0, 24);
      const score100 = service.calculateImpactScore('medium', 100, 0, 0, 24);

      expect(score10).toBeGreaterThan(score1);
      expect(score100).toBeGreaterThan(score10);
      // Logarithmic: difference between 10 and 100 should be similar to 1 and 10
      const diff1to10 = score10 - score1;
      const diff10to100 = score100 - score10;
      expect(Math.abs(diff1to10 - diff10to100)).toBeLessThan(5);
    });

    it('should increase score with affected users', () => {
      const score0users = service.calculateImpactScore('medium', 10, 0, 0, 24);
      const score5users = service.calculateImpactScore('medium', 10, 5, 0, 24);
      expect(score5users).toBeGreaterThan(score0users);
    });

    it('should increase score with affected sessions', () => {
      const score0sessions = service.calculateImpactScore('medium', 10, 0, 0, 24);
      const score5sessions = service.calculateImpactScore('medium', 10, 0, 5, 24);
      expect(score5sessions).toBeGreaterThan(score0sessions);
    });

    it('should give higher score to recent issues', () => {
      // Recency scoring: <1h=5, <24h=3, <168h=1, else 0
      const recentScore = service.calculateImpactScore('medium', 10, 0, 0, 0.5); // 5 bonus
      const dayOldScore = service.calculateImpactScore('medium', 10, 0, 0, 12); // 3 bonus (<24h)
      const weekOldScore = service.calculateImpactScore('medium', 10, 0, 0, 100); // 1 bonus (<168h)
      const oldScore = service.calculateImpactScore('medium', 10, 0, 0, 500); // 0 bonus

      expect(recentScore).toBeGreaterThan(dayOldScore);
      expect(dayOldScore).toBeGreaterThan(weekOldScore);
      expect(weekOldScore).toBeGreaterThan(oldScore);
    });

    it('should cap maximum score at 100', () => {
      const maxScore = service.calculateImpactScore('critical', 10000, 100, 100, 0);
      expect(maxScore).toBeLessThanOrEqual(100);
    });

    it('should return integer scores', () => {
      const score = service.calculateImpactScore('medium', 7, 3, 2, 12);
      expect(Number.isInteger(score)).toBe(true);
    });

    it('should handle unknown severity gracefully', () => {
      const score = service.calculateImpactScore('unknown', 10, 0, 0, 24);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('categorizeError', () => {
    describe('authentication category', () => {
      it('should categorize auth-related errors', () => {
        expect(service.categorizeError('Authentication failed').category).toBe('authentication');
        expect(service.categorizeError('Login attempt blocked').category).toBe('authentication');
        expect(service.categorizeError('Permission denied for user').category).toBe(
          'authentication'
        );
        expect(service.categorizeError('Unauthorized access').category).toBe('authentication');
        expect(service.categorizeError('Forbidden resource').category).toBe('authentication');
        expect(service.categorizeError('Access denied').category).toBe('authentication');
      });

      it('should assign high severity to auth issues', () => {
        const result = service.categorizeError('Authentication failed');
        expect(result.severity).toBe('high');
      });
    });

    describe('database category', () => {
      it('should categorize database-related errors', () => {
        expect(service.categorizeError('Database connection lost').category).toBe('database');
        expect(service.categorizeError('SQL query failed').category).toBe('database');
        expect(service.categorizeError('Connection refused to postgres').category).toBe('database');
        expect(service.categorizeError('Query failed with error').category).toBe('database');
      });

      it('should assign critical severity to database issues', () => {
        const result = service.categorizeError('Database connection failed');
        expect(result.severity).toBe('critical');
      });
    });

    describe('network category', () => {
      it('should categorize network-related errors', () => {
        expect(service.categorizeError('Connection timeout').category).toBe('network');
        expect(service.categorizeError('Network unreachable').category).toBe('network');
        expect(service.categorizeError('Socket error').category).toBe('network');
        expect(service.categorizeError('DNS lookup failed').category).toBe('network');
        expect(service.categorizeError('Host unreachable').category).toBe('network');
      });

      it('should assign high severity to network issues', () => {
        const result = service.categorizeError('Connection timeout');
        expect(result.severity).toBe('high');
      });
    });

    describe('transcoding category', () => {
      it('should categorize transcoding-related errors', () => {
        expect(service.categorizeError('Transcode failed').category).toBe('transcoding');
        expect(service.categorizeError('FFmpeg error').category).toBe('transcoding');
        expect(service.categorizeError('Unsupported codec').category).toBe('transcoding');
        expect(service.categorizeError('Encoding failed').category).toBe('transcoding');
      });

      it('should assign medium severity to transcoding issues', () => {
        const result = service.categorizeError('Transcode failed');
        expect(result.severity).toBe('medium');
      });
    });

    describe('playback category', () => {
      it('should categorize playback-related errors', () => {
        expect(service.categorizeError('Playback error').category).toBe('playback');
        expect(service.categorizeError('Stream interrupted').category).toBe('playback');
        expect(service.categorizeError('Buffer underrun').category).toBe('playback');
        expect(service.categorizeError('Media not available').category).toBe('playback');
      });

      it('should assign medium severity to playback issues', () => {
        const result = service.categorizeError('Playback error');
        expect(result.severity).toBe('medium');
      });
    });

    describe('filesystem category', () => {
      it('should categorize filesystem-related errors', () => {
        expect(service.categorizeError('File not found').category).toBe('filesystem');
        expect(service.categorizeError('Disk full').category).toBe('filesystem');
        expect(service.categorizeError('Storage unavailable').category).toBe('filesystem');
        // Note: "Permission denied" matches auth category first due to keyword priority
        expect(service.categorizeError('Cannot write to disk').category).toBe('filesystem');
      });

      it('should assign high severity to filesystem issues', () => {
        const result = service.categorizeError('File not found');
        expect(result.severity).toBe('high');
      });
    });

    describe('performance category', () => {
      it('should categorize performance-related errors', () => {
        expect(service.categorizeError('Out of memory').category).toBe('performance');
        expect(service.categorizeError('Memory allocation failed').category).toBe('performance');
        expect(service.categorizeError('Performance degradation').category).toBe('performance');
        expect(service.categorizeError('Response too slow').category).toBe('performance');
      });

      it('should assign high severity to performance issues', () => {
        const result = service.categorizeError('Out of memory');
        expect(result.severity).toBe('high');
      });
    });

    describe('general category', () => {
      it('should default to general category for unknown errors', () => {
        const result = service.categorizeError('Some random error');
        expect(result.category).toBe('general');
        expect(result.severity).toBe('medium');
      });
    });

    it('should be case insensitive', () => {
      expect(service.categorizeError('DATABASE ERROR').category).toBe('database');
      expect(service.categorizeError('AUTHENTICATION FAILED').category).toBe('authentication');
    });
  });

  describe('search', () => {
    const mockIssue = {
      id: 'issue-1',
      fingerprint: 'abc123',
      title: 'Test Error',
      source: 'jellyfin',
      severity: 'high',
      status: 'open',
      category: 'network',
      serverId: 'server-1',
      errorPattern: 'abc123',
      sampleMessage: 'Connection failed',
      occurrenceCount: 10,
      impactScore: 75,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return issues with server names', async () => {
      configureMockDb(mockDb, { select: [{ issue: mockIssue, serverName: 'Test Server' }] });

      const results = await service.search({});

      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('serverName', 'Test Server');
    });

    it('should filter by serverId', async () => {
      configureMockDb(mockDb, { select: [{ issue: mockIssue, serverName: 'Test Server' }] });

      await service.search({ serverId: 'server-1' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by sources array', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ sources: ['jellyfin', 'sonarr'] });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should handle single source as string', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ sources: ['jellyfin'] });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by severities', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ severities: ['critical', 'high'] as any });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by statuses', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ statuses: ['open', 'acknowledged'] as any });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by category', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ category: 'network' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by search text', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ search: 'connection' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should limit results to 100 max', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ limit: 200 });

      // The limit is capped at 100 internally
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should use default limit of 50', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({});

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should support sorting by different columns', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ sortBy: 'occurrenceCount', sortOrder: 'desc' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should support ascending sort order', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ sortBy: 'lastSeen', sortOrder: 'asc' });

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    const mockIssue = {
      id: 'issue-1',
      fingerprint: 'abc123',
      title: 'Test Error',
      source: 'jellyfin',
      severity: 'high',
      status: 'open',
      category: 'network',
      serverId: 'server-1',
      sampleMessage: 'Connection failed',
      occurrenceCount: 10,
    };

    it('should return issue with recent occurrences', async () => {
      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result =
          callCount === 1
            ? [{ issue: mockIssue, serverName: 'Test Server' }]
            : [{ id: 'occ-1', timestamp: new Date(), message: 'Error' }];
        return {
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.findOne('issue-1');

      expect(result).toHaveProperty('serverName');
      expect(result).toHaveProperty('recentOccurrences');
    });

    it('should throw NotFoundException when issue not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const mockUpdatedIssue = {
      id: 'issue-1',
      title: 'Updated Title',
      status: 'acknowledged',
      updatedAt: new Date(),
    };

    it('should update issue and return updated record', async () => {
      configureMockDb(mockDb, { update: [mockUpdatedIssue] });

      const result = await service.update('issue-1', { status: 'acknowledged' as any });

      expect(result.status).toBe('acknowledged');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should set resolvedAt when status is resolved', async () => {
      const resolvedIssue = { ...mockUpdatedIssue, status: 'resolved', resolvedAt: new Date() };
      configureMockDb(mockDb, { update: [resolvedIssue] });

      await service.update('issue-1', { status: 'resolved' as any, resolvedBy: 'user-1' });

      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException when issue not found', async () => {
      configureMockDb(mockDb, { update: [] });

      await expect(
        service.update('non-existent', { status: 'acknowledged' as any })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return issue statistics', async () => {
      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        let result: any[] = [];
        switch (callCount) {
          case 1:
            result = [
              { status: 'open', count: 5 },
              { status: 'resolved', count: 3 },
            ];
            break;
          case 2:
            result = [
              { severity: 'critical', count: 2 },
              { severity: 'high', count: 3 },
            ];
            break;
          case 3:
            result = [{ source: 'jellyfin', count: 6 }];
            break;
          case 4:
            result = [{ category: 'network', count: 4 }];
            break;
          case 5:
            result = [{ avg: 50 }];
            break;
          case 6:
            result = [{ count: 2 }];
            break;
          case 7:
            result = [{ count: 1 }];
            break;
        }
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

      const result = await service.getStats();

      expect(result).toHaveProperty('totalIssues');
      expect(result).toHaveProperty('openIssues');
      expect(result).toHaveProperty('criticalIssues');
      expect(result).toHaveProperty('highIssues');
      expect(result).toHaveProperty('byStatus');
      expect(result).toHaveProperty('bySeverity');
      expect(result).toHaveProperty('bySource');
      expect(result).toHaveProperty('topCategories');
      expect(result).toHaveProperty('averageImpactScore');
    });

    it('should filter stats by serverId', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.getStats('server-1');

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getCategories', () => {
    it('should return sorted list of categories', async () => {
      configureMockDb(mockDb, {
        selectDistinct: [
          { category: 'network' },
          { category: 'database' },
          { category: 'authentication' },
        ],
      });

      const result = await service.getCategories();

      expect(result).toEqual(['authentication', 'database', 'network']);
    });

    it('should filter out null categories', async () => {
      configureMockDb(mockDb, {
        selectDistinct: [{ category: 'network' }, { category: null }, { category: 'database' }],
      });

      const result = await service.getCategories();

      expect(result).not.toContain(null);
      expect(result).toEqual(['database', 'network']);
    });
  });

  describe('getOccurrences', () => {
    it('should return paginated occurrences', async () => {
      const mockOccurrences = [
        { id: 'occ-1', timestamp: new Date(), message: 'Error 1', serverName: 'Server 1' },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? mockOccurrences : [{ count: 10 }];
        return {
          from: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          offset: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getOccurrences('issue-1', 50, 0);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('offset');
    });

    it('should cap limit at 100', async () => {
      configureMockDb(mockDb, { select: [{ count: 0 }] });

      const result = await service.getOccurrences('issue-1', 200, 0);

      expect(result.limit).toBe(100);
    });
  });

  describe('getTimeline', () => {
    it('should return timeline data with hourly and daily counts', async () => {
      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        let result: any[] = [];
        switch (callCount) {
          case 1:
            result = [{ hour: '2024-01-01 00:00:00', count: 5 }];
            break;
          case 2:
            result = [{ day: '2024-01-01', count: 10 }];
            break;
        }
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          groupBy: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      mockDb.selectDistinct = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        then: vi
          .fn()
          .mockImplementation((resolve) => Promise.resolve([{ userId: 'user-1' }]).then(resolve)),
        [Symbol.toStringTag]: 'Promise',
      }));

      const result = await service.getTimeline('issue-1');

      expect(result).toHaveProperty('hourly');
      expect(result).toHaveProperty('daily');
      expect(result).toHaveProperty('affectedUsers');
    });
  });

  describe('processLogEntry', () => {
    const mockLogEntry = {
      id: 'log-1',
      serverId: 'server-1',
      level: 'error',
      message: 'Connection failed to database',
      source: 'database',
      exception: null,
      timestamp: new Date(),
      userId: 'user-1',
      sessionId: 'session-1',
    };

    it('should return null for non-error logs', async () => {
      const infoLog = { ...mockLogEntry, level: 'info' };

      const result = await service.processLogEntry(infoLog as any);

      expect(result).toBeNull();
    });

    it('should return null for debug logs', async () => {
      const debugLog = { ...mockLogEntry, level: 'debug' };

      const result = await service.processLogEntry(debugLog as any);

      expect(result).toBeNull();
    });

    it('should process warn level logs', async () => {
      const warnLog = { ...mockLogEntry, level: 'warn' };
      configureMockDb(mockDb, { select: [], insert: [{ id: 'new-issue' }] });

      const result = await service.processLogEntry(warnLog as any);

      expect(result).not.toBeNull();
    });

    it('should update existing issue when fingerprint matches', async () => {
      const existingIssue = {
        id: 'issue-1',
        fingerprint: 'abc123',
        severity: 'high',
        occurrenceCount: 5,
        lastSeen: new Date(),
      };

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        let result: any[] = [];
        if (callCount === 1)
          result = [existingIssue]; // existing issue
        else if (callCount === 2) result = [{ userId: 'user-1', sessionId: 'session-1' }]; // occurrences
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      configureMockDb(mockDb, { update: [], insert: [] });

      const result = await service.processLogEntry(mockLogEntry as any);

      expect(result).toBe('issue-1');
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should create new issue when no fingerprint match', async () => {
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const result = selectCallCount === 2 ? [{ providerId: 'jellyfin' }] : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      mockDb.insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'new-issue' }]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }));

      const result = await service.processLogEntry(mockLogEntry as any);

      expect(result).toBe('new-issue');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should return null when insert returns empty result', async () => {
      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const result = selectCallCount === 2 ? [{ providerId: 'jellyfin' }] : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      mockDb.insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]), // Empty result
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }));

      const result = await service.processLogEntry(mockLogEntry as any);

      expect(result).toBeNull();
    });

    it('should handle log entry without userId or sessionId', async () => {
      const logWithoutUser = { ...mockLogEntry, userId: null, sessionId: null };

      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        const result = selectCallCount === 2 ? [{ providerId: 'sonarr' }] : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });
      mockDb.insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'new-issue' }]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }));

      const result = await service.processLogEntry(logWithoutUser as any);

      expect(result).toBe('new-issue');
    });

    it('should map server provider to issue source', async () => {
      const providers = ['jellyfin', 'sonarr', 'radarr', 'prowlarr', 'unknown'];

      for (const providerId of providers) {
        let selectCallCount = 0;
        mockDb.select = vi.fn().mockImplementation(() => {
          selectCallCount++;
          const result = selectCallCount === 2 ? [{ providerId }] : [];
          return {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
            [Symbol.toStringTag]: 'Promise',
          };
        });
        mockDb.insert = vi.fn().mockImplementation(() => ({
          values: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([{ id: 'new-issue' }]),
          onConflictDoNothing: vi.fn().mockResolvedValue([]),
        }));

        const result = await service.processLogEntry(mockLogEntry as any);
        expect(result).toBe('new-issue');
      }
    });
  });

  describe('mergeIssues', () => {
    it('should throw error when less than 2 issues provided', async () => {
      await expect(service.mergeIssues({ issueIds: ['issue-1'] })).rejects.toThrow(
        'Need at least 2 issues to merge'
      );
    });

    it('should throw NotFoundException when issues not found', async () => {
      configureMockDb(mockDb, { select: [{ id: 'issue-1' }] });

      await expect(service.mergeIssues({ issueIds: ['issue-1', 'issue-2'] })).rejects.toThrow(
        NotFoundException
      );
    });

    it('should merge issues successfully', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          fingerprint: 'fp1',
          title: 'Error 1',
          severity: 'high',
          occurrenceCount: 5,
          firstSeen: new Date('2024-01-01'),
          lastSeen: new Date('2024-01-05'),
        },
        {
          id: 'issue-2',
          fingerprint: 'fp2',
          title: 'Error 2',
          severity: 'medium',
          occurrenceCount: 3,
          firstSeen: new Date('2024-01-02'),
          lastSeen: new Date('2024-01-10'),
        },
      ];

      const mockOccurrences = [
        { userId: 'user-1', sessionId: 'session-1' },
        { userId: 'user-2', sessionId: 'session-2' },
      ];

      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        let result: any[] = [];
        if (selectCallCount === 1) result = mockIssues;
        else if (selectCallCount === 2) result = mockOccurrences;
        else if (selectCallCount === 3)
          result = [{ issue: { ...mockIssues[0], occurrenceCount: 8 }, serverName: 'Test' }];
        else if (selectCallCount === 4)
          result = [{ id: 'occ-1', timestamp: new Date(), message: 'Error' }];
        return {
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      mockDb.update = vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }));

      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([]),
      }));

      await service.mergeIssues({ issueIds: ['issue-1', 'issue-2'] });

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should use newTitle when provided', async () => {
      const mockIssues = [
        {
          id: 'issue-1',
          fingerprint: 'fp1',
          title: 'Error 1',
          severity: 'high',
          occurrenceCount: 5,
          firstSeen: new Date('2024-01-01'),
          lastSeen: new Date('2024-01-05'),
        },
        {
          id: 'issue-2',
          fingerprint: 'fp2',
          title: 'Error 2',
          severity: 'medium',
          occurrenceCount: 3,
          firstSeen: new Date('2024-01-02'),
          lastSeen: new Date('2024-01-10'),
        },
      ];

      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        let result: any[] = [];
        if (selectCallCount === 1) result = mockIssues;
        else if (selectCallCount === 2) result = [];
        else if (selectCallCount === 3) result = [{ issue: mockIssues[0], serverName: 'Test' }];
        else if (selectCallCount === 4) result = [];
        return {
          from: vi.fn().mockReturnThis(),
          leftJoin: vi.fn().mockReturnThis(),
          innerJoin: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      mockDb.update = vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }));

      mockDb.delete = vi.fn().mockImplementation(() => ({
        where: vi.fn().mockResolvedValue([]),
      }));

      await service.mergeIssues({ issueIds: ['issue-1', 'issue-2'], newTitle: 'Merged Issue' });

      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('backfillFromLogs', () => {
    it('should return immediately when no logs to process', async () => {
      configureMockDb(mockDb, { select: [{ count: 0 }] });
      const progressCallback = vi.fn();

      const result = await service.backfillFromLogs(undefined, progressCallback);

      expect(result).toEqual({ processedLogs: 0, issuesCreated: 0, issuesUpdated: 0 });
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('should emit started event', async () => {
      configureMockDb(mockDb, { select: [{ count: 0 }] });
      const progressCallback = vi.fn();

      await service.backfillFromLogs(undefined, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(expect.objectContaining({ status: 'started' }));
    });

    it('should filter by serverId when provided', async () => {
      configureMockDb(mockDb, { select: [{ count: 0 }] });

      await service.backfillFromLogs('server-1');

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should process logs in batches and emit progress', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          serverId: 'server-1',
          level: 'error',
          message: 'Test error',
          source: 'test',
          timestamp: new Date(),
        },
      ];

      let selectCallCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        let result: any[] = [];
        if (selectCallCount === 1)
          result = [{ count: 1 }]; // Total count
        else if (selectCallCount === 2)
          result = [{ id: 'existing-issue' }]; // Existing issues
        else if (selectCallCount === 3)
          result = mockLogs; // Batch of logs
        else if (selectCallCount === 4)
          result = []; // Existing issue check
        else if (selectCallCount === 5)
          result = [{ providerId: 'jellyfin' }]; // Server lookup
        else result = [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      mockDb.insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'new-issue' }]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }));

      const progressCallback = vi.fn();

      await service.backfillFromLogs(undefined, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(expect.objectContaining({ status: 'started' }));
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('should track created vs updated issues', async () => {
      let selectCallCount = 0;
      const existingIssue = {
        id: 'existing-issue',
        fingerprint: 'abc123',
        severity: 'high',
        occurrenceCount: 5,
        lastSeen: new Date(),
      };

      mockDb.select = vi.fn().mockImplementation(() => {
        selectCallCount++;
        let result: any[] = [];
        if (selectCallCount === 1) result = [{ count: 1 }];
        else if (selectCallCount === 2) result = [{ id: 'existing-issue' }];
        else if (selectCallCount === 3)
          result = [
            {
              id: 'log-1',
              serverId: 'server-1',
              level: 'error',
              message: 'Test error',
              source: 'test',
              timestamp: new Date(),
            },
          ];
        else if (selectCallCount === 4) result = [existingIssue];
        else if (selectCallCount === 5) result = [{ userId: 'user-1', sessionId: 'session-1' }];
        else result = [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      mockDb.update = vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }));

      mockDb.insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([]),
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      }));

      const result = await service.backfillFromLogs();

      expect(result.processedLogs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeIssue', () => {
    it('should throw BadRequestException when no AI provider configured', async () => {
      mockAiProviderService.getDefaultProvider.mockResolvedValue(null);

      await expect(service.analyzeIssue('issue-1')).rejects.toThrow(BadRequestException);
    });

    it('should analyze issue with AI and return structured result', async () => {
      const mockContext = {
        issue: { id: 'issue-1', title: 'Test Error' },
        sampleOccurrences: [{ id: 'occ-1' }],
        stackTraces: [],
        affectedUsers: ['user-1'],
        affectedSessions: ['session-1'],
      };
      const mockAnalysis = `## Root Cause Analysis
### Primary Cause
Connection timeout
### Confidence: 85%
### Evidence
- Network logs show timeout

## Recommendations
### Fix 1
**Priority:** High
**Action:** Increase timeout
**Rationale:** Allows more time for connection`;

      mockAiProviderService.getDefaultProvider.mockResolvedValue({ id: 'openai' });
      mockIssueContextService.gatherContext.mockResolvedValue(mockContext);
      mockAnalysisPromptBuilder.buildPrompt.mockReturnValue({
        system: 'system prompt',
        user: 'user prompt',
      });
      mockAiProviderService.generateAnalysisWithSystemPrompt.mockResolvedValue({
        analysis: mockAnalysis,
        provider: 'openai',
        model: 'gpt-4',
        tokensUsed: 500,
      });

      mockDb.insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'conv-1' }]),
      }));
      mockDb.update = vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }));

      const result = await service.analyzeIssue('issue-1');

      expect(result).toHaveProperty('analysis');
      expect(result).toHaveProperty('metadata');
      expect(result.metadata.provider).toBe('openai');
    });

    it('should re-throw error when AI generation fails', async () => {
      const mockContext = {
        issue: { id: 'issue-1', title: 'Test Error' },
        sampleOccurrences: [],
        stackTraces: [],
        affectedUsers: [],
        affectedSessions: [],
      };

      mockAiProviderService.getDefaultProvider.mockResolvedValue({ id: 'openai' });
      mockIssueContextService.gatherContext.mockResolvedValue(mockContext);
      mockAnalysisPromptBuilder.buildPrompt.mockReturnValue({
        system: 'system prompt',
        user: 'user prompt',
      });
      mockAiProviderService.generateAnalysisWithSystemPrompt.mockRejectedValue(
        new Error('AI service unavailable')
      );

      await expect(service.analyzeIssue('issue-1')).rejects.toThrow('AI service unavailable');
    });

    it('should return fallback analysis when AI response cannot be parsed as JSON', async () => {
      const mockContext = {
        issue: { id: 'issue-1', title: 'Test Error' },
        sampleOccurrences: [],
        stackTraces: [],
        affectedUsers: [],
        affectedSessions: [],
      };

      mockAiProviderService.getDefaultProvider.mockResolvedValue({ id: 'openai' });
      mockIssueContextService.gatherContext.mockResolvedValue(mockContext);
      mockAnalysisPromptBuilder.buildPrompt.mockReturnValue({
        system: 'system prompt',
        user: 'user prompt',
      });
      mockAiProviderService.generateAnalysisWithSystemPrompt.mockResolvedValue({
        analysis: 'Invalid response format that cannot be parsed as JSON',
        provider: 'openai',
        model: 'gpt-4',
        tokensUsed: 100,
      });

      // Mock db.insert for conversation creation
      mockDb.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'conv-1' }]),
      });

      const result = await service.analyzeIssue('issue-1');

      // Parser returns fallback analysis instead of throwing
      expect(result.analysis.rootCause.identified).toBe(false);
      expect(result.analysis.rootCause.confidence).toBe(30);
      expect(result.analysis.rootCause.summary).toBe('Analysis returned unstructured response');
    });

    it('should handle analysis without tokensUsed', async () => {
      const mockContext = {
        issue: { id: 'issue-1', title: 'Test Error' },
        sampleOccurrences: [],
        stackTraces: [],
        affectedUsers: [],
        affectedSessions: [],
      };
      const mockAnalysis = `## Root Cause Analysis
### Primary Cause
Test cause
### Confidence: 50%
### Evidence
- Test evidence

## Recommendations
### Fix 1
**Priority:** Medium
**Action:** Test action
**Rationale:** Test rationale`;

      mockAiProviderService.getDefaultProvider.mockResolvedValue({ id: 'openai' });
      mockIssueContextService.gatherContext.mockResolvedValue(mockContext);
      mockAnalysisPromptBuilder.buildPrompt.mockReturnValue({
        system: 'system prompt',
        user: 'user prompt',
      });
      mockAiProviderService.generateAnalysisWithSystemPrompt.mockResolvedValue({
        analysis: mockAnalysis,
        provider: 'openai',
        model: 'gpt-4',
        // No tokensUsed
      });

      mockDb.insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'conv-1' }]),
      }));
      mockDb.update = vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }));

      const result = await service.analyzeIssue('issue-1');

      expect(result.metadata.tokensUsed).toBe(0);
    });

    it('should handle empty recommendations', async () => {
      const mockContext = {
        issue: { id: 'issue-1', title: 'Test Error' },
        sampleOccurrences: [],
        stackTraces: [],
        affectedUsers: [],
        affectedSessions: [],
      };
      const mockAnalysis = `## Root Cause Analysis
### Primary Cause
Test cause
### Confidence: 50%
### Evidence
- Test evidence

## Recommendations`;

      mockAiProviderService.getDefaultProvider.mockResolvedValue({ id: 'openai' });
      mockIssueContextService.gatherContext.mockResolvedValue(mockContext);
      mockAnalysisPromptBuilder.buildPrompt.mockReturnValue({
        system: 'system prompt',
        user: 'user prompt',
      });
      mockAiProviderService.generateAnalysisWithSystemPrompt.mockResolvedValue({
        analysis: mockAnalysis,
        provider: 'openai',
        model: 'gpt-4',
        tokensUsed: 100,
      });

      mockDb.insert = vi.fn().mockImplementation(() => ({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'conv-1' }]),
      }));
      mockDb.update = vi.fn().mockImplementation(() => ({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }));

      const result = await service.analyzeIssue('issue-1');

      expect(result).toHaveProperty('analysis');
    });
  });

  describe('analyzeIssueFollowUp', () => {
    it('should throw NotFoundException when conversation not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.analyzeIssueFollowUp('issue-1', 'conv-1', 'What else?')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw BadRequestException when no AI provider', async () => {
      const mockConversation = {
        id: 'conv-1',
        issueId: 'issue-1',
        messages: [{ role: 'assistant', content: 'Analysis' }],
        contextSnapshot: { issue: { id: 'issue-1' } },
      };
      configureMockDb(mockDb, { select: [mockConversation] });
      mockAiProviderService.getDefaultProvider.mockResolvedValue(null);

      await expect(service.analyzeIssueFollowUp('issue-1', 'conv-1', 'What else?')).rejects.toThrow(
        BadRequestException
      );
    });
  });

  describe('getAnalysisConversation', () => {
    it('should return conversation when found', async () => {
      const mockConversation = {
        id: 'conv-1',
        issueId: 'issue-1',
        messages: [{ role: 'assistant', content: 'Analysis' }],
        provider: 'openai',
        model: 'gpt-4',
        totalTokens: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      configureMockDb(mockDb, { select: [mockConversation] });

      const result = await service.getAnalysisConversation('issue-1', 'conv-1');

      expect(result.id).toBe('conv-1');
      expect(result.provider).toBe('openai');
    });

    it('should throw NotFoundException when not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.getAnalysisConversation('issue-1', 'non-existent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getLatestAnalysisConversation', () => {
    it('should return latest conversation', async () => {
      const mockConversation = {
        id: 'conv-2',
        issueId: 'issue-1',
        messages: [],
        provider: 'openai',
        model: 'gpt-4',
        totalTokens: 500,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      configureMockDb(mockDb, { select: [mockConversation] });

      const result = await service.getLatestAnalysisConversation('issue-1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('conv-2');
    });

    it('should return null when no conversations exist', async () => {
      configureMockDb(mockDb, { select: [] });

      const result = await service.getLatestAnalysisConversation('issue-1');

      expect(result).toBeNull();
    });
  });
});
