import { Module, forwardRef } from '@nestjs/common';

import { FileIngestionModule } from '../file-ingestion/file-ingestion.module';
import { IngestionModule } from '../ingestion/ingestion.module';

import { ServerSeedService } from './server-seed.service';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [forwardRef(() => FileIngestionModule), forwardRef(() => IngestionModule)],
  controllers: [ServersController],
  providers: [ServersService, ServerSeedService],
  exports: [ServersService],
})
export class ServersModule {}
