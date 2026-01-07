import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  Logger,
} from '@nestjs/common';

import { AiProviderService } from './ai-provider.service';
import {
  SettingsService,
  type RetentionSettings,
  type FileIngestionSettings,
} from './settings.service';

import type {
  CreateAiProviderDto,
  UpdateAiProviderDto,
  TestProviderDto,
  FetchModelsDto,
} from './settings.dto';

@Controller('settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly aiProviderService: AiProviderService
  ) {}

  // ============ Retention Settings ============

  @Get('retention')
  async getRetentionSettings() {
    return this.settingsService.getRetentionSettings();
  }

  @Put('retention')
  async updateRetentionSettings(@Body() settings: Partial<RetentionSettings>) {
    return this.settingsService.updateRetentionSettings(settings);
  }

  @Get('retention/history')
  async getRetentionHistory(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.settingsService.getRetentionHistory(limitNum);
  }

  // ============ File Ingestion Settings ============

  @Get('file-ingestion')
  async getFileIngestionSettings() {
    return this.settingsService.getFileIngestionSettings();
  }

  @Put('file-ingestion')
  async updateFileIngestionSettings(@Body() settings: Partial<FileIngestionSettings>) {
    return this.settingsService.updateFileIngestionSettings(settings);
  }

  // ============ General Settings ============

  @Get()
  async getSettings() {
    return this.settingsService.getAppSettings();
  }

  @Get('system')
  async getSystemInfo() {
    return this.settingsService.getSystemInfo();
  }

  // ============ AI Provider Management ============

  @Get('ai/providers')
  async getAvailableProviders() {
    return this.aiProviderService.getAvailableProviders();
  }

  @Get('ai')
  async getAiProviderSettings() {
    return this.aiProviderService.getProviderSettings();
  }

  @Get('ai/default')
  async getDefaultAiProvider() {
    return this.aiProviderService.getDefaultProvider();
  }

  // AI Usage Statistics - must come before :id routes
  @Get('ai/stats')
  async getAiStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('provider') provider?: string
  ) {
    const query: { startDate?: string; endDate?: string; provider?: string } = {};
    if (startDate !== undefined) query.startDate = startDate;
    if (endDate !== undefined) query.endDate = endDate;
    if (provider !== undefined) query.provider = provider;
    return this.aiProviderService.getUsageStats(query);
  }

  @Get('ai/history')
  async getAiHistory(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('provider') provider?: string
  ) {
    const query: { limit?: number; offset?: number; provider?: string } = {};
    if (limit !== undefined) query.limit = parseInt(limit, 10);
    if (offset !== undefined) query.offset = parseInt(offset, 10);
    if (provider !== undefined) query.provider = provider;
    return this.aiProviderService.getAnalysisHistory(query);
  }

  @Get('ai/:id')
  async getAiProviderSettingById(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiProviderService.getProviderSettingById(id);
  }

  @Post('ai')
  async createAiProviderSetting(@Body() dto: CreateAiProviderDto) {
    return this.aiProviderService.createProviderSetting(dto);
  }

  @Put('ai/:id')
  async updateAiProviderSetting(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAiProviderDto
  ) {
    return this.aiProviderService.updateProviderSetting(id, dto);
  }

  @Delete('ai/:id')
  async deleteAiProviderSetting(@Param('id', ParseUUIDPipe) id: string) {
    await this.aiProviderService.deleteProviderSetting(id);
    return { success: true };
  }

  @Post('ai/test')
  async testProvider(@Body() dto: TestProviderDto) {
    return this.aiProviderService.testProvider(dto.provider, dto.apiKey, dto.model, dto.baseUrl);
  }

  @Post('ai/models')
  async fetchModels(@Body() dto: FetchModelsDto) {
    return this.aiProviderService.fetchProviderModels(dto.provider, dto.apiKey, dto.baseUrl);
  }

  @Post('ai/:id/test')
  async testProviderSetting(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiProviderService.testProviderSetting(id);
  }

  @Post('ai/:id/models')
  async fetchModelsForSetting(@Param('id', ParseUUIDPipe) id: string) {
    return this.aiProviderService.fetchModelsForSetting(id);
  }

  @Post('ai/analyze')
  async generateAnalysis(@Body() body: { prompt: string; providerId?: string }) {
    return this.aiProviderService.generateAnalysis(body.prompt, body.providerId);
  }
}
