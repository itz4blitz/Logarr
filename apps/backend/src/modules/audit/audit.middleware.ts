import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { AuditGateway } from './audit.gateway';
import { AuditService } from './audit.service';

// Extend Express Request type
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
  };
  session?: {
    id: string;
  };
  apiKey?: {
    id: string;
    name: string;
    type: string;
  };
}

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditMiddleware.name);

  // Paths to exclude from audit logging
  private excludedPaths = [
    '/health',
    '/api/docs',
    '/api/json',
    '/settings/audit', // Don't log audit log requests themselves
  ];

  constructor(
    private readonly auditService: AuditService,
    private readonly auditGateway: AuditGateway
  ) {}

  use(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    // Skip audit logging for excluded paths
    const request = req as Request & AuthenticatedRequest;
    if (this.shouldExclude(request.path)) {
      return next();
    }

    const startTime = Date.now();

    // Listen for response finish
    res.on('finish', async () => {
      const responseTime = Date.now() - startTime;
      const statusCode = res.statusCode;
      const success = statusCode >= 200 && statusCode < 400;

      // Determine action from method
      const action = this.getActionFromMethod(request.method, success);

      // Determine category from path
      const category = this.getCategoryFromPath(request.path);

      // Extract entity type and ID from path
      const { entityType, entityId } = this.extractEntityInfo(request.path, category);

      // Extract IP address
      const ipAddress = this.extractIpAddress(request);

      // Build description
      const description = this.buildDescription(request.method, request.path, statusCode, success);

      // Log asynchronously (don't block the request)
      try {
        const logData: Record<string, unknown> = {
          action,
          category,
          entityType,
          entityId,
          description,
          endpoint: request.path,
          method: request.method,
          statusCode,
          responseTime,
          success,
          errorMessage: success ? undefined : `HTTP ${statusCode}`,
          ipAddress,
          userAgent: request.headers['user-agent'] as string | undefined,
          timestamp: new Date().toISOString(),
        };

        // Only add optional fields if they exist
        if (request.user?.id) logData['userId'] = request.user.id;
        if (request.session?.id) logData['sessionId'] = request.session.id;
        if (request.apiKey?.id) logData['apiKeyId'] = request.apiKey.id;

        await this.auditService.createLog(logData as any);

        // Broadcast to WebSocket clients for real-time updates
        this.auditGateway.broadcastAuditLog(logData);
      } catch (error) {
        // Don't let audit logging errors break the app
        this.logger.error(
          `Failed to create audit log: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    next();
  }

  private shouldExclude(path: string): boolean {
    return this.excludedPaths.some((excluded) => path.startsWith(excluded));
  }

  private getActionFromMethod(
    method: string,
    success: boolean
  ): 'create' | 'update' | 'delete' | 'read' | 'error' | 'other' {
    if (!success) return 'error';

    switch (method.toUpperCase()) {
      case 'GET':
        return 'read';
      case 'POST':
        return 'create';
      case 'PUT':
      case 'PATCH':
        return 'update';
      case 'DELETE':
        return 'delete';
      default:
        return 'other';
    }
  }

  private getCategoryFromPath(
    path: string
  ):
    | 'auth'
    | 'server'
    | 'log_entry'
    | 'session'
    | 'issue'
    | 'ai_analysis'
    | 'api_key'
    | 'settings'
    | 'retention'
    | 'proxy'
    | 'other' {
    if (path.includes('/auth') || path.includes('/login')) return 'auth';
    if (path.includes('/servers')) return 'server';
    if (path.includes('/logs')) return 'log_entry';
    if (path.includes('/sessions') || path.includes('/playback')) return 'session';
    if (path.includes('/issues')) return 'issue';
    if (path.includes('/ai')) return 'ai_analysis';
    if (path.includes('/api-keys')) return 'api_key';
    if (path.includes('/settings')) return 'settings';
    if (path.includes('/retention')) return 'retention';
    if (path.includes('/proxy')) return 'proxy';
    return 'other';
  }

  private extractEntityInfo(
    path: string,
    _category: string
  ): { entityType: string; entityId?: string } {
    const parts = path.split('/').filter(Boolean);

    // Remove 'api' prefix if present
    if (parts[0] === 'api') {
      parts.shift();
    }

    // Extract entity type from first segment
    const entityType = parts[0] || 'unknown';

    // Extract entity ID from second segment if it looks like a UUID
    const secondPart = parts[1];
    const entityId =
      parts.length > 1 &&
      secondPart &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secondPart)
        ? secondPart
        : undefined;

    return { entityType, ...(entityId !== undefined && { entityId }) };
  }

  private buildDescription(
    method: string,
    path: string,
    statusCode: number,
    success: boolean
  ): string {
    const status = success ? 'Success' : 'Failed';
    return `${method} ${path} - ${status} (${statusCode})`;
  }

  private extractIpAddress(req: Request): string | undefined {
    // Check various headers for the real IP address
    const forwardedFor = req.headers['x-forwarded-for'];
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

    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) {
      return realIp;
    }

    return req.ip;
  }
}
