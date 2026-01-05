import { Module, forwardRef } from '@nestjs/common';

import { FileIngestionModule } from '../file-ingestion/file-ingestion.module';
import { IngestionModule } from '../ingestion/ingestion.module';

import { LogsController } from './logs.controller';
import { LogsGateway } from './logs.gateway';
import { LogsService } from './logs.service';

@Module({
  imports: [forwardRef(() => FileIngestionModule), forwardRef(() => IngestionModule)],
  controllers: [LogsController],
  providers: [LogsService, LogsGateway],
  exports: [LogsService, LogsGateway],
})
export class LogsModule {}
