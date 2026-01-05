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

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase,
    @Optional()
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis | null
  ) {}

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
