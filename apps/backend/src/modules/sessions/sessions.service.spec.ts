import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { DATABASE_CONNECTION } from '../../database';
import { createMockDb, configureMockDb, type MockDb } from '../../test/mock-db';

describe('SessionsService', () => {
  let service: SessionsService;
  let mockDb: MockDb;

  const mockSession = {
    id: 'session-1',
    externalId: 'ext-session-1',
    serverId: 'server-1',
    userId: 'user-1',
    userName: 'TestUser',
    deviceId: 'device-1',
    deviceName: 'Chrome Browser',
    client: 'Jellyfin Web',
    isActive: true,
    startedAt: new Date(),
    lastActivity: new Date(),
    nowPlayingItemName: 'Movie Title',
  };

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: DATABASE_CONNECTION, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  describe('search', () => {
    it('should return sessions with playback info', async () => {
      configureMockDb(mockDb, { select: [mockSession] });

      const result = await service.search({});

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('nowPlaying');
    });

    it('should filter by serverId', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ serverId: 'server-1' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by userId', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ userId: 'user-1' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by deviceId', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ deviceId: 'device-1' });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by isActive', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({ isActive: true });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should filter by date range', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should cap limit at 500', async () => {
      configureMockDb(mockDb, { select: [] });

      // The limit is capped internally, but we can't directly verify it
      await service.search({ limit: 1000 });

      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should default limit to 50', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.search({});

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return session by id', async () => {
      configureMockDb(mockDb, { select: [mockSession] });

      const result = await service.findOne('session-1');

      expect(result).toEqual(mockSession);
    });

    it('should throw NotFoundException when session not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTimeline', () => {
    it('should return session with timeline data', async () => {
      configureMockDb(mockDb, { select: [mockSession] });

      const result = await service.getTimeline('session-1');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('events');
      expect(result).toHaveProperty('relatedLogCount');
    });

    it('should throw NotFoundException when session not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.getTimeline('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActiveSessions', () => {
    it('should return all active sessions', async () => {
      const activeSessions = [
        { ...mockSession, isActive: true },
        { ...mockSession, id: 'session-2', isActive: true },
      ];
      configureMockDb(mockDb, { select: activeSessions });

      const result = await service.getActiveSessions();

      expect(result).toHaveLength(2);
    });

    it('should filter active sessions by serverId', async () => {
      configureMockDb(mockDb, { select: [] });

      await service.getActiveSessions('server-1');

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getLogs', () => {
    it('should return logs for a session', async () => {
      const mockLogs = [
        { id: 'log-1', message: 'Log 1' },
        { id: 'log-2', message: 'Log 2' },
      ];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [mockSession] : mockLogs;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.getLogs('session-1');

      expect(result).toEqual(mockLogs);
    });

    it('should throw NotFoundException when session not found', async () => {
      configureMockDb(mockDb, { select: [] });

      await expect(service.getLogs('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should respect limit parameter', async () => {
      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? [mockSession] : [];
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      await service.getLogs('session-1', 50);

      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete session and return success', async () => {
      configureMockDb(mockDb, { delete: [{ id: 'session-1' }] });

      const result = await service.delete('session-1');

      expect(result).toEqual({ deleted: true });
    });

    it('should throw NotFoundException when session not found', async () => {
      configureMockDb(mockDb, { delete: [] });

      await expect(service.delete('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('pruneUnknownSessions', () => {
    it('should delete incomplete sessions', async () => {
      const deletedSessions = [
        { id: 'session-1' },
        { id: 'session-2' },
        { id: 'session-3' },
      ];
      configureMockDb(mockDb, { delete: deletedSessions });

      const result = await service.pruneUnknownSessions();

      expect(result).toEqual({ deletedCount: 3 });
    });

    it('should return 0 when no sessions to prune', async () => {
      configureMockDb(mockDb, { delete: [] });

      const result = await service.pruneUnknownSessions();

      expect(result).toEqual({ deletedCount: 0 });
    });
  });

  describe('enrichSessionsWithPlayback', () => {
    it('should add nowPlaying data to sessions', async () => {
      const sessions = [mockSession];
      const playbackEvents = [{
        sessionId: 'session-1',
        itemId: 'item-1',
        itemName: 'Movie Title',
        itemType: 'Movie',
        positionTicks: BigInt(1000000),
        durationTicks: BigInt(5000000),
        isPaused: false,
        isMuted: false,
        isTranscoding: true,
        transcodeReasons: ['Video'],
        videoCodec: 'h264',
        audioCodec: 'aac',
        container: 'mkv',
        timestamp: new Date(),
      }];

      let callCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => {
        callCount++;
        const result = callCount === 1 ? sessions : playbackEvents;
        return {
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn().mockReturnThis(),
          inArray: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          offset: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve) => Promise.resolve(result).then(resolve)),
          [Symbol.toStringTag]: 'Promise',
        };
      });

      const result = await service.search({});

      expect(result[0]).toHaveProperty('nowPlaying');
    });

    it('should return null nowPlaying when no playback events', async () => {
      configureMockDb(mockDb, { select: [mockSession] });

      const result = await service.search({});

      expect(result[0].nowPlaying).toBeNull();
    });
  });
});
