import { Module, forwardRef } from '@nestjs/common';

import { IssuesModule } from '../issues/issues.module';
import { LogsModule } from '../logs/logs.module';

import { FileDiscoveryService } from './file-discovery.service';
import { FileIngestionService } from './file-ingestion.service';
import { FileStateService } from './file-state.service';

@Module({
  imports: [forwardRef(() => LogsModule), forwardRef(() => IssuesModule)],
  providers: [FileIngestionService, FileStateService, FileDiscoveryService],
  exports: [FileIngestionService, FileStateService, FileDiscoveryService],
})
export class FileIngestionModule {}
