import { Controller, Post, Get, Body, Param, Req, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApiKeyGuard } from '../../guards/api-key.guard';

import { ProxyRequestDto, ProxyResponseDto, ServiceInfoDto } from './dto/proxy-request.dto';
import { ProxyAuditService } from './proxy-audit.service';
import { ProxyService } from './proxy.service';

interface RequestWithUser {
  user?: { id?: string };
  session?: { userId?: string };
  apiKey?: {
    id: string;
    name: string;
    type: string;
    rateLimit?: number;
    rateLimitTtl?: number;
  };
}

@ApiTags('proxy')
@Controller('proxy')
@UseGuards(ApiKeyGuard)
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(
    private readonly proxyService: ProxyService,
    private readonly auditService: ProxyAuditService
  ) {}

  /**
   * Proxy request to a specific server
   * POST /api/v1/proxy/:serverId
   */
  @Post(':serverId')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @ApiOperation({
    summary: 'Proxy a request to a configured service',
    description:
      'Forwards HTTP requests to Sonarr, Radarr, qBittorrent, etc. using stored credentials',
  })
  @ApiResponse({
    status: 200,
    description: 'Request successfully proxied',
    type: ProxyResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Invalid API key or insufficient permissions',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - rate limit exceeded',
  })
  @ApiResponse({
    status: 404,
    description: 'Service not found or unreachable',
  })
  async proxyRequest(
    @Param('serverId') serverId: string,
    @Body() dto: ProxyRequestDto,
    @Req() _req: RequestWithUser
  ): Promise<ProxyResponseDto> {
    const startTime = Date.now();
    const userId = _req.user?.id ?? _req.session?.userId ?? 'anonymous';

    try {
      this.logger.log(`Proxying ${dto.method} request to server ${serverId}`);

      const data = await this.proxyService.proxyRequest(serverId, dto);

      const responseTime = Date.now() - startTime;

      // Log successful request
      this.auditService.logRequest({
        userId,
        serverId,
        serverName: serverId,
        providerId: 'unknown',
        method: dto.method,
        endpoint: dto.endpoint,
        statusCode: 200,
        responseTime,
        success: true,
      });

      return {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Log failed request
      this.auditService.logRequest({
        userId,
        serverId,
        serverName: serverId,
        providerId: 'unknown',
        method: dto.method,
        endpoint: dto.endpoint,
        statusCode: (error as { status?: number })?.status,
        responseTime,
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Get all configured services for current user
   * GET /api/v1/proxy/services
   */
  @Get('services')
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get all configured services',
    description:
      'Returns list of all servers configured by the current user with their connection status',
  })
  @ApiResponse({
    status: 200,
    description: 'List of services',
    type: [ServiceInfoDto],
  })
  async getServices(@Req() _req: RequestWithUser): Promise<{
    success: boolean;
    data: ServiceInfoDto[];
    count: number;
    timestamp: string;
  }> {
    this.logger.log('Fetching services');

    const servers = await this.proxyService.getUserServers('dummy-user-id');

    return {
      success: true,
      data: servers.map((server) => {
        const serviceInfo: ServiceInfoDto = {
          id: server.id,
          name: server.name,
          providerId: server.providerId,
          status: server.status ?? 'unknown',
        };
        if (server.lastChecked !== undefined) {
          serviceInfo.lastChecked = server.lastChecked;
        }
        return serviceInfo;
      }),
      count: servers.length,
      timestamp: new Date().toISOString(),
    };
  }
}
