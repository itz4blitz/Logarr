import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto, UpdateApiKeyDto } from './dto/api-key.dto';

@ApiTags('api-keys')
@Controller('settings/api-keys')
export class ApiKeysController {
  private readonly logger = new Logger(ApiKeysController.name);

  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new API key',
    description: 'Generate a new API key for mobile, web, CLI, or integration access',
  })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully',
    schema: {
      example: {
        key: 'lk_abc123def456...',
        apiKey: {
          id: 'uuid',
          name: 'My iPhone',
          type: 'mobile',
          isEnabled: true,
          createdAt: '2024-01-09T00:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'API key hash collision',
  })
  async createApiKey(@Body() dto: CreateApiKeyDto): Promise<{
    key: string;
    apiKey: unknown;
  }> {
    this.logger.log(`Creating API key: ${dto.name}`);

    const serviceDto: {
      name: string;
      deviceInfo?: string;
      rateLimit?: number;
      rateLimitTtl?: number;
      scopes?: string[];
      expiresAt?: Date;
      notes?: string;
    } = {
      name: dto.name,
    };

    if (dto.deviceInfo !== undefined && dto.deviceInfo !== null && dto.deviceInfo !== '') {
      serviceDto.deviceInfo = dto.deviceInfo;
    }
    if (dto.rateLimit !== undefined && dto.rateLimit !== null) {
      serviceDto.rateLimit = dto.rateLimit;
    }
    if (dto.rateLimitTtl !== undefined && dto.rateLimitTtl !== null) {
      serviceDto.rateLimitTtl = dto.rateLimitTtl;
    }
    if (dto.scopes !== undefined && dto.scopes !== null) {
      serviceDto.scopes = dto.scopes;
    }
    if (dto.expiresAt !== undefined && dto.expiresAt !== null && dto.expiresAt !== '') {
      serviceDto.expiresAt = new Date(dto.expiresAt);
    }
    if (dto.notes !== undefined && dto.notes !== null && dto.notes !== '') {
      serviceDto.notes = dto.notes;
    }

    const result = await this.apiKeysService.createApiKey(serviceDto);

    return result;
  }

  @Get()
  @ApiOperation({
    summary: 'Get all API keys',
    description: 'Returns list of all API keys (without the actual keys)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of API keys',
  })
  async getAllApiKeys(): Promise<unknown[]> {
    this.logger.log('Fetching all API keys');

    const keys = await this.apiKeysService.getAllApiKeys();

    return keys.map((key) => ({
      id: key.id,
      name: key.name,
      deviceInfo: key.deviceInfo,
      isEnabled: key.isEnabled,
      rateLimit: key.rateLimit,
      rateLimitTtl: key.rateLimitTtl,
      lastUsedAt: key.lastUsedAt,
      lastUsedIp: key.lastUsedIp,
      requestCount: key.requestCount,
      scopes: key.scopes,
      expiresAt: key.expiresAt,
      notes: key.notes,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get API key by ID',
    description: 'Returns details of a specific API key',
  })
  @ApiResponse({
    status: 200,
    description: 'API key details',
  })
  @ApiResponse({
    status: 404,
    description: 'API key not found',
  })
  async getApiKey(@Param('id') id: string): Promise<unknown> {
    this.logger.log(`Fetching API key: ${id}`);

    const key = await this.apiKeysService.getApiKeyById(id);

    return {
      id: key.id,
      name: key.name,
      deviceInfo: key.deviceInfo,
      isEnabled: key.isEnabled,
      rateLimit: key.rateLimit,
      rateLimitTtl: key.rateLimitTtl,
      lastUsedAt: key.lastUsedAt,
      lastUsedIp: key.lastUsedIp,
      requestCount: key.requestCount,
      scopes: key.scopes,
      expiresAt: key.expiresAt,
      notes: key.notes,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    };
  }

  @Get(':id/stats')
  @ApiOperation({
    summary: 'Get API key usage statistics',
    description: 'Returns usage statistics for a specific API key',
  })
  @ApiResponse({
    status: 200,
    description: 'Usage statistics',
    schema: {
      example: {
        totalRequests: 1234,
        successRate: 98.5,
        avgResponseTime: 245,
        errorCount: 18,
      },
    },
  })
  async getApiKeyStats(@Param('id') id: string, @Param('days') days?: string): Promise<unknown> {
    this.logger.log(`Fetching API key stats: ${id}`);

    const stats = await this.apiKeysService.getUsageStats(
      id,
      days !== undefined && days !== null && days !== '' ? parseInt(days, 10) : 30
    );

    return stats;
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update API key',
    description: 'Update properties of an existing API key',
  })
  @ApiResponse({
    status: 200,
    description: 'API key updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'API key not found',
  })
  async updateApiKey(@Param('id') id: string, @Body() dto: UpdateApiKeyDto): Promise<unknown> {
    this.logger.log(`Updating API key: ${id}`);

    const serviceDto: {
      name?: string;
      isEnabled?: boolean;
      rateLimit?: number;
      rateLimitTtl?: number;
      scopes?: string[];
      expiresAt?: Date;
      notes?: string;
    } = {};

    if (dto.name !== undefined && dto.name !== null && dto.name !== '') {
      serviceDto.name = dto.name;
    }
    if (dto.isEnabled !== undefined && dto.isEnabled !== null) {
      serviceDto.isEnabled = dto.isEnabled;
    }
    if (dto.rateLimit !== undefined && dto.rateLimit !== null) {
      serviceDto.rateLimit = dto.rateLimit;
    }
    if (dto.rateLimitTtl !== undefined && dto.rateLimitTtl !== null) {
      serviceDto.rateLimitTtl = dto.rateLimitTtl;
    }
    if (dto.scopes !== undefined && dto.scopes !== null) {
      serviceDto.scopes = dto.scopes;
    }
    if (dto.expiresAt !== undefined && dto.expiresAt !== null && dto.expiresAt !== '') {
      serviceDto.expiresAt = new Date(dto.expiresAt);
    }
    if (dto.notes !== undefined && dto.notes !== null && dto.notes !== '') {
      serviceDto.notes = dto.notes;
    }

    const key = await this.apiKeysService.updateApiKey(id, serviceDto);

    return {
      id: key.id,
      name: key.name,
      deviceInfo: key.deviceInfo,
      isEnabled: key.isEnabled,
      rateLimit: key.rateLimit,
      rateLimitTtl: key.rateLimitTtl,
      lastUsedAt: key.lastUsedAt,
      lastUsedIp: key.lastUsedIp,
      requestCount: key.requestCount,
      scopes: key.scopes,
      expiresAt: key.expiresAt,
      notes: key.notes,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete API key',
    description: 'Permanently delete an API key',
  })
  @ApiResponse({
    status: 204,
    description: 'API key deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'API key not found',
  })
  async deleteApiKey(@Param('id') id: string): Promise<void> {
    this.logger.log(`Deleting API key: ${id}`);

    await this.apiKeysService.deleteApiKey(id);
  }

  @Get(':id/audit')
  @ApiOperation({
    summary: 'Get API key audit logs',
    description: 'Returns audit logs for a specific API key',
  })
  @ApiResponse({
    status: 200,
    description: 'List of audit log entries',
    schema: {
      example: [
        {
          id: 'uuid',
          keyId: 'uuid',
          endpoint: '/api/v1/logs',
          method: 'GET',
          statusCode: 200,
          responseTime: 145,
          success: true,
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0...',
          timestamp: '2024-01-09T00:00:00.000Z',
        },
      ],
    },
  })
  @ApiResponse({
    status: 404,
    description: 'API key not found',
  })
  async getAuditLogs(
    @Param('id') id: string,
    @Param('limit') limit?: string,
    @Param('offset') offset?: string
  ): Promise<unknown[]> {
    this.logger.log(`Fetching audit logs for API key: ${id}`);

    const logs = await this.apiKeysService.getAuditLogs(
      id,
      limit !== undefined && limit !== null && limit !== '' ? parseInt(limit, 10) : 100,
      offset !== undefined && offset !== null && offset !== '' ? parseInt(offset, 10) : 0
    );

    return logs;
  }
}
