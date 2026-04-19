import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
const logger = new Logger('RedisModule');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');

        if (redisUrl === undefined || redisUrl === null || redisUrl === '') {
          logger.warn('REDIS_URL is not configured, Redis features will be disabled');
          return null;
        }

        const client = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy: (times) => {
            if (times > 3) {
              return null; // Stop retrying
            }
            return Math.min(times * 200, 2000);
          },
          lazyConnect: true,
        });

        client.on('error', (err) => {
          logger.error(`Redis connection error: ${err.message}`);
        });

        client.on('connect', () => {
          logger.debug('Redis connected');
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
