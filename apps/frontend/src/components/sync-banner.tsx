'use client';

import {
  RefreshCw,
  FileText,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Search,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { useState } from 'react';

import { Progress } from '@/components/ui/progress';
import { useSyncStatus, type SyncProgress } from '@/hooks/use-sync-status';
import { cn } from '@/lib/utils';

/**
 * Global sync banner that displays during initial log backfill.
 * Shows progress for all servers being synced.
 */
export function SyncBanner() {
  const { isSyncing, syncingCount, displayProgress, servers, isInitialSync, connected } =
    useSyncStatus();
  const [expanded, setExpanded] = useState(true); // Start expanded
  const [dismissed, setDismissed] = useState(false);

  // Get syncing servers for details
  const syncingServers = Array.from(servers.values()).filter(
    (s) => s.status === 'discovering' || s.status === 'processing'
  );

  // Don't show if:
  // - dismissed by user
  // - not connected yet (prevents flash during initial load)
  // - not syncing AND no servers being tracked
  if (dismissed || !connected || (!isSyncing && servers.size === 0)) {
    return null;
  }

  // Show syncing banner
  if (isSyncing) {
    return (
      <div
        className={cn(
          'border-b border-blue-500/30 bg-blue-500/10',
          'animate-in slide-in-from-top duration-300'
        )}
      >
        {/* Main banner */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 text-blue-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm font-semibold">
              {isInitialSync ? 'Initial Log Sync' : 'Syncing Logs'}
            </span>
          </div>

          {/* Progress bar - uses interpolated displayProgress for smooth animation */}
          <div className="flex flex-1 items-center gap-3">
            <Progress value={displayProgress} className="h-2 max-w-md flex-1" />
            <span className="min-w-[3rem] text-sm font-medium text-blue-300 tabular-nums">
              {displayProgress}%
            </span>
          </div>

          {/* Server count & expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-sm text-blue-300 transition-colors hover:text-blue-100"
          >
            <FileText className="h-4 w-4" />
            <span>
              {syncingCount} {syncingCount === 1 ? 'source' : 'sources'}
            </span>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {/* Dismiss button (only for non-initial sync) */}
          {!isInitialSync && (
            <button
              onClick={() => setDismissed(true)}
              className="p-1 text-blue-400 transition-colors hover:text-blue-100"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Expanded details */}
        {expanded && syncingServers.length > 0 && (
          <div className="space-y-2 border-t border-blue-500/20 bg-blue-500/5 px-4 py-2">
            {syncingServers.map((server) => (
              <ServerSyncProgress key={server.serverId} server={server} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Not syncing but have servers - sync complete
  return null;
}

function ServerSyncProgress({ server }: { server: SyncProgress }) {
  // Calculate files completed vs total
  const filesCompleted = server.filesCompleted ?? server.processedFiles;
  const activeReading = server.processedFiles - filesCompleted;

  // Status text and icon based on state
  let StatusIcon = RefreshCw;
  let statusText = '';
  let statusColor = 'text-muted-foreground';

  if (server.status === 'discovering') {
    StatusIcon = Search;
    statusText = 'Discovering...';
    statusColor = 'text-yellow-500';
  } else if (server.status === 'error') {
    StatusIcon = AlertCircle;
    statusText = server.error ?? 'Error';
    statusColor = 'text-red-500';
  } else if (server.status === 'watching') {
    StatusIcon = CheckCircle2;
    statusText = 'Complete';
    statusColor = 'text-green-500';
  } else if (activeReading > 0) {
    // Still reading files
    StatusIcon = Loader2;
    statusText = `Reading ${activeReading} file${activeReading !== 1 ? 's' : ''}...`;
    statusColor = 'text-blue-400';
  } else {
    // Processing but no active reads - queued
    statusText = `${filesCompleted}/${server.totalFiles} files`;
    statusColor = 'text-muted-foreground';
  }

  return (
    <div className="flex items-center gap-3">
      {/* Server name */}
      <span className="text-foreground min-w-[100px] truncate text-xs font-medium">
        {server.serverName}
      </span>

      {/* Progress bar */}
      <Progress value={server.progress} className="h-1 max-w-[200px] flex-1" />

      {/* Status with icon */}
      <div className={cn('flex min-w-[120px] items-center gap-1.5', statusColor)}>
        <StatusIcon className={cn('h-3 w-3', server.status === 'processing' && 'animate-spin')} />
        <span className="text-xs tabular-nums">{statusText}</span>
      </div>

      {/* Current file being processed */}
      {server.currentFiles.length > 0 && server.status === 'processing' && (
        <span
          className="text-muted-foreground max-w-[150px] truncate text-xs"
          title={server.currentFiles.join(', ')}
        >
          {server.currentFiles[0]}
          {server.currentFiles.length > 1 && ` +${server.currentFiles.length - 1}`}
        </span>
      )}
    </div>
  );
}

/**
 * Compact sync indicator for use in headers/sidebars
 */
export function SyncIndicator({ className }: { className?: string }) {
  const { isSyncing, displayProgress, syncingCount } = useSyncStatus();

  if (!isSyncing) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />
      <span className="text-muted-foreground text-xs tabular-nums">
        {displayProgress}% ({syncingCount})
      </span>
    </div>
  );
}

/**
 * Header bar sync status - centered, prominent indicator
 * Uses displayProgress for smooth, non-bouncing animation
 * Always returns a flex-1 spacer to maintain consistent header layout
 */
export function SyncStatusHeader() {
  const { isSyncing, syncingCount, displayProgress, servers, isInitialSync } = useSyncStatus();

  // Always return flex-1 spacer to maintain header layout
  if (!isSyncing) {
    return <div className="flex-1" />;
  }

  // Calculate total files across all syncing servers
  const syncingServers = Array.from(servers.values()).filter(
    (s) => s.status === 'discovering' || s.status === 'processing'
  );
  const totalFiles = syncingServers.reduce((sum, s) => sum + s.totalFiles, 0);
  const completedFiles = syncingServers.reduce(
    (sum, s) => sum + (s.filesCompleted ?? s.processedFiles),
    0
  );

  return (
    <div className="flex flex-1 justify-center">
      <div className="flex items-center gap-3 rounded-full border border-blue-500/30 bg-blue-500/20 px-4 py-1.5">
        <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm font-medium text-blue-300">
          {isInitialSync ? 'Initial Sync' : 'Syncing'}
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-blue-900/50">
          <div
            className="h-full rounded-full bg-blue-400 transition-all duration-150 ease-out"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
        <span className="text-sm font-medium text-blue-300 tabular-nums">{displayProgress}%</span>
        {/* Show file count if we have files, otherwise show source count */}
        {totalFiles > 0 ? (
          <span className="text-xs text-blue-400 tabular-nums">
            ({completedFiles}/{totalFiles} files)
          </span>
        ) : (
          <span className="text-xs text-blue-400">
            ({syncingCount} {syncingCount === 1 ? 'source' : 'sources'})
          </span>
        )}
      </div>
    </div>
  );
}
