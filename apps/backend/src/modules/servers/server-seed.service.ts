import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

/**
 * Environment variable configuration for media servers.
 * On startup, if URL + API key env vars are set and no server of that type exists,
 * the server will be auto-configured.
 */
interface EnvServerConfig {
  urlEnvKey: string;
  apiKeyEnvKey: string;
  providerId: string;
  name: string;
  /** Container path for log files (used in Docker) */
  containerLogPath: string;
}

const ENV_SERVER_CONFIGS: EnvServerConfig[] = [
  {
    urlEnvKey: 'JELLYFIN_URL',
    apiKeyEnvKey: 'JELLYFIN_API_KEY',
    providerId: 'jellyfin',
    name: 'Jellyfin',
    containerLogPath: '/jellyfin-logs',
  },
  {
    urlEnvKey: 'PLEX_URL',
    apiKeyEnvKey: 'PLEX_TOKEN',
    providerId: 'plex',
    name: 'Plex',
    containerLogPath: '/plex-logs',
  },
  {
    urlEnvKey: 'EMBY_URL',
    apiKeyEnvKey: 'EMBY_API_KEY',
    providerId: 'emby',
    name: 'Emby',
    containerLogPath: '/emby-logs',
  },
  {
    urlEnvKey: 'SONARR_URL',
    apiKeyEnvKey: 'SONARR_API_KEY',
    providerId: 'sonarr',
    name: 'Sonarr',
    containerLogPath: '/sonarr-logs',
  },
  {
    urlEnvKey: 'RADARR_URL',
    apiKeyEnvKey: 'RADARR_API_KEY',
    providerId: 'radarr',
    name: 'Radarr',
    containerLogPath: '/radarr-logs',
  },
  {
    urlEnvKey: 'PROWLARR_URL',
    apiKeyEnvKey: 'PROWLARR_API_KEY',
    providerId: 'prowlarr',
    name: 'Prowlarr',
    containerLogPath: '/prowlarr-logs',
  },
  {
    urlEnvKey: 'WHISPARR_URL',
    apiKeyEnvKey: 'WHISPARR_API_KEY',
    providerId: 'whisparr',
    name: 'Whisparr',
    containerLogPath: '/whisparr-logs',
  },
];

@Injectable()
export class ServerSeedService implements OnModuleInit {
  private readonly logger = new Logger(ServerSeedService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  async onModuleInit() {
    this.logger.log('ServerSeedService initializing - checking for servers to seed from environment...');
    try {
      await this.seedServersFromEnv();
    } catch (error) {
      this.logger.error(`ServerSeedService failed: ${error}`);
      throw error;
    }
  }

  /**
   * Check environment variables and auto-configure servers that have
   * URL + API key set but don't exist in the database yet.
   */
  private async seedServersFromEnv(): Promise<void> {
    this.logger.log(`Checking ${ENV_SERVER_CONFIGS.length} server configs for seeding...`);
    let seededCount = 0;

    for (const config of ENV_SERVER_CONFIGS) {
      const url = process.env[config.urlEnvKey];
      const apiKey = process.env[config.apiKeyEnvKey];

      this.logger.log(`Checking ${config.providerId}: URL=${!!url}, API key=${!!apiKey}`);

      // Skip if URL or API key not set
      if (!url || url.trim() === '' || !apiKey || apiKey.trim() === '') {
        this.logger.log(`Skipping ${config.providerId}: missing URL or API key`);
        continue;
      }

      // Check if this provider type already exists
      const existing = await this.db
        .select({ id: schema.servers.id })
        .from(schema.servers)
        .where(eq(schema.servers.providerId, config.providerId))
        .limit(1);

      if (existing.length > 0) {
        this.logger.log(`Server ${config.providerId} already exists, skipping seed`);
        continue;
      }

      // Check if log path is configured (for file ingestion)
      const logPathEnvKey = `${config.providerId.toUpperCase()}_LOGS_PATH`;
      const hostLogPath = process.env[logPathEnvKey];
      const hasLogPath = !!(hostLogPath && hostLogPath.trim() !== '');

      // Use the container-mounted path for file ingestion
      // The docker-compose files mount host paths to container paths like /jellyfin-logs
      const effectiveLogPath = hasLogPath ? config.containerLogPath : null;

      // Create the server
      try {
        await this.db.insert(schema.servers).values({
          name: config.name,
          providerId: config.providerId,
          url: url.trim(),
          apiKey: apiKey.trim(),
          // Enable file ingestion if log path is configured
          fileIngestionEnabled: hasLogPath,
          logPaths: effectiveLogPath ? [effectiveLogPath] : null,
          logPath: effectiveLogPath,
        });

        seededCount++;

        const logStatus = hasLogPath ? ` (file ingestion: ${effectiveLogPath})` : '';
        this.logger.log(
          `Auto-configured server from env: ${config.name} (${config.providerId})${logStatus}`
        );
      } catch (error) {
        this.logger.warn(`Failed to auto-configure server ${config.name}: ${error}`);
      }
    }

    if (seededCount > 0) {
      this.logger.log(`Seeded ${seededCount} server(s) from environment variables`);
    }
  }
}
