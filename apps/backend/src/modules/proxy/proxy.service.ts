import { HttpService } from '@nestjs/axios';
import { Injectable, Inject, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { firstValueFrom } from 'rxjs';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import { ProxyRequestDto } from './dto/proxy-request.dto';

interface ServerWithConfig {
  id: string;
  name: string;
  providerId: string;
  url: string;
  apiKey: string;
  status?: string;
  lastChecked?: Date;
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  // Service type to API path mapping
  private readonly apiPathMap: Record<string, string> = {
    sonarr: '/api',
    radarr: '/api/v3',
    prowlarr: '/api/v1',
    lidarr: '/api/v1',
    readarr: '/api/v1',
    whisparr: '/api/v1',
    qbittorrent: '/api/v2',
    sabnzbd: '/api',
  };

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly httpService: HttpService
  ) {}

  /**
   * Get all servers for current user
   * Note: Currently returns all servers since Logarr doesn't have user-specific servers yet.
   */
  async getUserServers(userId: string): Promise<ServerWithConfig[]> {
    this.logger.log(`Fetching servers for user: ${userId}`);

    const result = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.isEnabled, true))
      .orderBy(schema.servers.name);

    return result as ServerWithConfig[];
  }

  /**
   * Find server by ID
   * Note: Currently doesn't validate user ownership since Logarr doesn't have user-specific servers yet.
   */
  async findUserServer(serverId: string): Promise<ServerWithConfig> {
    const result = await this.db
      .select()
      .from(schema.servers)
      .where(eq(schema.servers.id, serverId))
      .limit(1);

    const server = result[0] as ServerWithConfig | undefined;

    if (!server) {
      throw new NotFoundException(`Server with ID ${serverId} not found`);
    }

    return server;
  }

  /**
   * Proxy request to target service with enhanced features
   */
  async proxyRequest(serverId: string, dto: ProxyRequestDto): Promise<unknown> {
    this.logger.log(
      `Proxying ${dto.method} request to server ${serverId} for endpoint: ${dto.endpoint}`
    );

    // 1. Get server configuration
    const server = await this.findUserServer(serverId);

    // 2. Build target URL with path parameters
    const targetUrl = this.buildTargetUrl(server, dto.endpoint, dto.params);

    this.logger.debug(`Target URL: ${targetUrl}`);

    // 3. Merge headers
    const headers: Record<string, string> = {
      'X-Api-Key': server.apiKey,
      'Content-Type': 'application/json',
      ...dto.headers,
    };

    // 4. Make request to target service
    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: dto.method,
          url: targetUrl,
          headers,
          params: dto.query,
          data: dto.body,
          timeout: 30000,
          validateStatus: (status) => status < 500, // Treat 4xx as success
          // HTTP keep-alive for connection pooling
          httpAgent: new (await import('http')).Agent({ keepAlive: true }),
          httpsAgent: new (await import('https')).Agent({ keepAlive: true }),
        })
      );

      // Handle 4xx errors from target service
      if (response.status >= 400 && response.status < 500) {
        this.logger.warn(
          `Target service returned ${response.status}: ${JSON.stringify(response.data)}`
        );
        return response.data; // Return error data to client
      }

      return response.data;
    } catch (error) {
      this.handleProxyError(error, server.providerId, server.name);
    }
  }

  /**
   * Build target URL for service with optional path parameters
   */
  private buildTargetUrl(
    server: ServerWithConfig,
    endpoint: string,
    params?: Record<string, string | number>
  ): string {
    const cleanUrl = server.url.replace(/\/$/, '');
    let cleanEndpoint = endpoint.replace(/^\//, '');

    // Replace path parameters (e.g., :id or {id})
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        cleanEndpoint = cleanEndpoint.replace(`:${key}`, String(value));
        cleanEndpoint = cleanEndpoint.replace(`{${key}}`, String(value));
      });
    }

    // Get API path for this provider
    const apiPath = this.apiPathMap[server.providerId] ?? '/api';

    return `${cleanUrl}${apiPath}/${cleanEndpoint}`;
  }

  /**
   * Handle proxy errors with user-friendly messages
   */
  private handleProxyError(error: unknown, providerId: string, serverName: string): never {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorCode = (error as { code?: string })?.code;
    const errorResponse = (error as { response?: { status?: number } })?.response;

    this.logger.error(`Proxy error for ${providerId} (${serverName}): ${errorMessage}`, errorStack);

    if (errorResponse?.status === 401 || errorResponse?.status === 403) {
      throw new ForbiddenException(
        `Invalid API key for ${serverName}. Please check your ${providerId} configuration.`
      );
    }

    if (errorCode === 'ECONNREFUSED' || errorCode === 'ENOTFOUND') {
      throw new NotFoundException(
        `Cannot reach ${serverName}. Please check if it's running and the URL is correct.`
      );
    }

    if (errorCode === 'ETIMEDOUT') {
      throw new NotFoundException(`${serverName} timed out. Check your network connection.`);
    }

    // Generic error
    throw new Error(`Failed to reach ${serverName}: ${errorMessage}`);
  }
}
