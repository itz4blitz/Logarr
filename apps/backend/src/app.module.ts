import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { LoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IssuesModule } from './modules/issues/issues.module';
import { LogsModule } from './modules/logs/logs.module';
import { RetentionModule } from './modules/retention/retention.module';
import { ServersModule } from './modules/servers/servers.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SettingsModule } from './modules/settings/settings.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Environment variables are injected by 1Password CLI (op run --env-file)
      // No need to read .env files - they're already in process.env
      ignoreEnvFile: true,
    }),
    LoggerModule,
    DatabaseModule,
    RedisModule,
    ServersModule,
    LogsModule,
    SessionsModule,
    IngestionModule,
    IssuesModule,
    SettingsModule,
    DashboardModule,
    RetentionModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
