import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { LoggerModule } from './common/logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { GuardsModule } from './guards/guards.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { AuditMiddleware } from './modules/audit/audit.middleware';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UnifiedAuthGuard } from './modules/auth/guards/unified-auth.guard';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { IngestionModule } from './modules/ingestion/ingestion.module';
import { IssuesModule } from './modules/issues/issues.module';
import { LogsModule } from './modules/logs/logs.module';
import { ProxyModule } from './modules/proxy/proxy.module';
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
    GuardsModule,
    RedisModule,
    AuditModule,
    ApiKeysModule,
    AuthModule,
    ServersModule,
    LogsModule,
    SessionsModule,
    IngestionModule,
    IssuesModule,
    SettingsModule,
    DashboardModule,
    RetentionModule,
    ProxyModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: UnifiedAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuditMiddleware)
      .exclude(
        'api/docs', // Exclude Swagger docs
        'api/health', // Exclude health checks
        'api/version', // Exclude version endpoint
        'api/auth/(.*)', // Exclude auth endpoints (setup, login)
      )
      .forRoutes('*'); // Apply to all routes
  }
}
