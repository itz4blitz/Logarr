import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { ApiKeysService } from '../../api-keys/api-keys.service';
import { AuthService } from '../auth.service';

import type { apiKeys } from '../../../database/schema';
import type { JwtPayload } from '../auth.service';

// Extended request interface for JWT auth data
// Note: Audit middleware has its own AuthenticatedRequest for its use case
export interface JwtAuthRequest extends Request {
  apiKey?: typeof apiKeys.$inferSelect;
  user?: JwtPayload;
  authType?: 'apiKey' | 'jwt';
}

/**
 * Metadata key to mark public endpoints
 */
export const PUBLIC_ENDPOINT_KEY = 'isPublic';

/**
 * Unified Authentication Guard
 * Accepts either:
 * 1. Valid API key (from X-API-Key header or query param)
 * 2. Valid JWT token (from Authorization header)
 *
 * API keys identify external apps/mobile clients
 * JWT tokens identify web UI sessions
 */
@Injectable()
export class UnifiedAuthGuard implements CanActivate {
  private readonly logger = new Logger(UnifiedAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeysService: ApiKeysService,
    private readonly authService: AuthService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if endpoint is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ENDPOINT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<JwtAuthRequest>();

    // Try API key authentication first
    const apiKey = this.extractApiKey(request);
    if (apiKey !== undefined && apiKey !== '') {
      return this.validateApiKey(apiKey, request);
    }

    // Try JWT authentication
    const authHeader = this.getHeader(request, 'authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return this.validateJwtToken(authHeader.substring(7), request);
    }

    // No valid authentication found
    throw new UnauthorizedException(
      'Authentication required. Provide a valid API key or JWT token.'
    );
  }

  /**
   * Get a header value, handling both string and string[] cases
   */
  private getHeader(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value[0] : value;
  }

  /**
   * Extract API key from headers or query parameters
   */
  private extractApiKey(request: Request): string | undefined {
    // Check X-API-Key header first
    const headerKey = this.getHeader(request, 'x-api-key');
    if (headerKey !== undefined && headerKey !== '') {
      return headerKey;
    }

    // Check query parameter
    const hostHeader = this.getHeader(request, 'host') ?? 'localhost';
    const url = new URL(request.url ?? '/', `http://${hostHeader}`);
    const apiKeyParam = url.searchParams.get('api_key');
    return apiKeyParam ?? undefined;
  }

  /**
   * Validate API key and attach to request
   */
  private async validateApiKey(
    apiKey: string,
    request: JwtAuthRequest
  ): Promise<boolean> {
    try {
      const keyRecord = await this.apiKeysService.validateApiKey(apiKey);

      if (keyRecord === undefined || keyRecord === null) {
        this.logger.warn(`Invalid API key provided`);
        throw new UnauthorizedException('Invalid API key');
      }

      // Attach API key info to request for later use
      // After the null check above, keyRecord is non-null
      request.apiKey = keyRecord;
      request.authType = 'apiKey';

      this.logger.debug(`API key authenticated: ${keyRecord.id}`);
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Error validating API key: ${error}`);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Validate JWT token and attach user to request
   */
  private async validateJwtToken(
    token: string,
    request: JwtAuthRequest
  ): Promise<boolean> {
    try {
      this.logger.debug(`Attempting to validate JWT token (length: ${token.length})...`);
      // Use AuthService to validate token
      const payload = await this.authService.validateToken(token);

      // Attach user info to request
      request.user = payload;
      request.authType = 'jwt';

      this.logger.debug(`JWT authenticated for user: ${payload.sub}`);
      return true;
    } catch (error) {
      this.logger.warn(`Invalid JWT token provided: ${error}`);
      throw new UnauthorizedException('Invalid token');
    }
  }
}

/**
 * Decorator factory to mark public endpoints that bypass authentication
 */
export function Public(): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor => {
    Reflect.defineMetadata(PUBLIC_ENDPOINT_KEY, true, descriptor.value);
    return descriptor;
  };
}
