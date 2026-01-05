import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { and, eq, gte, lte, desc, count, inArray, isNull, or } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import type { SessionSearchDto, NowPlayingDto } from './sessions.dto';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  private async enrichSessionsWithPlayback(sessions: (typeof schema.sessions.$inferSelect)[]) {
    if (sessions.length === 0) return [];

    const sessionIds = sessions.map((s) => s.id);

    // Get all playback events for these sessions, ordered by timestamp desc
    const allEvents = await this.db
      .select()
      .from(schema.playbackEvents)
      .where(inArray(schema.playbackEvents.sessionId, sessionIds))
      .orderBy(desc(schema.playbackEvents.timestamp));

    // Get the latest event for each session
    const eventMap = new Map<string, (typeof allEvents)[0]>();
    for (const event of allEvents) {
      if (!eventMap.has(event.sessionId)) {
        eventMap.set(event.sessionId, event);
      }
    }

    return sessions.map((session) => {
      const event = eventMap.get(session.id);
      const nowPlaying: NowPlayingDto | null = event
        ? {
            itemId: event.itemId,
            itemName: event.itemName,
            itemType: event.itemType,
            seriesName: event.seriesName ?? null,
            seasonName: event.seasonName ?? null,
            positionTicks: event.positionTicks?.toString() ?? null,
            runTimeTicks: event.durationTicks?.toString() ?? null,
            isPaused: event.isPaused,
            isMuted: event.isMuted,
            isTranscoding: event.isTranscoding,
            transcodeReasons: event.transcodeReasons,
            videoCodec: event.videoCodec,
            audioCodec: event.audioCodec,
            container: event.container,
            playMethod: event.isTranscoding ? 'Transcode' : 'DirectPlay',
            thumbnailUrl: event.thumbnailUrl ?? null,
          }
        : null;

      return {
        ...session,
        nowPlaying,
      };
    });
  }

  async search(params: SessionSearchDto) {
    const conditions = [];

    if (params.serverId) {
      conditions.push(eq(schema.sessions.serverId, params.serverId));
    }

    if (params.userId) {
      conditions.push(eq(schema.sessions.userId, params.userId));
    }

    if (params.deviceId) {
      conditions.push(eq(schema.sessions.deviceId, params.deviceId));
    }

    if (params.isActive !== undefined) {
      conditions.push(eq(schema.sessions.isActive, params.isActive));
    }

    if (params.startDate) {
      conditions.push(gte(schema.sessions.startedAt, new Date(params.startDate)));
    }

    if (params.endDate) {
      conditions.push(lte(schema.sessions.startedAt, new Date(params.endDate)));
    }

    const limit = Math.min(params.limit ?? 50, 500);
    const offset = params.offset ?? 0;

    const results = await this.db
      .select()
      .from(schema.sessions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.sessions.lastActivity))
      .limit(limit)
      .offset(offset);

    return this.enrichSessionsWithPlayback(results);
  }

  async findOne(id: string) {
    const result = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, id))
      .limit(1);

    const session = result[0];
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    return session;
  }

  async getTimeline(id: string) {
    const session = await this.findOne(id);

    // Get playback events for this session
    const events = await this.db
      .select()
      .from(schema.playbackEvents)
      .where(eq(schema.playbackEvents.sessionId, id))
      .orderBy(schema.playbackEvents.timestamp);

    // Get count of related log entries
    const logCount = await this.db
      .select({ count: count() })
      .from(schema.logEntries)
      .where(eq(schema.logEntries.sessionId, session.externalId));

    return {
      ...session,
      events,
      relatedLogCount: Number(logCount[0]?.count ?? 0),
    };
  }

  async getActiveSessions(serverId?: string) {
    const condition = serverId
      ? and(eq(schema.sessions.isActive, true), eq(schema.sessions.serverId, serverId))
      : eq(schema.sessions.isActive, true);

    const results = await this.db
      .select()
      .from(schema.sessions)
      .where(condition)
      .orderBy(desc(schema.sessions.lastActivity));

    return this.enrichSessionsWithPlayback(results);
  }

  async getLogs(sessionId: string, limit = 100) {
    const session = await this.findOne(sessionId);

    return this.db
      .select()
      .from(schema.logEntries)
      .where(eq(schema.logEntries.sessionId, session.externalId))
      .orderBy(desc(schema.logEntries.timestamp))
      .limit(limit);
  }

  /**
   * Delete a session by ID (also deletes related playback events via cascade)
   */
  async delete(id: string): Promise<{ deleted: boolean }> {
    const result = await this.db
      .delete(schema.sessions)
      .where(eq(schema.sessions.id, id))
      .returning({ id: schema.sessions.id });

    if (result.length === 0) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    return { deleted: true };
  }

  /**
   * Delete sessions with incomplete data from development/testing
   * This cleans up:
   * - Sessions with null/empty userName
   * - Sessions with system user ID
   * - Sessions with no nowPlayingItemName (incomplete tracking data)
   * - Inactive sessions that never had meaningful playback
   */
  async pruneUnknownSessions(): Promise<{ deletedCount: number }> {
    // System user ID used by Jellyfin for internal operations
    const systemUserId = '00000000000000000000000000000000';

    const result = await this.db
      .delete(schema.sessions)
      .where(
        or(
          // No username
          isNull(schema.sessions.userName),
          eq(schema.sessions.userName, ''),
          // System user
          eq(schema.sessions.userId, systemUserId),
          // Incomplete playback data: no item name AND not currently active
          and(isNull(schema.sessions.nowPlayingItemName), eq(schema.sessions.isActive, false))
        )
      )
      .returning({ id: schema.sessions.id });

    this.logger.log(`Pruned ${result.length} incomplete/test sessions`);
    return { deletedCount: result.length };
  }
}
