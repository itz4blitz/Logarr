'use client';

import { Database, HardDrive, Trash2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useStorageStats, useCleanupPreview, useRunCleanup } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

function formatCount(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(2)}M`;
}

export function StorageIndicator() {
  const { data: stats, isLoading: statsLoading } = useStorageStats();
  const { data: preview } = useCleanupPreview();
  const cleanupMutation = useRunCleanup();

  if (statsLoading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-5 w-20" />
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const hasLogsToCleanup = preview && preview.totalLogsToDelete > 0;

  return (
    <TooltipProvider>
      <div className="text-muted-foreground flex items-center gap-4 text-sm">
        {/* Log count */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-help items-center gap-1.5">
              <Database className="h-4 w-4" />
              <span className="tabular-nums">{formatCount(stats.logCount)} logs</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <p className="font-medium">Log Counts by Level:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                <span>Error:</span>
                <span className="text-red-400 tabular-nums">
                  {formatCount(stats.logCountsByLevel.error)}
                </span>
                <span>Warn:</span>
                <span className="text-yellow-400 tabular-nums">
                  {formatCount(stats.logCountsByLevel.warn)}
                </span>
                <span>Info:</span>
                <span className="text-blue-400 tabular-nums">
                  {formatCount(stats.logCountsByLevel.info)}
                </span>
                <span>Debug:</span>
                <span className="text-zinc-400 tabular-nums">
                  {formatCount(stats.logCountsByLevel.debug)}
                </span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Database size */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-help items-center gap-1.5">
              <HardDrive className="h-4 w-4" />
              <span>{stats.databaseSizeFormatted}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Total database size</p>
          </TooltipContent>
        </Tooltip>

        {/* Oldest log age */}
        {stats.oldestLogTimestamp && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-muted-foreground/60 flex cursor-help items-center gap-1.5 text-xs">
                <Clock className="h-3 w-3" />
                <span>
                  {formatDistanceToNow(new Date(stats.oldestLogTimestamp), { addSuffix: false })}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">Age of oldest log</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Retention policy info */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex cursor-help items-center gap-1.5 text-xs">
              <Trash2 className="h-3 w-3" />
              <span>
                {stats.retentionConfig.infoRetentionDays}d /{' '}
                {stats.retentionConfig.errorRetentionDays}d
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="space-y-1 text-xs">
              <p className="font-medium">Retention Policy:</p>
              <p>Info/Debug logs: {stats.retentionConfig.infoRetentionDays} days</p>
              <p>Error/Warn logs: {stats.retentionConfig.errorRetentionDays} days</p>
              <p className="text-muted-foreground">
                Cleanup: {stats.retentionConfig.enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Cleanup button (only show if there are logs to clean) */}
        {hasLogsToCleanup && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 px-2 text-xs',
                  cleanupMutation.isPending && 'cursor-wait opacity-50'
                )}
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isPending}
              >
                {cleanupMutation.isPending
                  ? 'Cleaning...'
                  : `Clean ${formatCount(preview.totalLogsToDelete)}`}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <p className="font-medium">Cleanup Preview:</p>
                <p>{formatCount(preview.totalLogsToDelete)} logs eligible for cleanup</p>
                <p className="text-muted-foreground">
                  Est. savings: {preview.estimatedSpaceSavingsFormatted}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
