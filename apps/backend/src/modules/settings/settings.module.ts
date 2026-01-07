import { Module } from '@nestjs/common';

import { AiProviderSeedService } from './ai-provider-seed.service';
import { AiProviderService } from './ai-provider.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, AiProviderService, AiProviderSeedService],
  exports: [SettingsService, AiProviderService],
})
export class SettingsModule {}
