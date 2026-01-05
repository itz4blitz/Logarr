import { JellyfinProvider, JellyfinClient } from '@logarr/provider-jellyfin';
import { PlexProvider, PlexClient } from '@logarr/provider-plex';
import { ProwlarrProvider } from '@logarr/provider-prowlarr';
import { RadarrProvider } from '@logarr/provider-radarr';
import { SonarrProvider } from '@logarr/provider-sonarr';
import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';
import { FileIngestionService } from '../file-ingestion/file-ingestion.service';
import { IssuesGateway } from '../issues/issues.gateway';
import { IssuesService } from '../issues/issues.service';
import { LogsGateway } from '../logs/logs.gateway';
import { SessionsGateway } from '../sessions/sessions.gateway';

import type { MediaServerProvider, NormalizedSession, NormalizedActivity } from '@logarr/core';
import type {
  JellyfinSession,
  JellyfinPlaybackProgressData,
  JellyfinPlaybackEventData,
} from '@logarr/provider-jellyfin';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * IngestionService - Responsible for polling media servers and ingesting activity data
 *
 * Design Pattern: Idempotent Ingestion with Database-Backed State
 * - Uses `externalActivityId` + `serverId` unique constraint for deduplication
 * - Uses `onConflictDoNothing()` for atomic, race-condition-free inserts
 * - Persists `lastActivitySync` in the servers table to survive restarts
 */
@Injectable()
export class IngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionService.name);
  private providers: Map<string, MediaServerProvider> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  private sessionPollingInterval: NodeJS.Timeout | null = null;
  private jellyfinClients: Map<string, JellyfinClient> = new Map();
  private plexClients: Map<string, PlexClient> = new Map();
  private plexRefreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private plexLastRefresh: Map<string, number> = new Map();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly logsGateway: LogsGateway,
    private readonly sessionsGateway: SessionsGateway,
    private readonly issuesService: IssuesService,
    private readonly issuesGateway: IssuesGateway,
    private readonly fileIngestionService: FileIngestionService
  ) {
    // Register available providers
    const jellyfinProvider = new JellyfinProvider();
    this.providers.set(jellyfinProvider.id, jellyfinProvider);

    const sonarrProvider = new SonarrProvider();
    this.providers.set(sonarrProvider.id, sonarrProvider);

    const radarrProvider = new RadarrProvider();
    this.providers.set(radarrProvider.id, radarrProvider);

    const prowlarrProvider = new ProwlarrProvider();
    this.providers.set(prowlarrProvider.id, prowlarrProvider);

    const plexProvider = new PlexProvider();
    this.providers.set(plexProvider.id, plexProvider);
  }

  async onModuleInit() {
    this.logger.log('Starting ingestion service...');

    // Start polling for logs every 30 seconds
    this.pollingInterval = setInterval(() => {
      this.pollAllServers().catch((err) => {
        this.logger.error('Error polling servers:', err);
      });
    }, 30000);

    // Start polling for sessions every 5 seconds as backup to WebSocket
    // Plex WebSocket only sends updates every ~10 seconds, so this provides better responsiveness
    this.sessionPollingInterval = setInterval(() => {
      this.pollAllSessions().catch((err) => {
        this.logger.error('Error polling sessions:', err);
      });
    }, 5000);

    // Initial poll for logs
    await this.pollAllServers();

    // Initial poll for sessions from all servers that support it
    await this.pollAllSessions();

    // Connect WebSockets for real-time session updates
    await this.connectJellyfinWebSockets();
    await this.connectPlexWebSockets();

    // Start file-based log ingestion for servers that have it enabled
    try {
      await this.fileIngestionService.startFileIngestion(this.providers);
      this.logger.log('File ingestion started');
    } catch (error) {
      this.logger.warn('Failed to start file ingestion:', error);
    }
  }

  /**
   * Get all registered providers
   */
  getProviders(): Map<string, MediaServerProvider> {
    return this.providers;
  }

  /**
   * Get a specific provider by ID
   */
  getProvider(providerId: string): MediaServerProvider | undefined {
    return this.providers.get(providerId);
  }

  onModuleDestroy() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    if (this.sessionPollingInterval) {
      clearInterval(this.sessionPollingInterval);
    }
    // Disconnect all Jellyfin WebSockets
    for (const client of this.jellyfinClients.values()) {
      client.disconnectWebSocket();
    }
    this.jellyfinClients.clear();
    // Disconnect all Plex WebSockets
    for (const client of this.plexClients.values()) {
      client.disconnectWebSocket();
    }
    this.plexClients.clear();
  }

  private async pollAllServers() {
    const servers = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.isEnabled, true));

    for (const server of servers) {
      try {
        await this.pollServer(server);
      } catch (error) {
        this.logger.error(`Error polling server ${server.name}:`, error);

        // Update server status to disconnected
        await this.db
          .update(schema.servers)
          .set({
            isConnected: false,
            lastError: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date(),
          })
          .where(eq(schema.servers.id, server.id));
      }
    }
  }

  private async pollServer(server: typeof schema.servers.$inferSelect) {
    const provider = this.providers.get(server.providerId);
    if (!provider) {
      this.logger.warn(`Unknown provider: ${server.providerId}`);
      return;
    }

    try {
      await provider.connect({
        url: server.url,
        apiKey: server.apiKey,
        logPath: server.logPath ?? undefined,
      });

      // Get activity log since last sync (persisted in database, survives restarts)
      const lastSync = server.lastActivitySync ?? undefined;
      const activities = await provider.getActivity(lastSync);

      if (activities.length > 0) {
        const insertedCount = await this.ingestActivities(server.id, activities);

        // Update last sync timestamp in database (persistence!)
        if (insertedCount > 0) {
          const maxTimestamp = activities.reduce(
            (max, a) => (a.timestamp > max ? a.timestamp : max),
            activities[0]!.timestamp
          );

          await this.db
            .update(schema.servers)
            .set({
              lastActivitySync: maxTimestamp,
              updatedAt: new Date(),
            })
            .where(eq(schema.servers.id, server.id));
        }
      }

      // Update server as connected
      await this.db
        .update(schema.servers)
        .set({
          isConnected: true,
          lastSeen: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.servers.id, server.id));
    } finally {
      await provider.disconnect();
    }
  }

  /**
   * Poll sessions from all servers that support session tracking.
   * Called on startup to populate initial session state before WebSockets take over.
   */
  private async pollAllSessions() {
    const servers = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.isEnabled, true));

    for (const server of servers) {
      const provider = this.providers.get(server.providerId);
      if (!provider?.capabilities.supportsSessions) {
        continue;
      }

      try {
        await provider.connect({
          url: server.url,
          apiKey: server.apiKey,
          logPath: server.logPath ?? undefined,
        });

        const sessions = await provider.getSessions();

        if (sessions.length > 0) {
          this.logger.log(`Session poll: ${sessions.length} sessions from ${server.name}`);
          // Debug: Log session details for Plex
          if (server.providerId === 'plex') {
            for (const session of sessions) {
              this.logger.debug(
                `Plex session: ${session.userName} playing "${session.nowPlaying?.itemName}" - duration: ${session.nowPlaying?.durationTicks}, thumb: ${session.nowPlaying?.thumbnailUrl ? 'yes' : 'no'}`
              );
            }
          }
        }

        // Sync to database
        await this.syncSessions(server.id, [...sessions]);

        // Broadcast to frontend
        this.sessionsGateway.broadcastSessions(server.id, [...sessions]);
      } catch (error) {
        this.logger.warn(`Failed to poll sessions from ${server.name}:`, error);
      } finally {
        await provider.disconnect();
      }
    }
  }

  /**
   * Ingest activities using idempotent insert pattern
   * Uses ON CONFLICT DO NOTHING to prevent duplicates at the database level
   */
  private async ingestActivities(
    serverId: string,
    activities: readonly NormalizedActivity[]
  ): Promise<number> {
    let insertedCount = 0;

    for (const activity of activities) {
      // Use onConflictDoNothing for atomic, idempotent insert
      // The unique index on (serverId, externalActivityId) prevents duplicates
      const result = await this.db
        .insert(schema.logEntries)
        .values({
          serverId,
          externalActivityId: activity.id, // The unique identifier from Jellyfin
          timestamp: activity.timestamp,
          level: activity.severity,
          message: activity.overview || activity.name,
          source: activity.type,
          userId: activity.userId,
          itemId: activity.itemId,
          raw: JSON.stringify(activity),
          metadata: { activityId: activity.id },
        })
        .onConflictDoNothing({
          target: [schema.logEntries.serverId, schema.logEntries.externalActivityId],
        })
        .returning();

      // Only broadcast and count if actually inserted (not a duplicate)
      if (result.length > 0) {
        const inserted = result[0]!;
        insertedCount++;

        // Broadcast to WebSocket clients
        const logData: Parameters<typeof this.logsGateway.broadcastLog>[0] = {
          id: inserted.id,
          serverId,
          timestamp: inserted.timestamp,
          level: inserted.level,
          message: inserted.message,
          logSource: 'api',
        };
        if (inserted.source) {
          logData.source = inserted.source;
        }
        this.logsGateway.broadcastLog(logData);

        // Process for issue detection (errors and warnings)
        if (['error', 'warn'].includes(inserted.level)) {
          try {
            const issueId = await this.issuesService.processLogEntry(inserted);
            if (issueId) {
              // Get the updated issue and broadcast
              const issue = await this.issuesService.findOne(issueId);
              if (issue) {
                // Determine if this is a new issue or an update
                if (issue.occurrenceCount === 1) {
                  this.issuesGateway.broadcastNewIssue(issue);
                } else {
                  this.issuesGateway.broadcastIssueUpdate(issue);
                }
              }
            }
          } catch (err) {
            this.logger.warn(`Failed to process issue for log entry ${inserted.id}:`, err);
          }
        }
      }
    }

    return insertedCount;
  }

  private async syncSessions(serverId: string, remoteSessions: readonly NormalizedSession[]) {
    const remoteSessionIds = new Set(remoteSessions.map((s) => s.externalId));

    // Get all sessions for this server (active or recent)
    const activeSessions = await this.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.serverId, serverId));

    const existingSessionMap = new Map(activeSessions.map((s) => [s.externalId, s]));

    // Process remote sessions
    for (const remote of remoteSessions) {
      const existing = existingSessionMap.get(remote.externalId);

      // A session is only "active" if it has nowPlaying data (actually playing media)
      // Just being connected (isActive from Jellyfin) doesn't mean actively playing
      const isActivelyPlaying = remote.nowPlaying !== undefined;

      if (existing) {
        // Update existing session
        await this.db
          .update(schema.sessions)
          .set({
            lastActivity: new Date(),
            isActive: isActivelyPlaying,
            endedAt: isActivelyPlaying ? null : existing.isActive ? new Date() : existing.endedAt,
            nowPlayingItemId: remote.nowPlaying?.itemId ?? null,
            nowPlayingItemName: remote.nowPlaying?.itemName ?? null,
            nowPlayingItemType: remote.nowPlaying?.itemType ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.sessions.id, existing.id));

        // Add playback event if now playing
        if (remote.nowPlaying) {
          this.logger.debug(
            `Inserting playback event for session ${existing.id}: ${remote.nowPlaying.itemName}, duration=${remote.nowPlaying.durationTicks}, thumb=${remote.nowPlaying.thumbnailUrl ? 'yes' : 'no'}`
          );
          await this.db.insert(schema.playbackEvents).values({
            sessionId: existing.id,
            eventType: 'update',
            itemId: remote.nowPlaying.itemId,
            itemName: remote.nowPlaying.itemName,
            itemType: remote.nowPlaying.itemType,
            positionTicks:
              remote.nowPlaying.positionTicks !== null &&
              remote.nowPlaying.positionTicks !== undefined
                ? BigInt(remote.nowPlaying.positionTicks)
                : null,
            durationTicks:
              remote.nowPlaying.durationTicks !== null &&
              remote.nowPlaying.durationTicks !== undefined
                ? BigInt(remote.nowPlaying.durationTicks)
                : null,
            isPaused: remote.nowPlaying.isPaused ?? false,
            isMuted: remote.nowPlaying.isMuted ?? false,
            isTranscoding: remote.nowPlaying.isTranscoding ?? false,
            transcodeReasons: remote.nowPlaying.transcodeReasons
              ? [...remote.nowPlaying.transcodeReasons]
              : null,
            videoCodec: remote.nowPlaying.videoCodec,
            audioCodec: remote.nowPlaying.audioCodec,
            container: remote.nowPlaying.container,
            thumbnailUrl: remote.nowPlaying.thumbnailUrl,
            seriesName: remote.nowPlaying.seriesName,
            seasonName: remote.nowPlaying.seasonName,
          });
        } else {
          this.logger.debug(`No nowPlaying data for session ${existing.id} (${remote.userName})`);
        }
      } else {
        // Create new session - only mark as active if actually playing media
        // Use onConflictDoUpdate to handle race conditions (unique constraint on serverId + externalId)
        const [newSession] = await this.db
          .insert(schema.sessions)
          .values({
            serverId,
            externalId: remote.externalId,
            userId: remote.userId,
            userName: remote.userName,
            deviceId: remote.deviceId,
            deviceName: remote.deviceName,
            clientName: remote.clientName,
            clientVersion: remote.clientVersion,
            ipAddress: remote.ipAddress,
            nowPlayingItemId: remote.nowPlaying?.itemId,
            nowPlayingItemName: remote.nowPlaying?.itemName,
            nowPlayingItemType: remote.nowPlaying?.itemType,
            startedAt: remote.startedAt,
            lastActivity: remote.lastActivity,
            isActive: isActivelyPlaying,
          })
          .onConflictDoUpdate({
            target: [schema.sessions.serverId, schema.sessions.externalId],
            set: {
              lastActivity: new Date(),
              isActive: isActivelyPlaying,
              nowPlayingItemId: remote.nowPlaying?.itemId ?? null,
              nowPlayingItemName: remote.nowPlaying?.itemName ?? null,
              nowPlayingItemType: remote.nowPlaying?.itemType ?? null,
              updatedAt: new Date(),
            },
          })
          .returning();

        // Add initial playback event if now playing
        if (newSession && remote.nowPlaying) {
          await this.db.insert(schema.playbackEvents).values({
            sessionId: newSession.id,
            eventType: 'start',
            itemId: remote.nowPlaying.itemId,
            itemName: remote.nowPlaying.itemName,
            itemType: remote.nowPlaying.itemType,
            positionTicks:
              remote.nowPlaying.positionTicks !== null &&
              remote.nowPlaying.positionTicks !== undefined
                ? BigInt(remote.nowPlaying.positionTicks)
                : null,
            durationTicks:
              remote.nowPlaying.durationTicks !== null &&
              remote.nowPlaying.durationTicks !== undefined
                ? BigInt(remote.nowPlaying.durationTicks)
                : null,
            isPaused: remote.nowPlaying.isPaused ?? false,
            isMuted: remote.nowPlaying.isMuted ?? false,
            isTranscoding: remote.nowPlaying.isTranscoding ?? false,
            transcodeReasons: remote.nowPlaying.transcodeReasons
              ? [...remote.nowPlaying.transcodeReasons]
              : null,
            videoCodec: remote.nowPlaying.videoCodec,
            audioCodec: remote.nowPlaying.audioCodec,
            container: remote.nowPlaying.container,
            thumbnailUrl: remote.nowPlaying.thumbnailUrl,
            seriesName: remote.nowPlaying.seriesName,
            seasonName: remote.nowPlaying.seasonName,
          });
        }
      }
    }

    // Mark sessions that are no longer active
    for (const [externalId, existing] of existingSessionMap) {
      if (!remoteSessionIds.has(externalId) && existing.isActive) {
        await this.db
          .update(schema.sessions)
          .set({
            isActive: false,
            endedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.sessions.id, existing.id));
      }
    }
  }

  /**
   * Connect WebSocket to all Jellyfin servers for real-time session updates
   */
  private async connectJellyfinWebSockets() {
    const servers = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.isEnabled, true));

    for (const server of servers) {
      if (server.providerId === 'jellyfin') {
        this.connectJellyfinWebSocket(server);
      }
    }
  }

  /**
   * Connect WebSocket to a single Jellyfin server
   */
  private connectJellyfinWebSocket(server: typeof schema.servers.$inferSelect) {
    // Disconnect existing connection if any
    const existingClient = this.jellyfinClients.get(server.id);
    if (existingClient) {
      existingClient.disconnectWebSocket();
      this.jellyfinClients.delete(server.id);
    }

    const client = new JellyfinClient(server.url, server.apiKey);
    this.jellyfinClients.set(server.id, client);

    // Set up event handlers
    client.on('connected', () => {
      this.logger.log(`WebSocket connected to Jellyfin server: ${server.name}`);
    });

    client.on('disconnected', () => {
      this.logger.warn(`WebSocket disconnected from Jellyfin server: ${server.name}`);
    });

    client.on('error', (error: Error) => {
      this.logger.error(`WebSocket error for Jellyfin server ${server.name}:`, error.message);
    });

    // Handle real-time session updates
    client.on('sessions', (sessions: readonly JellyfinSession[]) => {
      this.handleJellyfinSessionsUpdate(server.id, sessions).catch((err) => {
        this.logger.error(`Error handling sessions update for ${server.name}:`, err);
      });
    });

    client.on('playbackStart', (data: JellyfinPlaybackEventData) => {
      this.sessionsGateway.broadcastPlaybackStart(server.id, data);
    });

    client.on('playbackStop', (data: JellyfinPlaybackEventData) => {
      this.sessionsGateway.broadcastPlaybackStop(server.id, data);
    });

    client.on('playbackProgress', (data: JellyfinPlaybackProgressData) => {
      this.sessionsGateway.broadcastPlaybackProgress(server.id, data);
    });

    // Connect to WebSocket
    client.connectWebSocket();
  }

  /**
   * Handle real-time sessions update from Jellyfin WebSocket
   */
  private async handleJellyfinSessionsUpdate(
    serverId: string,
    jellyfinSessions: readonly JellyfinSession[]
  ) {
    // Convert Jellyfin sessions to normalized format
    const normalizedSessions: NormalizedSession[] = jellyfinSessions.map((session) => ({
      id: session.Id, // Use Jellyfin session ID as the normalized ID
      externalId: session.Id,
      userId: session.UserId,
      userName: session.UserName,
      deviceId: session.DeviceId,
      deviceName: session.DeviceName,
      clientName: session.Client,
      clientVersion: session.ApplicationVersion,
      ipAddress: session.RemoteEndPoint,
      startedAt: new Date(session.LastActivityDate),
      lastActivity: new Date(session.LastActivityDate),
      isActive: session.IsActive,
      nowPlaying: session.NowPlayingItem
        ? {
            itemId: session.NowPlayingItem.Id,
            itemName: session.NowPlayingItem.Name,
            itemType: session.NowPlayingItem.Type,
            seriesName: session.NowPlayingItem.SeriesName,
            seasonName: session.NowPlayingItem.SeasonName,
            positionTicks: session.PlayState?.PositionTicks ?? 0,
            durationTicks: session.NowPlayingItem.RunTimeTicks,
            isPaused: session.PlayState?.IsPaused ?? false,
            isMuted: session.PlayState?.IsMuted ?? false,
            isTranscoding: session.TranscodingInfo !== undefined,
            transcodeReasons: session.TranscodingInfo?.TranscodeReasons ?? undefined,
            playMethod: session.PlayState?.PlayMethod,
            videoCodec: session.TranscodingInfo?.VideoCodec,
            audioCodec: session.TranscodingInfo?.AudioCodec,
            container: session.TranscodingInfo?.Container ?? session.NowPlayingItem.Container,
          }
        : undefined,
    }));

    // Sync to database (same as polling but real-time)
    await this.syncSessions(serverId, normalizedSessions);

    // Broadcast updated sessions to frontend
    this.sessionsGateway.broadcastSessions(serverId, normalizedSessions);
  }

  // ===========================================================================
  // Plex WebSocket Integration
  // ===========================================================================

  /**
   * Connect WebSockets to all enabled Plex servers
   */
  private async connectPlexWebSockets() {
    const servers = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.isEnabled, true));

    for (const server of servers) {
      if (server.providerId === 'plex') {
        this.connectPlexWebSocket(server);
      }
    }
  }

  /**
   * Connect WebSocket to a single Plex server
   */
  private connectPlexWebSocket(server: typeof schema.servers.$inferSelect) {
    // Disconnect existing connection if any
    const existingClient = this.plexClients.get(server.id);
    if (existingClient) {
      existingClient.disconnectWebSocket();
      this.plexClients.delete(server.id);
    }

    const client = new PlexClient(server.url, server.apiKey);
    this.plexClients.set(server.id, client);

    // Set up event handlers
    client.on('connected', () => {
      this.logger.log(`WebSocket connected to Plex server: ${server.name}`);
    });

    client.on('disconnected', () => {
      this.logger.warn(`WebSocket disconnected from Plex server: ${server.name}`);
    });

    client.on('error', (error: Error) => {
      this.logger.error(`WebSocket error for Plex server ${server.name}:`, error.message);
    });

    // Handle real-time playback notifications
    // Broadcast progress immediately for real-time UI, then do throttled full refresh
    client.on('playing', (notification) => {
      // Immediately broadcast the progress update for real-time UI
      // This gives instant position updates without waiting for API
      this.sessionsGateway.broadcastPlaybackProgress(server.id, {
        sessionKey: notification.sessionKey,
        ratingKey: notification.ratingKey,
        viewOffset: notification.viewOffset,
        state: notification.state,
        // Convert viewOffset (ms) to ticks for frontend compatibility
        positionTicks: notification.viewOffset * 10000,
      });

      // Also do a throttled full refresh to sync complete session data (artwork, duration, etc.)
      this.throttledPlexRefresh(server);
    });

    // Connect to WebSocket
    client.connectWebSocket();
  }

  /**
   * Throttled refresh for Plex sessions
   * Ensures we don't call the API more than once every 1 second per server
   */
  private throttledPlexRefresh(server: typeof schema.servers.$inferSelect) {
    const now = Date.now();
    const lastRefresh = this.plexLastRefresh.get(server.id) ?? 0;
    const timeSinceLastRefresh = now - lastRefresh;
    const THROTTLE_MS = 1000; // 1 second throttle for responsive updates

    // If we refreshed recently, schedule a delayed refresh instead
    if (timeSinceLastRefresh < THROTTLE_MS) {
      // Cancel any existing scheduled refresh
      const existingTimer = this.plexRefreshTimers.get(server.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Schedule refresh for when throttle period ends
      const delay = THROTTLE_MS - timeSinceLastRefresh;
      const timer = setTimeout(() => {
        this.plexRefreshTimers.delete(server.id);
        this.doPlexRefresh(server);
      }, delay);
      this.plexRefreshTimers.set(server.id, timer);
      return;
    }

    // Otherwise refresh immediately
    this.doPlexRefresh(server);
  }

  private doPlexRefresh(server: typeof schema.servers.$inferSelect) {
    this.plexLastRefresh.set(server.id, Date.now());
    this.refreshPlexSessions(server).catch((err) => {
      this.logger.error(`Error refreshing Plex sessions for ${server.name}:`, err);
    });
  }

  /**
   * Refresh Plex sessions via API and broadcast to frontend
   * Called when we receive a WebSocket playing notification
   */
  private async refreshPlexSessions(server: typeof schema.servers.$inferSelect) {
    const provider = this.providers.get('plex') as PlexProvider | undefined;
    if (!provider) {
      return;
    }

    try {
      await provider.connect({
        url: server.url,
        apiKey: server.apiKey,
        logPath: server.logPath ?? undefined,
      });

      const sessions = await provider.getSessions();

      // Sync to database
      await this.syncSessions(server.id, [...sessions]);

      // Broadcast updated sessions to frontend
      this.sessionsGateway.broadcastSessions(server.id, [...sessions]);
    } finally {
      await provider.disconnect();
    }
  }
}
