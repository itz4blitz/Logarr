import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { AppController } from './app.controller';
import { DATABASE_CONNECTION } from './database/database.module';
import { REDIS_CLIENT } from './redis/redis.module';

import type { TestingModule } from '@nestjs/testing';

describe('AppController', () => {
  let controller: AppController;

  const mockDb = {
    execute: async () => [{ '?column?': 1 }],
    select: () => ({
      from: () => ({
        where: () => [],
      }),
    }),
  };

  const mockRedis = {
    ping: async () => 'PONG',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  describe('getVersion', () => {
    it('should return version information', () => {
      const result = controller.getVersion();

      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('service');
      expect(result.service).toBe('logarr');
    });

    it('should return a valid version string or unknown', () => {
      const result = controller.getVersion();

      // Version should be either a semver string or 'unknown'
      expect(typeof result.version).toBe('string');
      expect(result.version.length).toBeGreaterThan(0);
    });

    it('should have consistent version across multiple calls', () => {
      const result1 = controller.getVersion();
      const result2 = controller.getVersion();

      expect(result1.version).toBe(result2.version);
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      const result = await controller.health();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('service');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('services');
      expect(result.service).toBe('logarr-api');
    });

    it('should include all service statuses', async () => {
      const result = await controller.health();

      expect(result.services).toHaveProperty('api');
      expect(result.services).toHaveProperty('database');
      expect(result.services).toHaveProperty('redis');
      expect(result.services).toHaveProperty('fileIngestion');
    });

    it('should return ok status when all services are healthy', async () => {
      const result = await controller.health();

      expect(result.status).toBe('ok');
      expect(result.services.api.status).toBe('ok');
      expect(result.services.database.status).toBe('ok');
      expect(result.services.redis.status).toBe('ok');
      expect(result.services.fileIngestion.status).toBe('ok');
    });

    it('should return database latency', async () => {
      const result = await controller.health();

      expect(result.services.database).toHaveProperty('latency');
      expect(typeof result.services.database.latency).toBe('number');
    });

    it('should return redis latency', async () => {
      const result = await controller.health();

      expect(result.services.redis).toHaveProperty('latency');
      expect(typeof result.services.redis.latency).toBe('number');
    });
  });

  describe('health with failures', () => {
    it('should return degraded status when database fails', async () => {
      const failingDb = {
        execute: async () => {
          throw new Error('Database connection failed');
        },
        select: () => ({
          from: () => ({
            where: () => [],
          }),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: failingDb },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const failingController = module.get<AppController>(AppController);
      const result = await failingController.health();

      expect(result.status).toBe('error');
      expect(result.services.database.status).toBe('error');
      expect(result.services.database.error).toBe('Database connection failed');
    });

    it('should return degraded status when redis fails', async () => {
      const failingRedis = {
        ping: async () => {
          throw new Error('Redis connection failed');
        },
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDb },
          { provide: REDIS_CLIENT, useValue: failingRedis },
        ],
      }).compile();

      const failingController = module.get<AppController>(AppController);
      const result = await failingController.health();

      expect(result.status).toBe('error');
      expect(result.services.redis.status).toBe('error');
      expect(result.services.redis.error).toBe('Redis connection failed');
    });

    it('should handle missing redis client', async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDb },
          { provide: REDIS_CLIENT, useValue: null },
        ],
      }).compile();

      const noRedisController = module.get<AppController>(AppController);
      const result = await noRedisController.health();

      expect(result.status).toBe('error');
      expect(result.services.redis.status).toBe('error');
      expect(result.services.redis.error).toBe('Redis not configured');
    });
  });
});
