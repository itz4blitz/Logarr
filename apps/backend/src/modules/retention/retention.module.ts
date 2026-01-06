import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { SettingsModule } from '../settings/settings.module';

import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

@Module({
  imports: [ScheduleModule.forRoot(), SettingsModule],
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
