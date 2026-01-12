import { Injectable, Logger, Inject } from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';
import { AuditService } from '../audit/audit.service';

interface AuditLogEntry {
  userId: string;
  serverId: string;
  serverName: string;
  providerId: string;
  method: string;
  endpoint: string;
  statusCode?: number | undefined;
  responseTime: number;
  success: boolean;
  errorMessage?: string | undefined;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ProxyAuditService {
  private readonly logger = new Logger(ProxyAuditService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>,
    private readonly auditService: AuditService
  ) {}

  /**
   * Log a proxy request for audit purposes
   */
  async logRequest(entry: AuditLogEntry): Promise<void> {
    try {
      // Log to application logger for immediate debugging
      if (entry.success) {
        this.logger.log(
          `Proxy: ${entry.method} ${entry.serverName}/${entry.endpoint} - ${entry.statusCode} (${entry.responseTime}ms)`
        );
      } else {
        this.logger.error(
          `Proxy: ${entry.method} ${entry.serverName}/${entry.endpoint} - FAILED: ${entry.errorMessage}`
        );
      }

      // Store in global audit log table
      await this.auditService.createLog({
        userId: entry.userId,
        action: entry.success ? 'read' : 'error',
        category: 'proxy',
        entityType: 'server',
        entityId: entry.serverId,
        description: `Proxy ${entry.method} request to ${entry.serverName} (${entry.providerId}) - ${entry.endpoint}`,
        endpoint: `/proxy/${entry.serverId}${entry.endpoint}`,
        method: entry.method,
        statusCode: entry.statusCode ?? 500,
        responseTime: entry.responseTime,
        success: entry.success,
        ...(entry.errorMessage !== undefined && { errorMessage: entry.errorMessage }),
        ...(entry.ipAddress !== undefined && { ipAddress: entry.ipAddress }),
        ...(entry.userAgent !== undefined && { userAgent: entry.userAgent }),
        metadata: {
          serverName: entry.serverName,
          providerId: entry.providerId,
        },
      });
    } catch (error) {
      // Don't throw errors from logging to avoid breaking proxy requests
      this.logger.error(
        `Failed to write audit log: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
