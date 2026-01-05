'use client';

import {
  CheckCircle2,
  XCircle,
  HardDrive,
  Server,
  FileText,
  FolderOpen,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';

import type { Server as ServerType, ConnectionStatus as ConnectionStatusType } from '@/lib/api';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SourceDiagnosticsDialogProps {
  server: ServerType;
  connectionStatus: ConnectionStatusType | null;
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

export function SourceDiagnosticsDialog({
  server,
  connectionStatus,
  isLoading,
  open,
  onOpenChange,
  onRefresh,
}: SourceDiagnosticsDialogProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<number>>(new Set([0]));
  const [copiedPath, setCopiedPath] = useState<number | null>(null);

  const togglePath = (index: number) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const copyToClipboard = async (text: string, index: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedPath(index);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const apiOk = connectionStatus?.connected;
  const fileEnabled = connectionStatus?.fileIngestion?.enabled;
  const fileOk = connectionStatus?.fileIngestion?.connected;
  const paths = connectionStatus?.fileIngestion?.paths || [];

  const totalFiles = paths.reduce((sum, p) => sum + (p.files?.length || 0), 0);
  const accessiblePaths = paths.filter((p) => p.accessible).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Diagnostics: {server.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="h-7 px-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </DialogTitle>
          <DialogDescription>Detailed connection and file ingestion diagnostics</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* API Connection Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    apiOk ? 'bg-green-500/15' : 'bg-red-500/15'
                  )}
                >
                  <Server className={cn('h-4 w-4', apiOk ? 'text-green-500' : 'text-red-500')} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">API Connection</span>
                    <Badge variant={apiOk ? 'default' : 'destructive'} className="text-xs">
                      {apiOk ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground text-sm">{server.url}</div>
                </div>
              </div>

              {connectionStatus && (
                <div className="ml-10 space-y-2 text-sm">
                  {connectionStatus.serverInfo && (
                    <div className="text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      <span>
                        {connectionStatus.serverInfo.name} v{connectionStatus.serverInfo.version}
                      </span>
                    </div>
                  )}
                  {connectionStatus.error && (
                    <div className="flex items-start gap-2 text-red-400">
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="font-mono text-xs break-all">{connectionStatus.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* File Ingestion Section */}
            {server.fileIngestionEnabled && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      !fileEnabled ? 'bg-muted' : fileOk ? 'bg-green-500/15' : 'bg-red-500/15'
                    )}
                  >
                    <HardDrive
                      className={cn(
                        'h-4 w-4',
                        !fileEnabled
                          ? 'text-muted-foreground'
                          : fileOk
                            ? 'text-green-500'
                            : 'text-red-500'
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">File Ingestion</span>
                      <Badge
                        variant={!fileEnabled ? 'secondary' : fileOk ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {!fileEnabled ? 'Disabled' : fileOk ? 'Connected' : 'Error'}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {fileEnabled
                        ? `${accessiblePaths}/${paths.length} paths accessible · ${totalFiles} files found`
                        : 'Not configured'}
                    </div>
                  </div>
                </div>

                {connectionStatus?.fileIngestion?.error && (
                  <div className="ml-10 flex items-start gap-2 text-sm text-red-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{connectionStatus.fileIngestion.error}</span>
                  </div>
                )}

                {/* Configured Paths */}
                {server.logPaths && server.logPaths.length > 0 && (
                  <div className="ml-10 space-y-2">
                    <div className="text-muted-foreground text-sm font-medium">
                      Configured Paths:
                    </div>
                    {server.logPaths.map((configPath, index) => {
                      const pathResult = paths.find((p) => p.path === configPath);
                      const isExpanded = expandedPaths.has(index);
                      const hasFiles = pathResult?.files && pathResult.files.length > 0;

                      return (
                        <Collapsible
                          key={index}
                          open={isExpanded}
                          onOpenChange={() => togglePath(index)}
                        >
                          <div
                            className={cn(
                              'rounded-lg border p-3',
                              pathResult?.accessible
                                ? 'border-green-500/30 bg-green-500/5'
                                : 'border-red-500/30 bg-red-500/5'
                            )}
                          >
                            <CollapsibleTrigger asChild>
                              <div className="flex cursor-pointer items-start gap-2">
                                <Button variant="ghost" size="sm" className="h-5 w-5 shrink-0 p-0">
                                  {isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                                <FolderOpen
                                  className={cn(
                                    'mt-0.5 h-4 w-4 shrink-0',
                                    pathResult?.accessible ? 'text-green-500' : 'text-red-500'
                                  )}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <code className="font-mono text-xs break-all">
                                      {configPath}
                                    </code>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-5 w-5 shrink-0 p-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(configPath, index);
                                      }}
                                    >
                                      {copiedPath === index ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <Copy className="text-muted-foreground h-3 w-3" />
                                      )}
                                    </Button>
                                  </div>
                                  <div
                                    className={cn(
                                      'mt-1 text-xs',
                                      pathResult?.accessible
                                        ? 'text-green-600 dark:text-green-400'
                                        : 'text-red-600 dark:text-red-400'
                                    )}
                                  >
                                    {pathResult?.accessible
                                      ? `${pathResult.files?.length || 0} log files found`
                                      : pathResult?.error || 'Path not accessible'}
                                  </div>
                                </div>
                              </div>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              {hasFiles && (
                                <div className="border-border/50 mt-3 border-t pt-3">
                                  <div className="text-muted-foreground mb-2 text-xs font-medium">
                                    Discovered Files:
                                  </div>
                                  <div className="space-y-1">
                                    {pathResult.files!.map((file, fileIndex) => (
                                      <div
                                        key={fileIndex}
                                        className="flex items-center gap-2 text-xs"
                                      >
                                        <FileText className="text-muted-foreground h-3 w-3 shrink-0" />
                                        <code className="text-muted-foreground font-mono break-all">
                                          {file}
                                        </code>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {!pathResult?.accessible && pathResult?.error && (
                                <div className="border-border/50 mt-3 border-t pt-3">
                                  <div className="mb-1 text-xs font-medium text-red-400">
                                    Error Details:
                                  </div>
                                  <code className="font-mono text-xs break-all text-red-400/80">
                                    {pathResult.error}
                                  </code>
                                </div>
                              )}
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}

                {/* File Patterns */}
                {server.logFilePatterns && server.logFilePatterns.length > 0 && (
                  <div className="ml-10 space-y-2">
                    <div className="text-muted-foreground text-sm font-medium">File Patterns:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {server.logFilePatterns.map((pattern, index) => (
                        <Badge key={index} variant="outline" className="font-mono text-xs">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Debug Info */}
            <div className="border-t pt-4">
              <div className="text-muted-foreground space-y-1 text-xs">
                <div>
                  <span className="font-medium">Server ID:</span>{' '}
                  <code className="font-mono">{server.id}</code>
                </div>
                <div>
                  <span className="font-medium">Provider:</span> {server.providerId}
                </div>
                <div>
                  <span className="font-medium">Last Seen:</span>{' '}
                  {server.lastSeen ? new Date(server.lastSeen).toLocaleString() : 'Never'}
                </div>
                {server.lastFileSync && (
                  <div>
                    <span className="font-medium">Last File Sync:</span>{' '}
                    {new Date(server.lastFileSync).toLocaleString()}
                  </div>
                )}
                {server.lastError && (
                  <div className="text-red-400">
                    <span className="font-medium">Last Error:</span> {server.lastError}
                  </div>
                )}
                {server.fileIngestionError && (
                  <div className="text-red-400">
                    <span className="font-medium">File Ingestion Error:</span>{' '}
                    {server.fileIngestionError}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
