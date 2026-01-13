import { Module, Global } from '@nestjs/common';

import { ApiKeysModule } from '../modules/api-keys/api-keys.module';

import { ApiKeyGuard } from './api-key.guard';

@Global()
@Module({
  imports: [ApiKeysModule],
  providers: [ApiKeyGuard],
  exports: [ApiKeyGuard],
})
export class GuardsModule {}
