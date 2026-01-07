import { readFileSync } from 'fs';
import { join } from 'path';

import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';

import { DATABASE_CONNECTION } from './database/database.module';
import { REDIS_CLIENT } from './redis/redis.module';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type Redis from 'ioredis';

interface ServiceStatus {
  status: 'ok' | 'error';
  latency?: number;
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

    // Determine overall status
    const hasError = Object.values(services).some((s) => s.status === 'error');
    const overallStatus: HealthResponse['status'] = hasError ? 'degraded' : 'ok';

    return {
      status: overallStatus,
      service: 'logarr-api',
      timestamp: new Date().toISOString(),
      services,
    };
  }
}
