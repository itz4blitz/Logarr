import { Module } from '@nestjs/common';

import { SettingsModule } from '../settings/settings.module';

import { AnalysisPromptBuilder } from './analysis-prompt-builder';
import { IssueContextService } from './issue-context.service';
import { IssuesController } from './issues.controller';
import { IssuesGateway } from './issues.gateway';
import { IssuesService } from './issues.service';

@Module({
  imports: [SettingsModule],
  controllers: [IssuesController],
  providers: [IssuesService, IssuesGateway, IssueContextService, AnalysisPromptBuilder],
  exports: [IssuesService, IssuesGateway],
})
export class IssuesModule {}
