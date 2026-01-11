import { readFileSync } from 'fs';
import { join } from 'path';

import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { sql, eq, and } from 'drizzle-orm';

import { DATABASE_CONNECTION } from './database/database.module';
import * as schema from './database/schema';
import { REDIS_CLIENT } from './redis/redis.module';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type Redis from 'ioredis';

interface ServiceStatus {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
}

interface FileIngestionStatus {
  status: 'ok' | 'error' | 'degraded';
  enabledServers: number;
  healthyServers: number;
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  timestamp: string;
  services: {
    api: ServiceStatus;
    database: ServiceStatus;
    redis: ServiceStatus;
    fileIngestion: FileIngestionStatus;
  };
}

interface VersionResponse {
  version: string;
  service: string;
}

@ApiTags('health')
@Controller()
export class AppController {
  private readonly version: string;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase,
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null
  ) {
    // Read version from root package.json (single source of truth)
    // Try multiple paths to handle both dev (src/) and prod (dist/) scenarios
    const possiblePaths = [
      join(__dirname, '..', '..', '..', 'package.json'), // From dist: dist -> backend -> apps -> root
      join(__dirname, '..', '..', '..', '..', 'package.json'), // From src: src -> backend -> apps -> root
      join(process.cwd(), 'package.json'), // Fallback to cwd
    ];

    this.version = 'unknown';
    for (const pkgPath of possiblePaths) {
      try {
        const packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
          name?: string;
          version?: string;
        };
        if (packageJson.name === 'logarr' && typeof packageJson.version === 'string') {
          this.version = packageJson.version;
          break;
        }
      } catch {
        // Try next path
      }
    }
  }

  @Get('version')
  @ApiOperation({ summary: 'Get application version' })
  getVersion(): VersionResponse {
    return {
      version: this.version,
      service: 'logarr',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async health(): Promise<HealthResponse> {
    const services: HealthResponse['services'] = {
      api: { status: 'ok' },
      database: { status: 'ok' },
      redis: { status: 'ok' },
      fileIngestion: { status: 'ok', enabledServers: 0, healthyServers: 0 },
    };

    // Check database connectivity
    try {
      const start = Date.now();
      await this.db.execute(sql`SELECT 1`);
      services.database = {
        status: 'ok',
        latency: Date.now() - start,
      };
    } catch (error) {
      services.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Database connection failed',
      };
    }

    // Check Redis connectivity
    if (this.redis) {
      try {
        const start = Date.now();
        await this.redis.ping();
        services.redis = {
          status: 'ok',
          latency: Date.now() - start,
        };
      } catch (error) {
        services.redis = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Redis connection failed',
        };
      }
    } else {
      services.redis = {
        status: 'error',
        error: 'Redis not configured',
      };
    }

    // Check file ingestion health
    try {
      services.fileIngestion = await this.checkFileIngestionHealth();
    } catch (error) {
      services.fileIngestion = {
        status: 'error',
        enabledServers: 0,
        healthyServers: 0,
        error: error instanceof Error ? error.message : 'File ingestion check failed',
      };
    }

    // Determine overall status
    const hasError = Object.values(services).some((s) => s.status === 'error');
    const hasDegraded = Object.values(services).some((s) => s.status === 'degraded');
    const overallStatus: HealthResponse['status'] = hasError
      ? 'error'
      : hasDegraded
        ? 'degraded'
        : 'ok';

    return {
      status: overallStatus,
      service: 'logarr-api',
      timestamp: new Date().toISOString(),
      services,
    };
  }

  /**
   * Check file ingestion health by validating enabled servers have accessible paths
   */
  private async checkFileIngestionHealth(): Promise<FileIngestionStatus> {
    // Get servers with file ingestion enabled
    const enabledServers = await this.db
      .select({
        id: schema.servers.id,
        name: schema.servers.name,
        logPaths: schema.servers.logPaths,
      })
      .from(schema.servers)
      .where(
        and(eq(schema.servers.isEnabled, true), eq(schema.servers.fileIngestionEnabled, true))
      );

    if (enabledServers.length === 0) {
      return {
        status: 'ok',
        enabledServers: 0,
        healthyServers: 0,
      };
    }

    let healthyServers = 0;
    const errors: string[] = [];

    // Check each server's log paths
    for (const server of enabledServers) {
      if (!server.logPaths || server.logPaths.length === 0) {
        errors.push(`${server.name}: No log paths configured`);
        continue;
      }

      let serverHealthy = true;
      for (const path of server.logPaths) {
        try {
          const { accessSync, constants } = await import('fs');
          accessSync(path, constants.R_OK);
        } catch {
          serverHealthy = false;
          errors.push(`${server.name}: Path not accessible: ${path}`);
          break;
        }
      }

      if (serverHealthy) {
        healthyServers++;
      }
    }

    const status: FileIngestionStatus['status'] =
      healthyServers === 0 ? 'error' : healthyServers < enabledServers.length ? 'degraded' : 'ok';

    const result: FileIngestionStatus = {
      status,
      enabledServers: enabledServers.length,
      healthyServers,
    };

    if (errors.length > 0) {
      result.error = errors.join('; ');
    }

    return result;
  }
}
