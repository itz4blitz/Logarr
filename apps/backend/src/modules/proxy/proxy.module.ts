import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { DatabaseModule } from '../../database/database.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { AuditModule } from '../audit/audit.module';

import { ProxyAuditService } from './proxy-audit.service';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'proxy',
        ttl: 60000,
        limit: 100,
      },
    ]),
    ApiKeysModule,
    AuditModule,
    DatabaseModule,
  ],
  controllers: [ProxyController],
  providers: [ProxyService, ProxyAuditService],
  exports: [ProxyService, ProxyAuditService],
})
export class ProxyModule {}
