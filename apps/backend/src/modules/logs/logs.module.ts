import { Module, forwardRef } from '@nestjs/common';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';
import { LogsGateway } from './logs.gateway';
import { FileIngestionModule } from '../file-ingestion/file-ingestion.module';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [
    forwardRef(() => FileIngestionModule),
    forwardRef(() => IngestionModule),
  ],
  controllers: [LogsController],
  providers: [LogsService, LogsGateway],
  exports: [LogsService, LogsGateway],
})
export class LogsModule {}
