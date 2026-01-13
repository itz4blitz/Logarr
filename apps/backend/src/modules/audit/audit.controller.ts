import { Controller, Get, Query, Logger, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('settings/audit')
export class AuditController {
  private readonly logger = new Logger(AuditController.name);

  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({
    summary: 'Get audit logs',
    description: 'Returns audit logs with optional filtering',
  })
  @ApiResponse({
    status: 200,
    description: 'List of audit logs',
  })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'success', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getAuditLogs(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('category') category?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('success') success?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number
  ): Promise<unknown[]> {
    this.logger.log('Fetching audit logs');

    const filters: Record<string, unknown> = {};
    if (userId !== undefined && userId !== null && userId !== '') {
      filters['userId'] = userId;
    }
    if (action !== undefined && action !== null && action !== '') {
      filters['action'] = action;
    }
    if (category !== undefined && category !== null && category !== '') {
      filters['category'] = category;
    }
    if (entityType !== undefined && entityType !== null && entityType !== '') {
      filters['entityType'] = entityType;
    }
    if (entityId !== undefined && entityId !== null && entityId !== '') {
      filters['entityId'] = entityId;
    }
    if (success !== undefined) {
      filters['success'] = success === 'true';
    }
    if (limit !== undefined) {
      filters['limit'] = limit;
    }
    if (offset !== undefined) {
      filters['offset'] = offset;
    }

    const logs = await this.auditService.getLogs(filters);

    return logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      sessionId: log.sessionId,
      action: log.action,
      category: log.category,
      entityType: log.entityType,
      entityId: log.entityId,
      description: log.description,
      endpoint: log.endpoint,
      method: log.method,
      statusCode: log.statusCode,
      responseTime: log.responseTime,
      success: log.success,
      errorMessage: log.errorMessage,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      metadata: log.metadata,
      apiKeyId: log.apiKeyId,
      timestamp: log.timestamp,
    }));
  }

  @Get('statistics')
  @ApiOperation({
    summary: 'Get audit log statistics',
    description: 'Returns aggregated statistics about audit logs',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit log statistics',
    schema: {
      example: {
        totalLogs: 1234,
        successCount: 1200,
        errorCount: 34,
        byCategory: {
          auth: 100,
          server: 200,
          api_key: 50,
        },
        byAction: {
          create: 300,
          update: 400,
          delete: 50,
          read: 484,
        },
        byUser: [
          { userId: 'user-1', count: 500 },
          { userId: 'user-2', count: 300 },
        ],
      },
    },
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getStatistics(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days?: number
  ): Promise<unknown> {
    this.logger.log(`Fetching audit statistics for ${days} days`);

    return this.auditService.getStatistics(days);
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get user activity',
    description: 'Returns recent activity for a specific user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of user activities',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUserActivity(
    @Query('userId') userId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number
  ): Promise<unknown[]> {
    this.logger.log(`Fetching activity for user: ${userId}`);

    return this.auditService.getUserActivity(userId, limit);
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({
    summary: 'Get entity activity',
    description: 'Returns recent activity for a specific entity',
  })
  @ApiResponse({
    status: 200,
    description: 'List of entity activities',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEntityActivity(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number
  ): Promise<unknown[]> {
    this.logger.log(`Fetching activity for entity: ${entityType}/${entityId}`);

    return this.auditService.getEntityActivity(entityType, entityId, limit);
  }
}
