import { z } from 'zod';

// Configuration schema
export const RetentionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  infoRetentionDays: z.number().min(1).max(365).default(30),
  errorRetentionDays: z.number().min(1).max(365).default(90),
  cleanupCron: z.string().default('0 3 * * *'), // Default: 3 AM daily
  batchSize: z.number().min(100).max(100000).default(10000),
});

export type RetentionConfig = z.infer<typeof RetentionConfigSchema>;

// Per-server storage stats
export interface ServerStorageStats {
  serverId: string;
  serverName: string;
  serverType: string;
  logCount: number;
  estimatedSizeBytes: number;
  estimatedSizeFormatted: string;
  oldestLogTimestamp: string | null;
  newestLogTimestamp: string | null;
  logCountsByLevel: {
    info: number;
    debug: number;
    warn: number;
    error: number;
  };
  // Age distribution - logs by age bucket
  ageDistribution: {
    last24h: number;
    last7d: number;
    last30d: number;
    last90d: number;
    older: number;
  };
  // What would be deleted with current retention settings
  eligibleForCleanup: {
    info: number;
    debug: number;
    warn: number;
    error: number;
    total: number;
  };
}

// Age distribution bucket
export interface AgeDistributionBucket {
  label: string;
  count: number;
  percentage: number;
}

// API Response types
export interface StorageStats {
  logCount: number;
  databaseSizeBytes: number;
  databaseSizeFormatted: string;
  oldestLogTimestamp: string | null;
  newestLogTimestamp: string | null;
  retentionConfig: RetentionConfig;
  logCountsByLevel: {
    info: number;
    debug: number;
    warn: number;
    error: number;
  };
  // Per-server breakdown
  serverStats: ServerStorageStats[];
  // Global age distribution
  ageDistribution: {
    last24h: number;
    last7d: number;
    last30d: number;
    last90d: number;
    older: number;
  };
  // Table size breakdown (if available)
  tableSizes?: {
    logEntries: number;
    issues: number;
    sessions: number;
    playbackEvents: number;
    total: number;
  };
}

export interface CleanupPreview {
  infoLogsToDelete: number;
  debugLogsToDelete: number;
  warnLogsToDelete: number;
  errorLogsToDelete: number;
  totalLogsToDelete: number;
  estimatedSpaceSavingsBytes: number;
  estimatedSpaceSavingsFormatted: string;
  infoCutoffDate: string;
  errorCutoffDate: string;
}

export interface RetentionResult {
  success: boolean;
  info: number;
  debug: number;
  warn: number;
  error: number;
  orphanedOccurrences: number;
  totalDeleted: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface RetentionHistoryEntry {
  id: string;
  startedAt: string;
  completedAt: string | null;
  infoDeleted: number;
  debugDeleted: number;
  warnDeleted: number;
  errorDeleted: number;
  orphanedOccurrencesDeleted: number;
  status: 'running' | 'completed' | 'failed';
  errorMessage: string | null;
}
