import { EmbyProvider } from '@logarr/provider-emby';
import { JellyfinProvider } from '@logarr/provider-jellyfin';
import { PlexProvider } from '@logarr/provider-plex';
import { ProwlarrProvider } from '@logarr/provider-prowlarr';
import { RadarrProvider } from '@logarr/provider-radarr';
import { SonarrProvider } from '@logarr/provider-sonarr';
import { WhisparrProvider } from '@logarr/provider-whisparr';
import { Injectable, Inject, NotFoundException, forwardRef, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';
import { FileIngestionService } from '../file-ingestion/file-ingestion.service';
import { IngestionService } from '../ingestion/ingestion.service';

import type { CreateServerDto, UpdateServerDto } from './servers.dto';
import type { MediaServerProvider } from '@logarr/core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

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
  }

  async findAll() {
    return this.db.select().from(schema.servers).orderBy(schema.servers.createdAt);
  }

  async findOne(id: string) {
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

    const result = await this.db
      .insert(schema.servers)
      .values({
        name: dto.name,
        providerId: dto.providerId,
        url: dto.url,
        apiKey: dto.apiKey,
        logPath: dto.logPath,
        fileIngestionEnabled: dto.fileIngestionEnabled ?? false,
        logPaths: dto.logPaths,
        logFilePatterns: dto.logFilePatterns,
      })
      .returning();

    const server = result[0];

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
    const currentServer = await this.findOne(id);

    const result = await this.db
      .update(schema.servers)
      .set({
        ...dto,
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
    const server = await this.findOne(id);
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
    const server = await this.findOne(serverId);

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
}
