import { Controller, Get, Post, Body, Query, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { SettingsService, type RetentionSettings } from '../settings/settings.service';

import { RetentionService } from './retention.service';

import type { StorageStats, CleanupPreview, RetentionResult, RetentionConfig } from './retention.dto';

@ApiTags('retention')
@Controller('retention')
export class RetentionController {
  private readonly logger = new Logger(RetentionController.name);

  constructor(
    private readonly retentionService: RetentionService,
    private readonly settingsService: SettingsService
  ) {}

  /**
   * GET /api/retention/config
   * Returns current retention configuration
   */
  @Get('config')
  @ApiOperation({ summary: 'Get retention configuration' })
  @ApiResponse({ status: 200, description: 'Returns current retention configuration' })
  async getConfig(): Promise<RetentionConfig> {
    return this.retentionService.getConfig();
  }

  /**
   * GET /api/retention/stats
   * Returns current storage usage and retention configuration
   */
  @Get('stats')
  @ApiOperation({ summary: 'Get storage statistics' })
  @ApiResponse({ status: 200, description: 'Returns current storage usage and configuration' })
  async getStats(): Promise<StorageStats> {
    return this.retentionService.getStorageStats();
  }

  /**
   * GET /api/retention/preview
   * Preview what would be deleted without actually deleting
   */
  @Get('preview')
  @ApiOperation({ summary: 'Preview cleanup' })
  @ApiResponse({ status: 200, description: 'Returns preview of what would be deleted' })
  async previewCleanup(): Promise<CleanupPreview> {
    return this.retentionService.previewCleanup();
  }

  /**
   * POST /api/retention/run
   * Manually trigger a cleanup (for testing or immediate cleanup)
   */
  @Post('run')
  @ApiOperation({ summary: 'Run cleanup manually' })
  @ApiResponse({ status: 200, description: 'Cleanup completed successfully' })
  async runCleanup(): Promise<RetentionResult> {
    this.logger.log('Manual cleanup triggered via API');
    return this.retentionService.runCleanup();
  }

  /**
   * GET /api/retention/settings
   * Returns current retention settings (enabled, days, etc)
   */
  @Get('settings')
  @ApiOperation({ summary: 'Get retention settings' })
  @ApiResponse({ status: 200, description: 'Returns current retention settings' })
  async getSettings(): Promise<RetentionSettings> {
    return this.settingsService.getRetentionSettings();
  }

  /**
   * POST /api/retention/settings
   * Update retention settings
   */
  @Post('settings')
  @ApiOperation({ summary: 'Update retention settings' })
  @ApiResponse({ status: 200, description: 'Settings updated successfully' })
  async updateSettings(@Body() settings: Partial<RetentionSettings>): Promise<RetentionSettings> {
    this.logger.log(`Updating retention settings: ${JSON.stringify(settings)}`);
    return this.settingsService.updateRetentionSettings(settings);
  }

  /**
   * GET /api/retention/history
   * Returns cleanup history
   */
  @Get('history')
  @ApiOperation({ summary: 'Get cleanup history' })
  @ApiResponse({ status: 200, description: 'Returns cleanup history' })
  async getHistory(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.settingsService.getRetentionHistory(limitNum);
  }
}
