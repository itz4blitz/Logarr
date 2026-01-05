import { Injectable, Inject, Logger } from '@nestjs/common';

import { DATABASE_CONNECTION } from '../../database';
import * as schema from '../../database/schema';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// General app settings interface
export interface AppSettings {
  aiEnabled: boolean;
  autoAnalyzeIssues: boolean;
  issueRetentionDays: number;
  logRetentionDays: number;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: PostgresJsDatabase<typeof schema>
  ) {}

  /**
   * Get general app settings
   * For now, these are hardcoded defaults. Can be extended to store in DB.
   */
  getAppSettings(): AppSettings {
    return {
      aiEnabled: true,
      autoAnalyzeIssues: false,
      issueRetentionDays: 90,
      logRetentionDays: 30,
    };
  }

  /**
   * Get system info for settings page
   */
  async getSystemInfo(): Promise<{
    version: string;
    dbConnected: boolean;
    serverCount: number;
    logCount: number;
    issueCount: number;
  }> {
    try {
      const serverCount = await this.db.select({ count: schema.servers.id }).from(schema.servers);

      const logCount = await this.db
        .select({ count: schema.logEntries.id })
        .from(schema.logEntries);

      const issueCount = await this.db.select({ count: schema.issues.id }).from(schema.issues);

      return {
        version: '0.1.0',
        dbConnected: true,
        serverCount: serverCount.length,
        logCount: logCount.length,
        issueCount: issueCount.length,
      };
    } catch {
      return {
        version: '0.1.0',
        dbConnected: false,
        serverCount: 0,
        logCount: 0,
        issueCount: 0,
      };
    }
  }
}
