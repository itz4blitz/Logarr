import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  CanActivate,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApiKeysService } from '../modules/api-keys/api-keys.service';

interface RequestWithApiKey {
  headers: Record<string, string | string[] | undefined>;
  apiKey?: {
    id: string;
    name: string;
    rateLimit?: number;
    rateLimitTtl?: number;
  };
  ip?: string;
  method?: string;
  url?: string;
  get?: (header: string) => string | undefined;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeysService: ApiKeysService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithApiKey>();
    const response = context.switchToHttp().getResponse();

    const apiKey = this.extractApiKeyFromHeader(request);

    if (apiKey === undefined || apiKey === null || apiKey === '') {
      throw new UnauthorizedException('API key is required. Use X-API-Key header.');
    }

    const keyRecord = await this.apiKeysService.validateApiKey(apiKey);

    if (!keyRecord) {
      this.logger.warn('Invalid API key attempted');
      throw new UnauthorizedException('Invalid or expired API key');
    }

    request.apiKey = {
      id: keyRecord.id,
      name: keyRecord.name,
      ...(keyRecord.rateLimit !== null && { rateLimit: keyRecord.rateLimit }),
      ...(keyRecord.rateLimitTtl !== null && { rateLimitTtl: keyRecord.rateLimitTtl }),
    };

    // Log API key usage asynchronously (don't block the request)
    const startTime = Date.now();
    const ipAddress = this.extractIpAddress(request);
    const userAgent = request.headers['user-agent'] as string | undefined;

    // Listen for response finish to log the request
    response.on('finish', () => {
      const responseTime = Date.now() - startTime;
      const statusCode = response.statusCode;
      const success = statusCode >= 200 && statusCode < 400;

      this.apiKeysService
        .logUsage(
          keyRecord.id,
          (request.url as string) ?? '/',
          (request.method as string) ?? 'GET',
          statusCode,
          responseTime,
          success,
          success ? undefined : `HTTP ${statusCode}`,
          ipAddress,
          userAgent
        )
        .catch((error) => {
          this.logger.error(
            `Failed to log API key usage: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        });
    });

    return true;
  }

  private extractIpAddress(request: RequestWithApiKey): string | undefined {
    // Check various headers for the real IP address
    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      const parts = forwardedFor.split(',');
      if (parts.length > 0) {
        const part = parts[0];
        if (part !== null && part !== undefined) {
          const firstIp = part.trim();
          if (firstIp.length > 0) {
            return firstIp;
          }
        }
      }
    }
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      const first = forwardedFor[0];
      if (first !== null && first !== undefined && first.length > 0) {
        return first;
      }
    }

    const realIp = request.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) {
      return realIp;
    }

    return request.ip;
  }

  private extractApiKeyFromHeader(request: RequestWithApiKey): string | undefined {
    const apiKey = request.headers['x-api-key'];

    if (apiKey === undefined || apiKey === null || apiKey === '') {
      return undefined;
    }

    if (typeof apiKey !== 'string') {
      return undefined;
    }

    return apiKey.trim();
  }
}
