'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  Check,
  Loader2,
  CheckCircle,
  Clock,
  Server,
  RefreshCw,
  Database,
  HardDrive,
  AlertCircle,
  PlayCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  BarChart3,
  FileText,
  XCircle,
  AlertTriangle,
  Info,
  Bug,
} from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';

import type { AiProviderType } from '@/lib/api';

import { ProviderIcon } from '@/components/provider-icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  useRetentionSettings,
  useUpdateRetentionSettings,
  useRetentionHistory,
  useStorageStats,
  useCleanupPreview,
  useRunCleanup,
  useFileIngestionSettings,
  useUpdateFileIngestionSettings,
  useDeleteServerLogsByLevel,
  useDeleteServerLogs,
  useDeleteAllLogs,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';

export default function DataManagementPage() {
  const {
    data: settings,
    isLoading: settingsLoading,
    error: settingsError,
  } = useRetentionSettings();
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useStorageStats();
  const { data: preview, isLoading: previewLoading } = useCleanupPreview();
  const { data: history, isLoading: historyLoading } = useRetentionHistory(10);
  const {
    data: fileIngestionSettings,
    isLoading: fileIngestionLoading,
    error: fileIngestionError,
  } = useFileIngestionSettings();

  const updateMutation = useUpdateRetentionSettings();
  const runCleanupMutation = useRunCleanup();
  const updateFileIngestionMutation = useUpdateFileIngestionSettings();
  const deleteByLevelMutation = useDeleteServerLogsByLevel();
  const deleteServerLogsMutation = useDeleteServerLogs();
  const deleteAllLogsMutation = useDeleteAllLogs();

  // State for expandable server details
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  // State for delete confirmation dialogs
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: 'level' | 'server' | 'all';
    serverId?: string;
    serverName?: string;
    level?: string;
    count?: number;
  }>({ open: false, type: 'level' });

  // All hooks must be called before any early returns
  const [localSettings, setLocalSettings] = useState({
    enabled: true,
    infoRetentionDays: 30,
    errorRetentionDays: 90,
  });

  const [localFileIngestionSettings, setLocalFileIngestionSettings] = useState({
    maxConcurrentTailers: 5,
    maxFileAgeDays: 7,
    tailerStartDelayMs: 500,
  });

  // Sync local state with server settings
  const settingsRef = useRef(settings);
  if (settings && settings !== settingsRef.current) {
    settingsRef.current = settings;
    setLocalSettings({
      enabled: settings.enabled,
      infoRetentionDays: settings.infoRetentionDays,
      errorRetentionDays: settings.errorRetentionDays,
    });
  }

  // Sync file ingestion local state with server settings
  const fileIngestionSettingsRef = useRef(fileIngestionSettings);
  if (fileIngestionSettings && fileIngestionSettings !== fileIngestionSettingsRef.current) {
    fileIngestionSettingsRef.current = fileIngestionSettings;
    setLocalFileIngestionSettings({
      maxConcurrentTailers: fileIngestionSettings.maxConcurrentTailers,
      maxFileAgeDays: fileIngestionSettings.maxFileAgeDays,
      tailerStartDelayMs: fileIngestionSettings.tailerStartDelayMs,
    });
  }

  // Show error state (after all hooks)
  const hasError = settingsError || statsError || fileIngestionError;
  if (hasError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <div className="text-center">
          <p className="font-medium">Failed to load data management settings</p>
          <p className="text-muted-foreground text-sm">
            {(settingsError as Error)?.message || (statsError as Error)?.message || 'Unknown error'}
          </p>
        </div>
        <Button onClick={() => refetchStats()} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  const handleSaveSettings = async () => {
    try {
      await updateMutation.mutateAsync(localSettings);
      toast.success('Settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    }
  };

  const handleRunCleanup = async () => {
    try {
      const result = await runCleanupMutation.mutateAsync();
      toast.success(
        `Cleanup complete: ${result.totalDeleted.toLocaleString()} logs removed in ${result.durationMs}ms`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Cleanup failed');
    }
  };

  const handleSaveFileIngestionSettings = async () => {
    try {
      await updateFileIngestionMutation.mutateAsync(localFileIngestionSettings);
      toast.success('File ingestion settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save');
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      if (deleteDialog.type === 'level' && deleteDialog.serverId && deleteDialog.level) {
        const result = await deleteByLevelMutation.mutateAsync({
          serverId: deleteDialog.serverId,
          levels: [deleteDialog.level],
        });
        toast.success(
          `Deleted ${result.deleted.toLocaleString()} ${deleteDialog.level} logs from ${deleteDialog.serverName}`
        );
      } else if (deleteDialog.type === 'server' && deleteDialog.serverId) {
        const result = await deleteServerLogsMutation.mutateAsync(deleteDialog.serverId);
        toast.success(
          `Deleted ${result.deleted.toLocaleString()} logs from ${deleteDialog.serverName}`
        );
      } else if (deleteDialog.type === 'all') {
        const result = await deleteAllLogsMutation.mutateAsync();
        toast.success(`Deleted ${result.deleted.toLocaleString()} logs from all servers`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    } finally {
      setDeleteDialog({ open: false, type: 'level' });
    }
  };

  const formatCount = (count: number) => {
    if (count < 1000) return count.toString();
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1000000).toFixed(2)}M`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const isLoading = settingsLoading || statsLoading || fileIngestionLoading;

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4">
        <Skeleton className="h-20 shrink-0" />
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
        </div>
      </div>
    );
  }

  const hasUnsavedChanges =
    settings &&
    (localSettings.enabled !== settings.enabled ||
      localSettings.infoRetentionDays !== settings.infoRetentionDays ||
      localSettings.errorRetentionDays !== settings.errorRetentionDays);

  const hasUnsavedFileIngestionChanges =
    fileIngestionSettings &&
    (localFileIngestionSettings.maxConcurrentTailers !==
      fileIngestionSettings.maxConcurrentTailers ||
      localFileIngestionSettings.maxFileAgeDays !== fileIngestionSettings.maxFileAgeDays ||
      localFileIngestionSettings.tailerStartDelayMs !== fileIngestionSettings.tailerStartDelayMs);

  // Calculate age distribution percentages for visualization
  const totalLogs = stats?.logCount || 0;
  const ageData = stats?.ageDistribution || {
    last24h: 0,
    last7d: 0,
    last30d: 0,
    last90d: 0,
    older: 0,
  };
  const getAgePercentage = (count: number) => (totalLogs > 0 ? (count / totalLogs) * 100 : 0);

  return (
    <div className="flex flex-col gap-4 lg:h-full lg:min-h-0">
      {/* Storage Overview Header - Fixed height */}
      <Card className="border-border/50 shrink-0">
        <CardContent className="p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4 lg:gap-6">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => refetchStats()}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase">Total Logs</div>
                  <div className="text-lg font-bold sm:text-xl">
                    {formatCount(stats?.logCount || 0)}
                  </div>
                </div>
              </div>
              <div className="bg-border hidden h-8 w-px sm:block" />
              <div>
                <div className="text-muted-foreground text-[10px] uppercase">Database</div>
                <div className="text-lg font-bold sm:text-xl">
                  {stats?.databaseSizeFormatted || '0 B'}
                </div>
              </div>
              <div className="bg-border hidden h-8 w-px sm:block" />
              <div className="col-span-2 flex justify-between gap-3 text-sm sm:col-span-1 sm:justify-start">
                <div>
                  <div className="text-muted-foreground text-[10px]">Errors</div>
                  <div className="font-semibold text-rose-500">
                    {formatCount(stats?.logCountsByLevel?.error || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Warnings</div>
                  <div className="font-semibold text-amber-500">
                    {formatCount(stats?.logCountsByLevel?.warn || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Info</div>
                  <div className="font-semibold text-blue-500">
                    {formatCount(stats?.logCountsByLevel?.info || 0)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px]">Debug</div>
                  <div className="text-muted-foreground font-semibold">
                    {formatCount(stats?.logCountsByLevel?.debug || 0)}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {stats?.oldestLogTimestamp && (
                <div className="text-muted-foreground text-[10px] sm:text-right">
                  <div>
                    Oldest:{' '}
                    {formatDistanceToNow(new Date(stats.oldestLogTimestamp), { addSuffix: true })}
                  </div>
                  {stats.newestLogTimestamp && (
                    <div>
                      Newest:{' '}
                      {formatDistanceToNow(new Date(stats.newestLogTimestamp), { addSuffix: true })}
                    </div>
                  )}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 text-[10px]"
                onClick={() =>
                  setDeleteDialog({
                    open: true,
                    type: 'all',
                    count: stats?.logCount ?? 0,
                  })
                }
                disabled={(stats?.logCount ?? 0) === 0 || deleteAllLogsMutation.isPending}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Grid - fills remaining space on desktop, stacks on mobile */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
        {/* Left Column: Age Distribution + Storage Breakdown */}
        <div className="flex flex-col gap-4 lg:min-h-0">
          {/* Age Distribution */}
          <Card className="border-border/50 lg:flex-1">
            <CardContent className="flex flex-col p-3 lg:h-full">
              <h3 className="mb-2 flex shrink-0 items-center gap-2 text-xs font-medium">
                <Clock className="h-3.5 w-3.5" />
                Log Age Distribution
              </h3>
              <div className="flex-1 space-y-1.5">
                {[
                  { label: 'Last 24 hours', value: ageData.last24h, color: 'bg-emerald-500' },
                  { label: 'Last 7 days', value: ageData.last7d, color: 'bg-blue-500' },
                  { label: 'Last 30 days', value: ageData.last30d, color: 'bg-amber-500' },
                  { label: 'Last 90 days', value: ageData.last90d, color: 'bg-orange-500' },
                  { label: 'Older', value: ageData.older, color: 'bg-rose-500' },
                ].map((bucket) => (
                  <div key={bucket.label} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{bucket.label}</span>
                      <span className="font-medium">
                        {formatCount(bucket.value)} ({getAgePercentage(bucket.value).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="bg-muted/30 h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn('h-full rounded-full transition-all', bucket.color)}
                        style={{
                          width: `${Math.max(getAgePercentage(bucket.value), bucket.value > 0 ? 1 : 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Table Sizes */}
          <Card className="border-border/50 lg:flex-1">
            <CardContent className="flex flex-col p-3 lg:h-full">
              <h3 className="mb-2 flex shrink-0 items-center gap-2 text-xs font-medium">
                <Database className="h-3.5 w-3.5" />
                Storage Breakdown
              </h3>
              {stats?.tableSizes ? (
                <div className="flex-1 space-y-1.5">
                  {[
                    {
                      label: 'Log Entries',
                      value: stats.tableSizes.logEntries,
                      color: 'bg-blue-500',
                    },
                    { label: 'Issues', value: stats.tableSizes.issues, color: 'bg-rose-500' },
                    { label: 'Sessions', value: stats.tableSizes.sessions, color: 'bg-amber-500' },
                    {
                      label: 'Playback Events',
                      value: stats.tableSizes.playbackEvents,
                      color: 'bg-emerald-500',
                    },
                  ].map((table) => {
                    const percentage =
                      stats.tableSizes!.total > 0
                        ? (table.value / stats.tableSizes!.total) * 100
                        : 0;
                    return (
                      <div key={table.label} className="space-y-0.5">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-muted-foreground">{table.label}</span>
                          <span className="font-medium">{formatBytes(table.value)}</span>
                        </div>
                        <div className="bg-muted/30 h-1.5 overflow-hidden rounded-full">
                          <div
                            className={cn('h-full rounded-full transition-all', table.color)}
                            style={{ width: `${Math.max(percentage, table.value > 0 ? 1 : 0)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="border-border/50 border-t pt-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Total Table Size</span>
                      <span className="font-semibold">{formatBytes(stats.tableSizes.total)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground py-4 text-xs">Loading...</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Middle Column: Server Breakdown */}
        <Card className="border-border/50 flex flex-col lg:min-h-0">
          <CardContent className="flex flex-col p-3 lg:h-full">
            <h3 className="mb-2 flex shrink-0 items-center gap-2 text-xs font-medium">
              <Server className="h-3.5 w-3.5" />
              Storage by Server ({stats?.serverStats?.length || 0})
            </h3>
            <ScrollArea className="flex-1">
              <div className="space-y-1.5 pr-2">
                {stats?.serverStats?.map((server) => {
                  const isExpanded = expandedServer === server.serverId;
                  const serverPercentage = totalLogs > 0 ? (server.logCount / totalLogs) * 100 : 0;

                  return (
                    <div
                      key={server.serverId}
                      className={cn(
                        'rounded-lg border transition-all',
                        isExpanded ? 'border-border bg-muted/20' : 'border-border/50'
                      )}
                    >
                      <button
                        onClick={() => setExpandedServer(isExpanded ? null : server.serverId)}
                        className="flex w-full items-center gap-2 p-2 text-left"
                      >
                        <ProviderIcon providerId={server.serverType as AiProviderType} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{server.serverName}</span>
                            <div className="flex gap-1 text-[10px]">
                              <span className="text-rose-500">
                                {formatCount(server.logCountsByLevel.error)}
                              </span>
                              <span className="text-amber-500">
                                {formatCount(server.logCountsByLevel.warn)}
                              </span>
                              <span className="text-blue-500">
                                {formatCount(server.logCountsByLevel.info)}
                              </span>
                            </div>
                          </div>
                          <div className="text-muted-foreground text-[10px]">
                            {formatCount(server.logCount)} logs · {serverPercentage.toFixed(1)}% ·{' '}
                            {server.estimatedSizeFormatted}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="border-border/50 border-t px-3 pb-3">
                          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                            {/* Log Levels with Delete Buttons */}
                            <div>
                              <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase">
                                <BarChart3 className="h-3 w-3" />
                                Log Levels
                              </div>
                              <div className="space-y-1">
                                {[
                                  {
                                    label: 'Error',
                                    key: 'error',
                                    value: server.logCountsByLevel.error,
                                    color: 'bg-rose-500',
                                    textColor: 'text-rose-500',
                                    icon: XCircle,
                                    iconColor: 'text-rose-500',
                                  },
                                  {
                                    label: 'Warn',
                                    key: 'warn',
                                    value: server.logCountsByLevel.warn,
                                    color: 'bg-amber-500',
                                    textColor: 'text-amber-500',
                                    icon: AlertTriangle,
                                    iconColor: 'text-amber-500',
                                  },
                                  {
                                    label: 'Info',
                                    key: 'info',
                                    value: server.logCountsByLevel.info,
                                    color: 'bg-blue-500',
                                    textColor: 'text-blue-500',
                                    icon: Info,
                                    iconColor: 'text-blue-500',
                                  },
                                  {
                                    label: 'Debug',
                                    key: 'debug',
                                    value: server.logCountsByLevel.debug,
                                    color: 'bg-slate-500',
                                    textColor: 'text-muted-foreground',
                                    icon: Bug,
                                    iconColor: 'text-slate-500',
                                  },
                                ].map((level) => {
                                  const maxLevel = Math.max(
                                    server.logCountsByLevel.error,
                                    server.logCountsByLevel.warn,
                                    server.logCountsByLevel.info,
                                    server.logCountsByLevel.debug,
                                    1
                                  );
                                  const width = (level.value / maxLevel) * 100;
                                  const LevelIcon = level.icon;
                                  return (
                                    <div
                                      key={level.label}
                                      className="group flex items-center gap-1.5"
                                    >
                                      <LevelIcon
                                        className={cn('h-3 w-3 shrink-0', level.iconColor)}
                                      />
                                      <div className="bg-muted/30 relative h-2.5 flex-1 overflow-hidden rounded">
                                        <div
                                          className={cn(
                                            'absolute inset-y-0 left-0 rounded transition-all',
                                            level.color
                                          )}
                                          style={{
                                            width: `${Math.max(width, level.value > 0 ? 2 : 0)}%`,
                                          }}
                                        />
                                      </div>
                                      <span
                                        className={cn(
                                          'w-8 text-right text-[9px] font-medium',
                                          level.textColor
                                        )}
                                      >
                                        {formatCount(level.value)}
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (level.value > 0) {
                                            setDeleteDialog({
                                              open: true,
                                              type: 'level',
                                              serverId: server.serverId,
                                              serverName: server.serverName,
                                              level: level.key,
                                              count: level.value,
                                            });
                                          }
                                        }}
                                        disabled={
                                          level.value === 0 || deleteByLevelMutation.isPending
                                        }
                                        className={cn(
                                          'rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100',
                                          level.value > 0
                                            ? 'hover:bg-destructive/20 text-muted-foreground hover:text-destructive'
                                            : 'text-muted-foreground/30 cursor-not-allowed'
                                        )}
                                        title={
                                          level.value > 0
                                            ? `Delete ${level.label} logs`
                                            : 'No logs to delete'
                                        }
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Delete All Server Logs Button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 mt-2 h-6 w-full text-[9px]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteDialog({
                                    open: true,
                                    type: 'server',
                                    serverId: server.serverId,
                                    serverName: server.serverName,
                                    count: server.logCount,
                                  });
                                }}
                                disabled={
                                  server.logCount === 0 || deleteServerLogsMutation.isPending
                                }
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Delete All ({formatCount(server.logCount)})
                              </Button>
                            </div>

                            {/* Age Distribution - Horizontal Bar Chart (simpler, more readable) */}
                            <div>
                              <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase">
                                <Clock className="h-3 w-3" />
                                Age
                              </div>
                              <div className="space-y-1">
                                {[
                                  {
                                    label: '<24h',
                                    value: server.ageDistribution.last24h,
                                    color: 'bg-emerald-500',
                                  },
                                  {
                                    label: '1-7d',
                                    value: server.ageDistribution.last7d,
                                    color: 'bg-blue-500',
                                  },
                                  {
                                    label: '7-30d',
                                    value: server.ageDistribution.last30d,
                                    color: 'bg-amber-500',
                                  },
                                  {
                                    label: '>30d',
                                    value:
                                      server.ageDistribution.last90d + server.ageDistribution.older,
                                    color: 'bg-rose-500',
                                  },
                                ].map((bucket) => {
                                  const maxAge = Math.max(
                                    server.ageDistribution.last24h,
                                    server.ageDistribution.last7d,
                                    server.ageDistribution.last30d,
                                    server.ageDistribution.last90d + server.ageDistribution.older,
                                    1
                                  );
                                  const width = (bucket.value / maxAge) * 100;
                                  return (
                                    <div key={bucket.label} className="flex items-center gap-1.5">
                                      <span className="text-muted-foreground w-8 shrink-0 text-[9px]">
                                        {bucket.label}
                                      </span>
                                      <div className="bg-muted/30 relative h-2.5 min-w-0 flex-1 overflow-hidden rounded">
                                        <div
                                          className={cn(
                                            'absolute inset-y-0 left-0 rounded transition-all',
                                            bucket.color
                                          )}
                                          style={{
                                            width: `${Math.max(width, bucket.value > 0 ? 2 : 0)}%`,
                                          }}
                                        />
                                      </div>
                                      <span className="w-10 shrink-0 text-right text-[9px] font-medium">
                                        {formatCount(bucket.value)}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Cleanup Status - Simple indicator */}
                            <div>
                              <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase">
                                <Trash2 className="h-3 w-3" />
                                Cleanup
                              </div>
                              {server.eligibleForCleanup.total > 0 ? (
                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="text-muted-foreground">Info/Debug</span>
                                    <span className="font-medium text-amber-500">
                                      {formatCount(
                                        server.eligibleForCleanup.info +
                                          server.eligibleForCleanup.debug
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[9px]">
                                    <span className="text-muted-foreground">Error/Warn</span>
                                    <span className="font-medium text-amber-500">
                                      {formatCount(
                                        server.eligibleForCleanup.warn +
                                          server.eligibleForCleanup.error
                                      )}
                                    </span>
                                  </div>
                                  <div className="border-border/50 flex items-center justify-between border-t pt-1.5 text-[9px]">
                                    <span className="font-medium">Eligible</span>
                                    <span className="font-bold text-rose-500">
                                      {formatCount(server.eligibleForCleanup.total)} (
                                      {Math.round(
                                        (server.eligibleForCleanup.total / server.logCount) * 100
                                      )}
                                      %)
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-2">
                                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
                                  <span className="text-[10px] font-medium text-emerald-500">
                                    All Clean
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right Column: Settings */}
        <div className="flex flex-col gap-4 lg:min-h-0">
          {/* Combined Settings Card */}
          <Card className="border-border/50 lg:flex-1">
            <CardContent className="flex flex-col gap-4 p-3 lg:h-full">
              {/* Retention Policy Section */}
              <div className="flex-1">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-xs font-medium">
                    <HardDrive className="h-3.5 w-3.5" />
                    Retention Policy
                  </h3>
                  <div className="flex items-center gap-2">
                    {hasUnsavedChanges && (
                      <Button
                        size="sm"
                        className="h-5 px-2 text-[10px]"
                        onClick={handleSaveSettings}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-2.5 w-2.5" />
                        )}
                        Save
                      </Button>
                    )}
                    <Switch
                      checked={localSettings.enabled}
                      onCheckedChange={(checked) =>
                        setLocalSettings((prev) => ({ ...prev, enabled: checked }))
                      }
                    />
                  </div>
                </div>
                <div
                  className={cn(
                    'space-y-2',
                    !localSettings.enabled && 'pointer-events-none opacity-50'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Label className="w-24 shrink-0 text-[10px]">Info/Debug</Label>
                    <Slider
                      value={[localSettings.infoRetentionDays]}
                      onValueChange={([value]) =>
                        setLocalSettings((prev) => ({ ...prev, infoRetentionDays: value }))
                      }
                      min={7}
                      max={365}
                      step={1}
                      disabled={!localSettings.enabled}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={7}
                      max={365}
                      value={localSettings.infoRetentionDays}
                      onChange={(e) => {
                        const value = Math.max(7, Math.min(365, parseInt(e.target.value) || 7));
                        setLocalSettings((prev) => ({ ...prev, infoRetentionDays: value }));
                      }}
                      disabled={!localSettings.enabled}
                      className="h-5 w-14 text-center text-[10px]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-24 shrink-0 text-[10px]">Error/Warn</Label>
                    <Slider
                      value={[localSettings.errorRetentionDays]}
                      onValueChange={([value]) =>
                        setLocalSettings((prev) => ({ ...prev, errorRetentionDays: value }))
                      }
                      min={14}
                      max={365}
                      step={1}
                      disabled={!localSettings.enabled}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={14}
                      max={365}
                      value={localSettings.errorRetentionDays}
                      onChange={(e) => {
                        const value = Math.max(14, Math.min(365, parseInt(e.target.value) || 14));
                        setLocalSettings((prev) => ({ ...prev, errorRetentionDays: value }));
                      }}
                      disabled={!localSettings.enabled}
                      className="h-5 w-14 text-center text-[10px]"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-border/50 border-t" />

              {/* File Ingestion Section */}
              <div className="flex-1">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-xs font-medium">
                    <FileText className="h-3.5 w-3.5" />
                    File Ingestion
                  </h3>
                  {hasUnsavedFileIngestionChanges && (
                    <Button
                      size="sm"
                      className="h-5 px-2 text-[10px]"
                      onClick={handleSaveFileIngestionSettings}
                      disabled={updateFileIngestionMutation.isPending}
                    >
                      {updateFileIngestionMutation.isPending ? (
                        <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-2.5 w-2.5" />
                      )}
                      Save
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <Label className="w-24 shrink-0 text-[10px]">Concurrent</Label>
                    <Slider
                      value={[localFileIngestionSettings.maxConcurrentTailers]}
                      onValueChange={([value]) =>
                        setLocalFileIngestionSettings((prev) => ({
                          ...prev,
                          maxConcurrentTailers: value,
                        }))
                      }
                      min={1}
                      max={20}
                      step={1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={localFileIngestionSettings.maxConcurrentTailers}
                      onChange={(e) => {
                        const value = Math.max(1, Math.min(20, parseInt(e.target.value) || 1));
                        setLocalFileIngestionSettings((prev) => ({
                          ...prev,
                          maxConcurrentTailers: value,
                        }));
                      }}
                      className="h-5 w-14 text-center text-[10px]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-24 shrink-0 text-[10px]">Max Age</Label>
                    <Slider
                      value={[localFileIngestionSettings.maxFileAgeDays]}
                      onValueChange={([value]) =>
                        setLocalFileIngestionSettings((prev) => ({
                          ...prev,
                          maxFileAgeDays: value,
                        }))
                      }
                      min={1}
                      max={365}
                      step={1}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={localFileIngestionSettings.maxFileAgeDays}
                      onChange={(e) => {
                        const value = Math.max(1, Math.min(365, parseInt(e.target.value) || 1));
                        setLocalFileIngestionSettings((prev) => ({
                          ...prev,
                          maxFileAgeDays: value,
                        }));
                      }}
                      className="h-5 w-14 text-center text-[10px]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-24 shrink-0 text-[10px]">Start Delay</Label>
                    <Slider
                      value={[localFileIngestionSettings.tailerStartDelayMs]}
                      onValueChange={([value]) =>
                        setLocalFileIngestionSettings((prev) => ({
                          ...prev,
                          tailerStartDelayMs: value,
                        }))
                      }
                      min={0}
                      max={5000}
                      step={100}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={5000}
                      step={100}
                      value={localFileIngestionSettings.tailerStartDelayMs}
                      onChange={(e) => {
                        const value = Math.max(0, Math.min(5000, parseInt(e.target.value) || 0));
                        setLocalFileIngestionSettings((prev) => ({
                          ...prev,
                          tailerStartDelayMs: value,
                        }));
                      }}
                      className="h-5 w-[4.5rem] text-center text-[10px]"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cleanup Row - Manual + History side by side */}
          <div className="grid shrink-0 grid-cols-2 gap-4">
            {/* Manual Cleanup */}
            <Card className="border-border/50">
              <CardContent className="p-3">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-medium">
                  <Trash2 className="h-3.5 w-3.5" />
                  Manual Cleanup
                </h3>
                {previewLoading ? (
                  <Skeleton className="h-10" />
                ) : preview && preview.totalLogsToDelete > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Eligible:</span>
                      <span className="font-medium">
                        {formatCount(preview.totalLogsToDelete)} (~
                        {preview.estimatedSpaceSavingsFormatted})
                      </span>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleRunCleanup}
                      disabled={runCleanupMutation.isPending}
                      variant="destructive"
                      className="h-6 w-full text-[10px]"
                    >
                      {runCleanupMutation.isPending ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <PlayCircle className="mr-1 h-3 w-3" />
                      )}
                      Run Now
                    </Button>
                  </div>
                ) : (
                  <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    Nothing to clean up
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Cleanup History */}
            <Card className="border-border/50">
              <CardContent className="p-3">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-medium">
                  <Clock className="h-3.5 w-3.5" />
                  Recent Runs
                </h3>
                {historyLoading ? (
                  <Skeleton className="h-10" />
                ) : !history || history.length === 0 ? (
                  <div className="text-muted-foreground text-[10px]">No cleanup runs yet</div>
                ) : (
                  <div className="space-y-0.5">
                    {history.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1">
                          {item.status === 'completed' ? (
                            <CheckCircle className="h-2.5 w-2.5 text-emerald-500" />
                          ) : item.status === 'running' ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-500" />
                          ) : (
                            <AlertCircle className="h-2.5 w-2.5 text-red-500" />
                          )}
                          <span className="text-muted-foreground">
                            {formatDistanceToNow(new Date(item.startedAt), { addSuffix: true })}
                          </span>
                        </div>
                        <span className="text-muted-foreground">
                          {item.status === 'completed'
                            ? `${formatCount(item.totalDeleted)}`
                            : item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              {deleteDialog.type === 'all'
                ? 'Delete All Logs'
                : deleteDialog.type === 'server'
                  ? `Delete All Logs from ${deleteDialog.serverName}`
                  : `Delete ${deleteDialog.level?.charAt(0).toUpperCase()}${deleteDialog.level?.slice(1)} Logs`}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                {deleteDialog.type === 'all' ? (
                  <>
                    This will permanently delete <strong>all logs</strong> from all servers.
                  </>
                ) : deleteDialog.type === 'server' ? (
                  <>
                    This will permanently delete{' '}
                    <strong>{formatCount(deleteDialog.count ?? 0)} logs</strong> from{' '}
                    <strong>{deleteDialog.serverName}</strong>.
                  </>
                ) : (
                  <>
                    This will permanently delete{' '}
                    <strong>
                      {formatCount(deleteDialog.count ?? 0)} {deleteDialog.level}
                    </strong>{' '}
                    logs from <strong>{deleteDialog.serverName}</strong>.
                  </>
                )}
              </p>
              <p className="text-destructive font-medium">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                deleteByLevelMutation.isPending ||
                deleteServerLogsMutation.isPending ||
                deleteAllLogsMutation.isPending
              }
            >
              {(deleteByLevelMutation.isPending ||
                deleteServerLogsMutation.isPending ||
                deleteAllLogsMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
