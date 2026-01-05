'use client';

import { CheckCircle2, XCircle, HardDrive, Server } from 'lucide-react';

import type { ConnectionStatus } from '@/lib/api';

import { cn } from '@/lib/utils';

interface ConnectionTestToastProps {
  result: ConnectionStatus;
  serverName: string;
}

/**
 * Compact connection test toast content.
 * Shows API + File Ingestion status in a clean, scannable format.
 */
export function ConnectionTestToastContent({ result, serverName }: ConnectionTestToastProps) {
  const apiOk = result.connected;
  const fileEnabled = result.fileIngestion?.enabled;
  const fileOk = result.fileIngestion?.connected;

  const totalFiles =
    result.fileIngestion?.paths?.reduce((sum, p) => sum + (p.files?.length || 0), 0) || 0;

  const accessiblePaths = result.fileIngestion?.paths?.filter((p) => p.accessible).length || 0;
  const totalPaths = result.fileIngestion?.paths?.length || 0;

  return (
    <div className="flex flex-col gap-2 py-0.5">
      {/* API Row */}
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            apiOk ? 'bg-green-500/15' : 'bg-red-500/15'
          )}
        >
          <Server className={cn('h-3.5 w-3.5', apiOk ? 'text-green-500' : 'text-red-500')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium">API Connection</span>
            {apiOk ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-500" />
            )}
          </div>
          <div className={cn('text-xs', apiOk ? 'text-muted-foreground' : 'text-red-400')}>
            {apiOk ? (
              <>
                {result.serverInfo?.name || serverName}
                {result.serverInfo?.version && (
                  <span className="opacity-60"> v{result.serverInfo.version}</span>
                )}
              </>
            ) : (
              result.error || 'Unable to connect'
            )}
          </div>
        </div>
      </div>

      {/* File Ingestion Row */}
      {fileEnabled && (
        <div className="flex items-center gap-2.5">
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
              fileOk ? 'bg-green-500/15' : 'bg-red-500/15'
            )}
          >
            <HardDrive className={cn('h-3.5 w-3.5', fileOk ? 'text-green-500' : 'text-red-500')} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">File Ingestion</span>
              {fileOk ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
            </div>
            <div className={cn('text-xs', fileOk ? 'text-muted-foreground' : 'text-red-400')}>
              {fileOk ? (
                <>
                  {totalFiles} log file{totalFiles !== 1 ? 's' : ''} found
                  {totalPaths > 1 && (
                    <span className="opacity-60">
                      {' '}
                      · {accessiblePaths}/{totalPaths} paths
                    </span>
                  )}
                </>
              ) : (
                result.fileIngestion?.error || 'Unable to access log files'
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Get the appropriate toast type based on connection result
 */
export function getToastType(result: ConnectionStatus): 'success' | 'warning' | 'error' {
  const apiOk = result.connected;
  const fileEnabled = result.fileIngestion?.enabled;
  const fileOk = result.fileIngestion?.connected;

  if (!apiOk) return 'error';
  if (fileEnabled && !fileOk) return 'warning';
  return 'success';
}

/**
 * Get toast title based on result
 */
export function getToastTitle(result: ConnectionStatus): string {
  const apiOk = result.connected;
  const fileEnabled = result.fileIngestion?.enabled;
  const fileOk = result.fileIngestion?.connected;

  if (!apiOk && fileEnabled && !fileOk) return 'Connection Failed';
  if (!apiOk) return 'API Connection Failed';
  if (fileEnabled && !fileOk) return 'File Ingestion Failed';
  return 'Connection Successful';
}
