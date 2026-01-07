'use client';

import { Wifi, FileText, Check, X, Minus, Loader2, RefreshCw } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  apiConnected: boolean;
  fileIngestionEnabled: boolean;
  fileIngestionConnected: boolean;
  lastSeen?: string | null;
  lastFileSync?: string | null;
  variant?: 'dot' | 'badge' | 'compact';
  showLabels?: boolean;
  className?: string;
  /** When true, shows a loading state instead of disconnected */
  isChecking?: boolean;
  /** Sync status for file ingestion */
  syncStatus?: 'idle' | 'pending' | 'discovering' | 'syncing' | 'error';
  /** Sync progress (0-100) */
  syncProgress?: number;
}

/**
 * Dual connection status indicator for API and File-based log sources.
 * Shows a visual indicator of connectivity status for both sources.
 */
export function ConnectionStatus({
  apiConnected,
  fileIngestionEnabled,
  fileIngestionConnected,
  lastSeen,
  lastFileSync,
  variant = 'dot',
  showLabels = false,
  className,
  isChecking = false,
  syncStatus,
  syncProgress,
}: ConnectionStatusProps) {
  const isSyncing = syncStatus === 'discovering' || syncStatus === 'syncing';
  // Calculate connected count for display
  const maxSources = fileIngestionEnabled ? 2 : 1;
  const connectedCount =
    (apiConnected ? 1 : 0) + (fileIngestionEnabled && fileIngestionConnected ? 1 : 0);

  if (variant === 'badge') {
    // Show loading state when checking
    if (isChecking && !apiConnected && !lastSeen) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
                'bg-zinc-500/10 text-zinc-400',
                className
              )}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">Checking...</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <ConnectionStatusDetails
              apiConnected={apiConnected}
              fileIngestionEnabled={fileIngestionEnabled}
              fileIngestionConnected={fileIngestionConnected}
              lastSeen={lastSeen}
              lastFileSync={lastFileSync}
              isChecking={isChecking}
              syncStatus={syncStatus}
              syncProgress={syncProgress}
            />
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
              isSyncing
                ? 'bg-blue-500/10 text-blue-500'
                : connectedCount === maxSources
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : connectedCount > 0
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-red-500/10 text-red-500',
              className
            )}
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span className="tabular-nums">{syncProgress ?? 0}%</span>
              </>
            ) : (
              <>
                <span className="tabular-nums">
                  {connectedCount}/{maxSources}
                </span>
                {showLabels && (
                  <span className="text-xs opacity-80">
                    {connectedCount === maxSources ? 'All Connected' : 'Partial'}
                  </span>
                )}
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <ConnectionStatusDetails
            apiConnected={apiConnected}
            fileIngestionEnabled={fileIngestionEnabled}
            fileIngestionConnected={fileIngestionConnected}
            lastSeen={lastSeen}
            lastFileSync={lastFileSync}
            isChecking={isChecking}
            syncStatus={syncStatus}
            syncProgress={syncProgress}
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1', className)}>
            {/* API Status */}
            <div
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                apiConnected ? 'bg-emerald-500' : 'bg-red-500'
              )}
            />
            {/* File Status - only show if enabled */}
            {fileIngestionEnabled && (
              <div
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  isSyncing
                    ? 'animate-pulse bg-blue-500'
                    : fileIngestionConnected
                      ? 'bg-emerald-500'
                      : 'bg-zinc-600'
                )}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <ConnectionStatusDetails
            apiConnected={apiConnected}
            fileIngestionEnabled={fileIngestionEnabled}
            fileIngestionConnected={fileIngestionConnected}
            lastSeen={lastSeen}
            lastFileSync={lastFileSync}
            syncStatus={syncStatus}
            syncProgress={syncProgress}
          />
        </TooltipContent>
      </Tooltip>
    );
  }

  // Default "dot" variant - single dot with gradient or split styling
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn('relative', className)}>
          {fileIngestionEnabled ? (
            // Dual status: split circle or stacked dots
            <div className="flex items-center gap-0.5">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  apiConnected ? 'bg-emerald-500' : 'bg-red-500'
                )}
              />
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  isSyncing
                    ? 'animate-pulse bg-blue-500'
                    : fileIngestionConnected
                      ? 'bg-emerald-500'
                      : 'bg-zinc-600'
                )}
              />
            </div>
          ) : (
            // Single status dot
            <div
              className={cn('h-2 w-2 rounded-full', apiConnected ? 'bg-emerald-500' : 'bg-red-500')}
            />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <ConnectionStatusDetails
          apiConnected={apiConnected}
          fileIngestionEnabled={fileIngestionEnabled}
          fileIngestionConnected={fileIngestionConnected}
          lastSeen={lastSeen}
          lastFileSync={lastFileSync}
          syncStatus={syncStatus}
          syncProgress={syncProgress}
        />
      </TooltipContent>
    </Tooltip>
  );
}

interface ConnectionStatusDetailsProps {
  apiConnected: boolean;
  fileIngestionEnabled: boolean;
  fileIngestionConnected: boolean;
  lastSeen?: string | null;
  lastFileSync?: string | null;
  isChecking?: boolean;
  syncStatus?: 'idle' | 'pending' | 'discovering' | 'syncing' | 'error';
  syncProgress?: number;
}

function ConnectionStatusDetails({
  apiConnected,
  fileIngestionEnabled,
  fileIngestionConnected,
  lastSeen,
  lastFileSync,
  isChecking = false,
  syncStatus,
  syncProgress,
}: ConnectionStatusDetailsProps) {
  // Determine if we should show loading for API status
  const showApiLoading = isChecking && !apiConnected && !lastSeen;
  const isSyncing = syncStatus === 'discovering' || syncStatus === 'syncing';

  return (
    <div className="space-y-2 py-1">
      <div className="mb-2 border-b border-zinc-700 pb-1 text-xs font-medium text-zinc-300">
        Connection Status
      </div>

      {/* API Status */}
      <div className="flex items-center gap-2">
        <Wifi className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-xs text-zinc-400">API</span>
        <div className="flex-1" />
        {showApiLoading ? (
          <div className="flex items-center gap-1 text-zinc-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs">Checking...</span>
          </div>
        ) : apiConnected ? (
          <div className="flex items-center gap-1 text-emerald-500">
            <Check className="h-3 w-3" />
            <span className="text-xs">Connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-red-500">
            <X className="h-3 w-3" />
            <span className="text-xs">Disconnected</span>
          </div>
        )}
      </div>

      {/* File Ingestion Status */}
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-xs text-zinc-400">Files</span>
        <div className="flex-1" />
        {!fileIngestionEnabled ? (
          <div className="flex items-center gap-1 text-zinc-500">
            <Minus className="h-3 w-3" />
            <span className="text-xs">Not Enabled</span>
          </div>
        ) : isSyncing ? (
          <div className="flex items-center gap-1 text-blue-500">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span className="text-xs">Syncing {syncProgress ?? 0}%</span>
          </div>
        ) : fileIngestionConnected ? (
          <div className="flex items-center gap-1 text-emerald-500">
            <Check className="h-3 w-3" />
            <span className="text-xs">Connected</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-amber-500">
            <X className="h-3 w-3" />
            <span className="text-xs">Not Connected</span>
          </div>
        )}
      </div>

      {/* Sync progress bar */}
      {isSyncing && (
        <div className="pt-1">
          <Progress value={syncProgress ?? 0} className="h-1" />
        </div>
      )}

      {/* Last seen info */}
      {(lastSeen || lastFileSync) && (
        <div className="mt-1 space-y-1 border-t border-zinc-700 pt-1">
          {lastSeen && (
            <div className="text-xs text-zinc-500">
              API: Last seen {new Date(lastSeen).toLocaleString()}
            </div>
          )}
          {lastFileSync && (
            <div className="text-xs text-zinc-500">
              Files: Last sync {new Date(lastFileSync).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Simple status badge showing "X/Y" format
 */
export function ConnectionStatusBadge({
  apiConnected,
  fileIngestionEnabled,
  fileIngestionConnected,
  className,
}: Pick<
  ConnectionStatusProps,
  'apiConnected' | 'fileIngestionEnabled' | 'fileIngestionConnected' | 'className'
>) {
  const maxSources = fileIngestionEnabled ? 2 : 1;
  const connectedCount =
    (apiConnected ? 1 : 0) + (fileIngestionEnabled && fileIngestionConnected ? 1 : 0);

  return (
    <span
      className={cn(
        'inline-flex min-w-[2rem] items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums',
        connectedCount === maxSources
          ? 'bg-emerald-500/15 text-emerald-400'
          : connectedCount > 0
            ? 'bg-amber-500/15 text-amber-400'
            : 'bg-red-500/15 text-red-400',
        className
      )}
    >
      {connectedCount}/{maxSources}
    </span>
  );
}
