import { BazarrProvider } from '@logarr/provider-bazarr';
import { EmbyProvider } from '@logarr/provider-emby';
import { JellyfinProvider } from '@logarr/provider-jellyfin';
import { LidarrProvider } from '@logarr/provider-lidarr';
import { PlexProvider } from '@logarr/provider-plex';
import { ProwlarrProvider } from '@logarr/provider-prowlarr';
import { QBittorrentProvider } from '@logarr/provider-qbittorrent';
import { RadarrProvider } from '@logarr/provider-radarr';
import { ReadarrProvider } from '@logarr/provider-readarr';
import { SeerrProvider } from '@logarr/provider-seerr';
import { SonarrProvider } from '@logarr/provider-sonarr';
import { WhisparrProvider } from '@logarr/provider-whisparr';
import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';
import { FileIngestionService } from '../file-ingestion/file-ingestion.service';
import { IngestionService } from '../ingestion/ingestion.service';

import { toServerResponse } from './server-response.mapper';

import type { ServerResponse, ServerRow } from './server-response.mapper';
import type { CreateServerDto, UpdateServerDto } from './servers.dto';
import type { MediaServerProvider } from '@logarr/core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Normalise a username from an API client: strings are trimmed (empty -> null), an explicit
 * null clears it, anything else (missing or a non-string value) is left untouched (undefined).
 */
function normalizeUsername(username: unknown): string | null | undefined {
  if (typeof username === 'string') {
    return username.trim() || null;
  }
  return username === null ? null : undefined;
}

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);
  private providers: Map<string, MediaServerProvider> = new Map();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    @Inject(forwardRef(() => FileIngestionService))
    private readonly fileIngestionService: FileIngestionService,
    @Inject(forwardRef(() => IngestionService))
    private readonly ingestionService: IngestionService
  ) {
    // Register available providers
    const jellyfinProvider = new JellyfinProvider();
    this.providers.set(jellyfinProvider.id, jellyfinProvider);

    const embyProvider = new EmbyProvider();
    this.providers.set(embyProvider.id, embyProvider);

    const plexProvider = new PlexProvider();
    this.providers.set(plexProvider.id, plexProvider);

    const sonarrProvider = new SonarrProvider();
    this.providers.set(sonarrProvider.id, sonarrProvider);

    const radarrProvider = new RadarrProvider();
    this.providers.set(radarrProvider.id, radarrProvider);

    const prowlarrProvider = new ProwlarrProvider();
    this.providers.set(prowlarrProvider.id, prowlarrProvider);

    const whisparrProvider = new WhisparrProvider();
    this.providers.set(whisparrProvider.id, whisparrProvider);

    const lidarrProvider = new LidarrProvider();
    this.providers.set(lidarrProvider.id, lidarrProvider);
    const seerrProvider = new SeerrProvider();
    this.providers.set(seerrProvider.id, seerrProvider);

    const readarrProvider = new ReadarrProvider();
    this.providers.set(readarrProvider.id, readarrProvider);
    const bazarrProvider = new BazarrProvider();
    this.providers.set(bazarrProvider.id, bazarrProvider);
    const qbittorrentProvider = new QBittorrentProvider();
    this.providers.set(qbittorrentProvider.id, qbittorrentProvider);
  }

  /** All servers as returned by the API (without the stored secret) */
  async findAll(): Promise<ServerResponse[]> {
    const rows = await this.db.select().from(schema.servers).orderBy(schema.servers.createdAt);
    return rows.map(toServerResponse);
  }

  /** One server as returned by the API (without the stored secret) */
  async findOne(id: string): Promise<ServerResponse> {
    return toServerResponse(await this.getServerRow(id));
  }

  /** Database row including the secret: for internal use only, never return it from the API */
  private async getServerRow(id: string): Promise<ServerRow> {
    const result = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.id, id))
      .limit(1);

    const server = result[0];
    if (!server) {
      throw new NotFoundException(`Server with ID ${id} not found`);
    }

    return server;
  }

  async create(dto: CreateServerDto) {
    const provider = this.providers.get(dto.providerId);
    if (!provider) {
      throw new Error(`Unknown provider: ${dto.providerId}`);
    }

    // A pasted trailing newline/space would make the Authorization header invalid
    const apiKey = dto.apiKey?.trim() ?? '';

    if (provider.capabilities.apiKeyOptional !== true && apiKey === '') {
      throw new BadRequestException('API key is required');
    }

    const result = await this.db
      .insert(schema.servers)
      .values({
        name: dto.name,
        providerId: dto.providerId,
        url: dto.url,
        // apiKey may be empty only for providers with apiKeyOptional (e.g. qBittorrent auth bypass);
        // the column is NOT NULL
        apiKey,
        // Only providers that authenticate with a username may store one
        username:
          provider.capabilities.supportsUsername === true
            ? (normalizeUsername(dto.username) ?? null)
            : null,
        logPath: dto.logPath,
        fileIngestionEnabled: dto.fileIngestionEnabled ?? false,
        logPaths: dto.logPaths,
        logFilePatterns: dto.logFilePatterns,
      })
      .returning();

    const created = result[0];
    const server = created ? toServerResponse(created) : undefined;

    // If file ingestion is enabled, start it immediately
    if (server && dto.fileIngestionEnabled && dto.logPaths?.length) {
      this.startFileIngestionForServer(server.id).catch((err) => {
        this.logger.error(`Failed to start file ingestion for new server ${server.id}:`, err);
      });
    }

    return server;
  }

  async update(id: string, dto: UpdateServerDto) {
    // Get the current server state to detect changes
    const currentServer = await this.getServerRow(id);

    // An empty username clears it (stored as NULL)
    const { username, apiKey: rawApiKey, ...rest } = dto;
    const apiKey = typeof rawApiKey === 'string' ? rawApiKey.trim() : rawApiKey;
    const provider = this.providers.get(currentServer.providerId);

    // An explicit null clears the stored secret, but only where credentials are optional
    if (apiKey === null && provider?.capabilities.apiKeyOptional !== true) {
      throw new BadRequestException('API key is required and cannot be cleared');
    }
    // Ignored for providers that do not authenticate with a username
    const normalizedUsername =
      provider?.capabilities.supportsUsername === true ? normalizeUsername(username) : undefined;

    const result = await this.db
      .update(schema.servers)
      .set({
        ...rest,
        // An omitted or empty secret keeps the stored value (the API never returns it);
        // null clears it
        ...(typeof apiKey === 'string' && apiKey !== '' && { apiKey }),
        ...(apiKey === null && { apiKey: '' }),
        ...(normalizedUsername !== undefined && { username: normalizedUsername }),
        updatedAt: new Date(),
      })
      .where(eq(schema.servers.id, id))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException(`Server with ID ${id} not found`);
    }

    const updatedServer = result[0]!;

    // Check if file ingestion settings changed
    const fileIngestionChanged =
      (dto.fileIngestionEnabled !== undefined &&
        dto.fileIngestionEnabled !== currentServer.fileIngestionEnabled) ||
      dto.logPaths !== undefined ||
      dto.logFilePatterns !== undefined;

    if (fileIngestionChanged) {
      this.logger.log(`File ingestion settings changed for server ${id}, restarting...`);

      // Restart file ingestion for this server
      try {
        await this.fileIngestionService.restartServerFileIngestion(
          id,
          this.ingestionService.getProviders()
        );

        // Update connection status based on whether it started successfully
        if (updatedServer.fileIngestionEnabled && updatedServer.logPaths?.length) {
          const status = this.fileIngestionService.getStatus();
          const isConnected = status.tailers.some((t) => t.startsWith(`${id}:`));

          await this.db
            .update(schema.servers)
            .set({
              fileIngestionConnected: isConnected,
              fileIngestionError: isConnected ? null : 'No log files found or paths not accessible',
              lastFileSync: isConnected ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(schema.servers.id, id));
        } else {
          // File ingestion disabled
          await this.db
            .update(schema.servers)
            .set({
              fileIngestionConnected: false,
              fileIngestionError: null,
              updatedAt: new Date(),
            })
            .where(eq(schema.servers.id, id));
        }
      } catch (error) {
        this.logger.error(`Failed to restart file ingestion for server ${id}:`, error);

        await this.db
          .update(schema.servers)
          .set({
            fileIngestionConnected: false,
            fileIngestionError: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date(),
          })
          .where(eq(schema.servers.id, id));
      }
    }

    // Return the latest state
    return this.findOne(id);
  }

  async delete(id: string) {
    // Stop file ingestion for this server first
    try {
      await this.fileIngestionService.stopServerFileIngestion(id);
    } catch (error) {
      this.logger.warn(`Error stopping file ingestion for server ${id}:`, error);
    }

    const result = await this.db
      .delete(schema.servers)
      .where(eq(schema.servers.id, id))
      .returning();

    if (result.length === 0) {
      throw new NotFoundException(`Server with ID ${id} not found`);
    }

    return { success: true };
  }

  async testConnection(id: string) {
    const server = await this.getServerRow(id);
    const provider = this.providers.get(server.providerId);

    if (!provider) {
      return {
        connected: false,
        error: `Unknown provider: ${server.providerId}`,
        fileIngestion: null,
      };
    }

    // Test API connection
    let apiConnected = false;
    let apiError: string | undefined;
    let serverInfo: { name: string; version: string; id: string } | undefined;

    try {
      await provider.connect({
        url: server.url,
        apiKey: server.apiKey,
        username: server.username ?? undefined,
        logPath: server.logPath ?? undefined,
      });

      const status = await provider.testConnection();
      apiConnected = status.connected;
      apiError = status.error;
      serverInfo = status.serverInfo;

      if (status.connected && status.serverInfo) {
        await this.db
          .update(schema.servers)
          .set({
            isConnected: true,
            lastSeen: new Date(),
            lastError: null,
            version: status.serverInfo.version,
            serverName: status.serverInfo.name,
            updatedAt: new Date(),
          })
          .where(eq(schema.servers.id, id));
      }
    } catch (error) {
      apiError = error instanceof Error ? error.message : 'Unknown error';

      await this.db
        .update(schema.servers)
        .set({
          isConnected: false,
          lastError: apiError,
          updatedAt: new Date(),
        })
        .where(eq(schema.servers.id, id));
    } finally {
      await provider.disconnect();
    }

    // Test file ingestion paths if enabled
    let fileIngestionResult: {
      enabled: boolean;
      connected: boolean;
      error?: string;
      paths?: Array<{
        path: string;
        accessible: boolean;
        error?: string;
        files?: string[];
      }>;
    } | null = null;

    if (server.fileIngestionEnabled && server.logPaths?.length) {
      try {
        const validation = await this.fileIngestionService.validateLogPaths(server.logPaths);

        fileIngestionResult = validation.valid
          ? {
              enabled: true,
              connected: true,
              paths: validation.results,
            }
          : {
              enabled: true,
              connected: false,
              error: 'Some paths are not accessible',
              paths: validation.results,
            };

        // Update file ingestion status
        await this.db
          .update(schema.servers)
          .set({
            fileIngestionConnected: validation.valid,
            fileIngestionError: validation.valid ? null : 'Some paths are not accessible',
            updatedAt: new Date(),
          })
          .where(eq(schema.servers.id, id));

        // If paths are valid and file ingestion isn't already running/watching, start it
        if (validation.valid) {
          const status = this.fileIngestionService.getStatus();
          const alreadyTailing = status.tailers.some((t) => t.startsWith(`${id}:`));
          const alreadyWatching = this.fileIngestionService.isServerWatching(id);

          if (!alreadyTailing && !alreadyWatching) {
            this.logger.log(
              `Starting file ingestion for server ${id} after successful path validation`
            );
            await this.fileIngestionService.restartServerFileIngestion(
              id,
              this.ingestionService.getProviders()
            );
          }
        }
      } catch (error) {
        fileIngestionResult = {
          enabled: true,
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };

        await this.db
          .update(schema.servers)
          .set({
            fileIngestionConnected: false,
            fileIngestionError: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date(),
          })
          .where(eq(schema.servers.id, id));
      }
    } else if (server.fileIngestionEnabled) {
      fileIngestionResult = {
        enabled: true,
        connected: false,
        error: 'No log paths configured',
      };
    }

    return {
      connected: apiConnected,
      error: apiError,
      serverInfo,
      fileIngestion: fileIngestionResult,
    };
  }

  /**
   * Start file ingestion for a specific server
   */
  private async startFileIngestionForServer(serverId: string) {
    const server = await this.getServerRow(serverId);

    if (!server.fileIngestionEnabled || !server.logPaths?.length) {
      return;
    }

    await this.fileIngestionService.restartServerFileIngestion(
      serverId,
      this.ingestionService.getProviders()
    );
  }

  getAvailableProviders() {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      capabilities: p.capabilities,
    }));
  }

  /**
   * Test all server connections in parallel
   * Used on page load to get accurate real-time status
   */
  async testAllConnections(): Promise<
    Record<string, Awaited<ReturnType<typeof this.testConnection>>>
  > {
    const servers = await this.findAll();

    const results = await Promise.allSettled(
      servers.map(async (server) => ({
        id: server.id,
        result: await this.testConnection(server.id),
      }))
    );

    const resultMap: Record<string, Awaited<ReturnType<typeof this.testConnection>>> = {};

    for (const result of results) {
      if (result.status === 'fulfilled') {
        resultMap[result.value.id] = result.value.result;
      }
    }

    return resultMap;
  }

  /**
   * Reset file ingestion state for a server
   * This clears all file states and restarts file ingestion
   */
  async resetFileIngestionState(id: string) {
    const server = await this.getServerRow(id);

    if (!server.fileIngestionEnabled) {
      return {
        success: false,
        message: 'File ingestion is not enabled for this server',
      };
    }

    try {
      // Stop current file ingestion
      await this.fileIngestionService.stopServerFileIngestion(id);

      // Clear all file states for this server
      await this.fileIngestionService.resetServerState(id);

      // Reset sync status in database
      await this.db
        .update(schema.servers)
        .set({
          syncStatus: 'pending',
          syncProgress: 0,
          syncTotalFiles: 0,
          syncProcessedFiles: 0,
          syncStartedAt: null,
          syncCompletedAt: null,
          initialSyncCompleted: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.servers.id, id));

      // Restart file ingestion
      await this.fileIngestionService.restartServerFileIngestion(
        id,
        this.ingestionService.getProviders()
      );

      this.logger.log(`File ingestion state reset successfully for server ${server.name}`);

      return {
        success: true,
        message: 'File ingestion state reset and restarted successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to reset file ingestion state for server ${id}:`, error);

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
