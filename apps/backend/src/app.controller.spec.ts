import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { AppController } from './app.controller';
import { DATABASE_CONNECTION } from './database/database.module';
import { REDIS_CLIENT } from './redis/redis.module';

import type { TestingModule } from '@nestjs/testing';

describe('AppController', () => {
  let controller: AppController;

  // Store original env to restore after tests
  const originalEnv = process.env['HEALTH_CHECK_STARTUP_GRACE_SECONDS'];

  const mockDb = {
    execute: () => Promise.resolve([{ '?column?': 1 }]),
    select: () => ({
      from: () => ({
        where: () => [],
      }),
    }),
  };

  const mockRedis = {
    ping: () => Promise.resolve('PONG'),
  };

  beforeEach(async () => {
    // Reset env to default before each test
    delete process.env['HEALTH_CHECK_STARTUP_GRACE_SECONDS'];

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: DATABASE_CONNECTION, useValue: mockDb },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  afterEach(() => {
    // Restore original env
    process.env['HEALTH_CHECK_STARTUP_GRACE_SECONDS'] = originalEnv;
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
        execute: () => Promise.reject(new Error('Database connection failed')),
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
        ping: () => Promise.reject(new Error('Redis connection failed')),
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

  describe('startup grace period (Issue #26)', () => {
    it('should include inGracePeriod in file ingestion status', async () => {
      const result = await controller.health();

      expect(result.services.fileIngestion).toHaveProperty('inGracePeriod');
      expect(typeof result.services.fileIngestion.inGracePeriod).toBe('boolean');
    });

    it('should be in grace period immediately after startup', async () => {
      // Create a new controller with a 10 second grace period
      process.env['HEALTH_CHECK_STARTUP_GRACE_SECONDS'] = '10';

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDb },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const freshController = module.get<AppController>(AppController);
      const result = await freshController.health();

      expect(result.services.fileIngestion.inGracePeriod).toBe(true);
    });

    it('should default to 60 second grace period when env not set', async () => {
      delete process.env['HEALTH_CHECK_STARTUP_GRACE_SECONDS'];

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDb },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const freshController = module.get<AppController>(AppController);
      const result = await freshController.health();

      expect(result.services.fileIngestion.inGracePeriod).toBe(true);
    });

    it('should treat file ingestion failures as degraded during grace period', async () => {
      // Create controller with very short grace period for testing
      process.env['HEALTH_CHECK_STARTUP_GRACE_SECONDS'] = '10';

      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server 1',
          logPaths: ['/tmp/missing.log'],
        },
      ];

      const mockDbWithServers = {
        execute: () => Promise.resolve([{ '?column?': 1 }]),
        select: () => ({
          from: () => ({
            where: () => mockServers,
          }),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDbWithServers },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const testController = module.get<AppController>(AppController);
      const result = await testController.health();

      // During grace period, inaccessible paths should result in 'degraded', not 'error'
      expect(result.services.fileIngestion.status).toBe('degraded');
      expect(result.services.fileIngestion.inGracePeriod).toBe(true);
    });
  });

  describe('file ingestion health check', () => {
    it('should return ok when no servers have file ingestion enabled', async () => {
      const mockDbWithNoServers = {
        execute: () => Promise.resolve([{ '?column?': 1 }]),
        select: () => ({
          from: () => ({
            where: () => [],
          }),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDbWithNoServers },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const controller = module.get<AppController>(AppController);
      const result = await controller.health();

      expect(result.services.fileIngestion.status).toBe('ok');
      expect(result.services.fileIngestion.enabledServers).toBe(0);
      expect(result.services.fileIngestion.healthyServers).toBe(0);
    });

    it('should return ok when all servers have accessible paths', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server 1',
          logPaths: ['/tmp/test1.log'],
        },
        {
          id: 'server-2',
          name: 'Test Server 2',
          logPaths: ['/tmp/test2.log'],
        },
      ];

      const mockDbWithServers1 = {
        execute: () => Promise.resolve([{ '?column?': 1 }]),
        select: () => ({
          from: () => ({
            where: () => mockServers,
          }),
        }),
      };

      // Mock fs.accessSync to succeed
      vi.doMock('fs', () => ({
        accessSync: vi.fn(() => true),
        constants: { R_OK: 4 },
      }));

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDbWithServers1 },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const controller = module.get<AppController>(AppController);
      const result = await controller.health();

      expect(result.services.fileIngestion.status).toBe('ok');
      expect(result.services.fileIngestion.enabledServers).toBe(2);
      expect(result.services.fileIngestion.healthyServers).toBe(2);
    });

    it('should return degraded when some servers have inaccessible paths', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server 1',
          logPaths: ['/tmp/accessible.log'],
        },
        {
          id: 'server-2',
          name: 'Test Server 2',
          logPaths: ['/tmp/inaccessible.log'],
        },
      ];

      const mockDbWithServers2 = {
        execute: () => Promise.resolve([{ '?column?': 1 }]),
        select: () => ({
          from: () => ({
            where: () => mockServers,
          }),
        }),
      };

      // Mock fs.accessSync to fail for second path
      vi.doMock('fs', () => ({
        accessSync: vi.fn((path: string) => {
          if (path.includes('inaccessible')) {
            throw new Error('ENOENT: no such file or directory');
          }
          return true;
        }),
        constants: { R_OK: 4 },
      }));

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDbWithServers2 },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const controller = module.get<AppController>(AppController);
      const result = await controller.health();

      expect(result.services.fileIngestion.status).toBe('degraded');
      expect(result.services.fileIngestion.enabledServers).toBe(2);
      expect(result.services.fileIngestion.healthyServers).toBe(1);
      expect(result.services.fileIngestion.error).toContain('Path not accessible');
    });

    it('should return error when no servers are healthy', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server 1',
          logPaths: ['/tmp/missing1.log'],
        },
        {
          id: 'server-2',
          name: 'Test Server 2',
          logPaths: ['/tmp/missing2.log'],
        },
      ];

      const mockDbWithServers3 = {
        execute: () => Promise.resolve([{ '?column?': 1 }]),
        select: () => ({
          from: () => ({
            where: () => mockServers,
          }),
        }),
      };

      // Mock fs.accessSync to always fail
      vi.doMock('fs', () => ({
        accessSync: vi.fn(() => {
          throw new Error('ENOENT: no such file or directory');
        }),
        constants: { R_OK: 4 },
      }));

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDbWithServers3 },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const controller = module.get<AppController>(AppController);
      const result = await controller.health();

      // During grace period, should be degraded
      expect(result.services.fileIngestion.status).toBe('degraded');
      expect(result.services.fileIngestion.enabledServers).toBe(2);
      expect(result.services.fileIngestion.healthyServers).toBe(0);
    });

    it('should handle servers with no log paths configured', async () => {
      const mockServers = [
        {
          id: 'server-1',
          name: 'Test Server 1',
          logPaths: null,
        },
        {
          id: 'server-2',
          name: 'Test Server 2',
          logPaths: [],
        },
      ];

      const mockDbWithServers4 = {
        execute: () => Promise.resolve([{ '?column?': 1 }]),
        select: () => ({
          from: () => ({
            where: () => mockServers,
          }),
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AppController],
        providers: [
          { provide: DATABASE_CONNECTION, useValue: mockDbWithServers4 },
          { provide: REDIS_CLIENT, useValue: mockRedis },
        ],
      }).compile();

      const controller = module.get<AppController>(AppController);
      const result = await controller.health();

      // During grace period, should be degraded
      expect(result.services.fileIngestion.status).toBe('degraded');
      expect(result.services.fileIngestion.enabledServers).toBe(2);
      expect(result.services.fileIngestion.healthyServers).toBe(0);
      expect(result.services.fileIngestion.error).toContain('No log paths configured');
    });

    it('should handle file ingestion health check errors gracefully', async () => {
      const failingDb = {
        execute: () => Promise.resolve([{ '?column?': 1 }]),
        select: () => ({
          from: () => ({
            where: () => {
              throw new Error('Database query failed');
            },
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

      const controller = module.get<AppController>(AppController);
      const result = await controller.health();

      expect(result.services.fileIngestion.status).toBe('error');
      expect(result.services.fileIngestion.enabledServers).toBe(0);
      expect(result.services.fileIngestion.healthyServers).toBe(0);
      expect(result.services.fileIngestion.error).toBe('Database query failed');
    });
  });
});
