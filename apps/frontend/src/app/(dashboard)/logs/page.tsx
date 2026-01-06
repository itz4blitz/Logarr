'use client';

import { format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import {
  Search,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ScrollText,
  ExternalLink,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Eye,
  Hash,
  User,
  Tv,
  Server,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useMemo, useRef, useEffect, Suspense } from 'react';

import type { LogEntry, Server as ServerType, LogEntryDetails } from '@/lib/api';

import { ProviderIcon } from '@/components/provider-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLogs, useServers, useLogDetails } from '@/hooks/use-api';
import { useLogSocket } from '@/hooks/use-log-socket';
import { getActivityTypeInfo } from '@/lib/activity-types';
import { cn } from '@/lib/utils';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const LOG_SOURCE_TYPES = ['api', 'file'] as const;
const ROW_HEIGHT = 40;
const PAGINATION_HEIGHT = 48;

// Short time format for compact display
function formatShortTime(date: Date): string {
  const now = new Date();
  const diffMins = differenceInMinutes(now, date);
  const diffHours = differenceInHours(now, date);
  const diffDays = differenceInDays(now, date);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return format(date, 'MMM d');
}

// Level color utilities
const levelColors: Record<string, string> = {
  error: 'bg-red-500',
  warn: 'bg-yellow-500',
  info: 'bg-blue-500',
  debug: 'bg-gray-500',
};

const levelBgColors: Record<string, string> = {
  error: 'bg-red-500/10 text-red-500 border-red-500/30',
  warn: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  info: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  debug: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

// Severity badge for related issues
function SeverityBadge({ severity }: { severity: string }) {
  const severityConfig: Record<string, { color: string; icon: React.ReactNode }> = {
    critical: {
      color: 'bg-red-500/10 text-red-500 border-red-500/30',
      icon: <AlertCircle className="h-3 w-3" />,
    },
    high: {
      color: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    medium: {
      color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    low: {
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
      icon: <AlertCircle className="h-3 w-3" />,
    },
    info: {
      color: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };

  const config = severityConfig[severity] || severityConfig.info;

  return (
    <Badge variant="outline" className={cn('gap-1 text-xs', config.color)}>
      {config.icon}
      {severity}
    </Badge>
  );
}

// Log Detail Modal
function LogDetailModal({
  logId,
  open,
  onClose,
}: {
  logId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const { data: log, isLoading } = useLogDetails(logId || '');

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  // Build external link based on provider
  // *arr apps: /system/events shows searchable event log (more useful than raw files)
  const getExternalLink = (log: LogEntryDetails) => {
    if (!log.serverUrl || !log.serverProviderId) return null;

    const baseUrl = log.serverUrl.replace(/\/$/, '');

    switch (log.serverProviderId) {
      case 'jellyfin':
        // Jellyfin dashboard - activity log
        return `${baseUrl}/web/index.html#!/dashboard/activity`;
      case 'radarr':
      case 'sonarr':
      case 'prowlarr':
        // *arr apps: system/events shows searchable event log
        return `${baseUrl}/system/events`;
      default:
        return null;
    }
  };

  // Get provider display name
  const getProviderName = (providerId: string | null) => {
    if (!providerId) return 'Source';
    return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  };

  // Get level-based gradient for header
  const getLevelGradient = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'from-red-500/20 via-red-500/5 to-transparent';
      case 'warn':
        return 'from-amber-500/20 via-amber-500/5 to-transparent';
      case 'info':
        return 'from-blue-500/20 via-blue-500/5 to-transparent';
      case 'debug':
        return 'from-zinc-500/20 via-zinc-500/5 to-transparent';
      default:
        return 'from-zinc-500/20 via-zinc-500/5 to-transparent';
    }
  };

  if (!logId) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-background flex max-h-[85vh] w-full max-w-[95vw] flex-col gap-0 overflow-hidden rounded-xl border border-white/20 p-0 shadow-2xl ring-1 ring-white/10 sm:max-w-3xl">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12">
            <DialogTitle className="sr-only">Loading Log</DialogTitle>
            <Loader2 className="text-primary h-10 w-10 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading log details...</p>
          </div>
        ) : log ? (
          <>
            {/* Header with level-based gradient */}
            <div
              className={cn(
                'relative overflow-hidden border-b border-white/10',
                `bg-linear-to-b ${getLevelGradient(log.level)}`
              )}
            >
              {/* Subtle pattern overlay */}
              <div className="absolute inset-0 opacity-5">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
                    backgroundSize: '20px 20px',
                  }}
                />
              </div>
              <DialogHeader className="relative p-4 pb-4 sm:p-6">
                <div className="mb-3 flex items-center gap-3">
                  <div className="relative">
                    <ProviderIcon providerId={log.serverProviderId || 'unknown'} size="lg" />
                    {/* Level indicator dot */}
                    <div
                      className={cn(
                        'border-background absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2',
                        log.level === 'error' && 'bg-red-500',
                        log.level === 'warn' && 'bg-amber-500',
                        log.level === 'info' && 'bg-blue-500',
                        log.level === 'debug' && 'bg-zinc-500'
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs font-medium',
                          levelBgColors[log.level] || levelBgColors.info
                        )}
                      >
                        {log.level.toUpperCase()}
                      </Badge>
                      {log.source && (
                        <Badge variant="outline" className="border-white/10 bg-white/5 text-xs">
                          {log.source}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {log.serverName || 'Unknown Server'} &bull;{' '}
                      {format(new Date(log.timestamp), 'PPpp')}
                    </p>
                  </div>
                </div>
                <DialogTitle className="pr-8 text-base leading-relaxed font-semibold">
                  {log.message}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Log entry details from {log.serverName}
                </DialogDescription>
              </DialogHeader>
            </div>

            {/* Content */}
            <ScrollArea className="min-h-0 flex-1" alwaysShowScrollbar>
              <div className="space-y-5 p-4 sm:p-6">
                {/* Related Issue - Spotify green accent */}
                {log.relatedIssue && (
                  <Link
                    href={`/issues?id=${log.relatedIssue.id}`}
                    className="group block rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 transition-colors hover:bg-emerald-500/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
                          <AlertTriangle className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-sm font-medium">
                            {log.relatedIssue.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <SeverityBadge severity={log.relatedIssue.severity} />
                            <span className="text-muted-foreground text-xs">
                              {log.relatedIssue.occurrenceCount} occurrences
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0 transition-colors group-hover:text-emerald-500" />
                    </div>
                  </Link>
                )}

                {/* Context info - compact pills */}
                <div className="flex flex-wrap gap-2">
                  {log.userId && (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      <User className="text-muted-foreground h-3 w-3" />
                      <span className="font-mono text-xs">{log.userId}</span>
                    </div>
                  )}
                  {log.sessionId && (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      <Tv className="text-muted-foreground h-3 w-3" />
                      <span className="font-mono text-xs">{log.sessionId}</span>
                    </div>
                  )}
                  {log.deviceId && (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      <Tv className="text-muted-foreground h-3 w-3" />
                      <span className="font-mono text-xs">{log.deviceId}</span>
                    </div>
                  )}
                  {log.itemId && (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      <Hash className="text-muted-foreground h-3 w-3" />
                      <span className="font-mono text-xs">{log.itemId}</span>
                    </div>
                  )}
                  {log.threadId && (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      <Hash className="text-muted-foreground h-3 w-3" />
                      <span className="font-mono text-xs">Thread: {log.threadId}</span>
                    </div>
                  )}
                </div>

                {/* Exception - show prominently if present */}
                {(log.exception || log.stackTrace) && (
                  <div className="overflow-hidden rounded-lg border border-red-500/20 bg-red-500/5">
                    <div className="flex items-center justify-between border-b border-red-500/10 px-4 py-2">
                      <span className="text-xs font-medium text-red-400">Exception</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-foreground h-6 px-2 text-xs"
                        onClick={() =>
                          copyToClipboard(log.stackTrace || log.exception || '', 'exception')
                        }
                      >
                        {copied === 'exception' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                    <pre className="max-h-40 overflow-x-auto p-4 font-mono text-xs whitespace-pre-wrap text-red-300/90">
                      {log.exception || log.stackTrace}
                    </pre>
                  </div>
                )}

                {/* Raw log - collapsible */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between">
                    <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Raw Log
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          copyToClipboard(log.raw, 'raw');
                        }}
                      >
                        {copied === 'raw' ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                      <ChevronRight className="text-muted-foreground h-4 w-4 transition-transform group-open:rotate-90" />
                    </div>
                  </summary>
                  <pre className="mt-3 max-h-48 overflow-x-auto rounded-lg border border-white/5 bg-zinc-900/50 p-4 font-mono text-xs break-all whitespace-pre-wrap text-zinc-400">
                    {log.raw}
                  </pre>
                </details>

                {/* Metadata - collapsible, only if present */}
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between">
                      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        Metadata
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            copyToClipboard(JSON.stringify(log.metadata, null, 2), 'metadata');
                          }}
                        >
                          {copied === 'metadata' ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                        <ChevronRight className="text-muted-foreground h-4 w-4 transition-transform group-open:rotate-90" />
                      </div>
                    </summary>
                    <pre className="mt-3 max-h-48 overflow-x-auto rounded-lg border border-white/5 bg-zinc-900/50 p-4 font-mono text-xs text-zinc-400">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </ScrollArea>

            {/* Footer with external link */}
            {getExternalLink(log) && (
              <div className="bg-muted/20 border-t border-white/10 p-4">
                <a
                  href={getExternalLink(log) || ''}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary flex items-center justify-center gap-2 text-sm transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  View activity in {getProviderName(log.serverProviderId)}
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-12">
            <DialogTitle className="sr-only">Log Not Found</DialogTitle>
            <AlertCircle className="text-muted-foreground h-10 w-10" />
            <p className="text-muted-foreground text-sm">Log entry not found</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Activity Row - now opens modal on click
function ActivityRow({
  log,
  onClick,
  server,
}: {
  log: LogEntry;
  onClick: () => void;
  server?: ServerType;
}) {
  const activityInfo = getActivityTypeInfo(log.source);
  const metadata = log.metadata as Record<string, unknown> | null;
  const userName = metadata?.userName as string | undefined;
  const itemName = metadata?.itemName as string | undefined;

  return (
    <div
      className="hover:bg-muted/50 group flex cursor-pointer items-center gap-1.5 border-b px-2 transition-colors last:border-b-0 sm:gap-2 sm:px-3"
      style={{ height: ROW_HEIGHT }}
      onClick={onClick}
    >
      {/* Level indicator as colored left border accent */}
      <div
        className={cn(
          '-ml-1 h-6 w-0.5 shrink-0 rounded-full',
          levelColors[log.level] || levelColors.info
        )}
      />

      {/* Provider Icon - always visible */}
      <ProviderIcon providerId={server?.providerId || 'unknown'} size="sm" className="shrink-0" />

      {/* Activity Type - compact badge style */}
      <span
        className={cn(
          'bg-muted/50 hidden max-w-[100px] shrink-0 truncate rounded px-1.5 py-0.5 text-[10px] font-medium sm:block',
          activityInfo.color
        )}
      >
        {activityInfo.label}
      </span>

      {/* Message - takes remaining space with better truncation */}
      <p
        className="text-foreground min-w-0 flex-1 truncate text-xs"
        title={itemName || log.message}
      >
        {itemName || log.message}
      </p>

      {/* User (if any) - more compact */}
      {userName && (
        <span className="text-muted-foreground hidden max-w-[80px] shrink-0 truncate text-[10px] xl:block">
          {userName}
        </span>
      )}

      {/* Timestamp - slightly narrower */}
      <span className="text-muted-foreground w-12 shrink-0 text-right text-[10px] tabular-nums sm:w-14">
        {formatShortTime(new Date(log.timestamp))}
      </span>

      {/* View icon - only on hover */}
      <Eye className="text-muted-foreground hidden h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
    </div>
  );
}

function LogsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize state from URL params
  const initialLevel = searchParams.get('level');
  const initialLive = searchParams.get('live');
  const initialSource = searchParams.get('source');

  const [serverId, setServerId] = useState<string>('all');
  const [selectedLevels, setSelectedLevels] = useState<string[]>(
    initialLevel ? [initialLevel] : []
  );
  const [selectedSources, setSelectedSources] = useState<string[]>(
    initialSource ? [initialSource] : []
  );
  const [selectedLogSources, setSelectedLogSources] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(initialLive !== 'false');
  const [page, setPage] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Clear URL params after reading them (one-time)
  useEffect(() => {
    if (!initialized && (initialLevel || initialLive || initialSource)) {
      router.replace('/logs', { scroll: false });
      setInitialized(true);
    }
  }, [initialized, initialLevel, initialLive, initialSource, router]);

  // Container measurement for fit-to-viewport
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(10);

  // Measure container and calculate page size
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const height = containerRef.current.offsetHeight;
        const availableHeight = height - PAGINATION_HEIGHT;
        const count = Math.max(5, Math.floor(availableHeight / ROW_HEIGHT));
        setPageSize(count);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Convert "all" to undefined for API calls
  const actualServerId = serverId === 'all' ? undefined : serverId;

  const { data: servers } = useServers();

  // Create a map of server ID to server object for quick lookup
  const serverMap = useMemo(() => {
    return (
      servers?.reduce(
        (acc, server) => {
          acc[server.id] = server;
          return acc;
        },
        {} as Record<string, ServerType>
      ) || {}
    );
  }, [servers]);

  // Fetch logs with pagination
  const {
    data: logsResult,
    isLoading,
    refetch,
  } = useLogs({
    serverId: actualServerId,
    levels: selectedLevels.length > 0 ? selectedLevels : undefined,
    sources: selectedSources.length > 0 ? selectedSources : undefined,
    logSources: selectedLogSources.length > 0 ? selectedLogSources : undefined,
    search: searchQuery || undefined,
    limit: pageSize,
    offset: page * pageSize,
  });

  // Extract pagination info
  const displayLogs = logsResult?.data || [];
  const totalLogs = logsResult?.total || 0;
  const totalPages = Math.max(1, Math.ceil(totalLogs / pageSize));
  const hasMore = page < totalPages - 1;

  const { connected, logs: liveLogs } = useLogSocket({
    enabled: liveMode,
    serverId: actualServerId,
    levels: selectedLevels.length > 0 ? selectedLevels : undefined,
    logSources:
      selectedLogSources.length > 0 ? (selectedLogSources as ('api' | 'file')[]) : undefined,
  });

  // Combine live logs with historical logs
  const allLogs = useMemo(() => {
    if (liveMode && liveLogs.length > 0) {
      // Filter live logs by search if needed
      const filteredLive = searchQuery
        ? liveLogs.filter((log) => log.message.toLowerCase().includes(searchQuery.toLowerCase()))
        : liveLogs;

      // Merge with historical, avoiding duplicates
      const liveIds = new Set(filteredLive.map((l) => l.id));
      const uniqueHistorical = displayLogs.filter((l) => !liveIds.has(l.id));
      return [...filteredLive, ...uniqueHistorical].slice(0, pageSize);
    }
    return displayLogs;
  }, [liveMode, liveLogs, displayLogs, searchQuery, pageSize]);

  const toggleLevel = (level: string) => {
    setSelectedLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const toggleLogSource = (source: string) => {
    setSelectedLogSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    );
  };

  const clearFilters = () => {
    setServerId('all');
    setSelectedLevels([]);
    setSelectedSources([]);
    setSelectedLogSources([]);
    setSearchQuery('');
    setPage(0);
  };

  const hasFilters =
    serverId !== 'all' ||
    selectedLevels.length > 0 ||
    selectedSources.length > 0 ||
    selectedLogSources.length > 0 ||
    searchQuery;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Filter bar - responsive */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {/* Top row on mobile: Server filter + Live controls */}
        <div className="flex items-center gap-2 sm:contents">
          {/* Server filter */}
          <Select value={serverId} onValueChange={setServerId}>
            <SelectTrigger className="h-8 flex-1 text-xs sm:w-[160px] sm:flex-none">
              <SelectValue placeholder="All Servers">
                {serverId === 'all' ? (
                  <span className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-zinc-400" />
                    All Servers
                  </span>
                ) : (
                  (() => {
                    const selectedServer = servers?.find((s) => s.id === serverId);
                    return selectedServer ? (
                      <span className="flex items-center gap-2">
                        <ProviderIcon providerId={selectedServer.providerId} size="sm" />
                        {selectedServer.name}
                      </span>
                    ) : null;
                  })()
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="py-2">
                <span className="flex items-center gap-2">
                  <Server className="h-3.5 w-3.5 text-zinc-400" />
                  All Servers
                </span>
              </SelectItem>
              {servers?.map((server) => (
                <SelectItem
                  key={server.id}
                  value={server.id}
                  className="py-2"
                >
                  <span className="flex items-center gap-2">
                    <ProviderIcon providerId={server.providerId} size="sm" />
                    <span className="flex-1">{server.name}</span>
                    {server.isConnected ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Live mode - mobile: show on first row */}
          <div className="flex items-center gap-2 sm:order-last sm:ml-auto">
            {liveMode && (
              <Badge
                variant={connected ? 'default' : 'secondary'}
                className={cn(
                  'text-xs',
                  connected && 'border-green-500/20 bg-green-500/10 text-green-500'
                )}
              >
                {connected ? (
                  <>
                    <Wifi className="mr-1 h-3 w-3" />
                    <span className="hidden sm:inline">Live</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="mr-1 h-3 w-3" />
                    <span className="hidden sm:inline">Offline</span>
                  </>
                )}
              </Badge>
            )}
            <Button
              variant={liveMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLiveMode(!liveMode)}
              className="h-8 text-xs"
            >
              {liveMode ? 'Pause' : 'Live'}
            </Button>
            {!liveMode && (
              <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Second row on mobile: Filters */}
        <div className="flex flex-wrap items-center gap-2 sm:contents">
          {/* Level filter buttons */}
          <div className="flex items-center overflow-hidden rounded-md border">
            {LOG_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={cn(
                  'border-r px-2 py-1.5 text-xs font-medium capitalize transition-colors last:border-r-0 sm:px-3',
                  selectedLevels.includes(level)
                    ? levelBgColors[level]
                    : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Log source type filter (API vs File) */}
          <div className="flex items-center overflow-hidden rounded-md border">
            {LOG_SOURCE_TYPES.map((source) => (
              <button
                key={source}
                onClick={() => toggleLogSource(source)}
                className={cn(
                  'border-r px-2 py-1.5 text-xs font-medium capitalize transition-colors last:border-r-0 sm:px-3',
                  selectedLogSources.includes(source)
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                {source === 'api' ? 'API' : 'File'}
              </button>
            ))}
          </div>

          {/* Active source filter */}
          {selectedSources.length > 0 && (
            <Badge variant="secondary" className="h-6 gap-1 px-2 text-xs">
              {selectedSources[0]}
              <button onClick={() => setSelectedSources([])} className="hover:text-foreground ml-1">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {/* Clear filters */}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs">
              <X className="h-3 w-3 sm:mr-1" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          )}
        </div>

        {/* Third row on mobile: Search */}
        <div className="relative w-full sm:max-w-[250px] sm:min-w-[150px] sm:flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div
        ref={containerRef}
        className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border"
      >
        {isLoading && !liveMode ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: pageSize }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : allLogs.length > 0 ? (
          <>
            <div className="flex-1 overflow-hidden">
              {allLogs.map((log) => (
                <ActivityRow
                  key={log.id}
                  log={log}
                  onClick={() => setSelectedLogId(log.id)}
                  server={serverMap[log.serverId]}
                />
              ))}
            </div>
            {/* Pagination bar - always shown for consistent height */}
            <div
              className="bg-muted/30 flex shrink-0 items-center justify-between border-t px-4"
              style={{ height: PAGINATION_HEIGHT }}
            >
              {liveMode ? (
                <>
                  <div className="text-muted-foreground text-sm">
                    Showing latest <span className="font-medium">{allLogs.length}</span> entries
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Pause live mode to browse history
                  </div>
                </>
              ) : (
                <>
                  <div className="text-muted-foreground text-sm">
                    <span className="font-medium">{page * pageSize + 1}</span>
                    <span>-</span>
                    <span className="font-medium">
                      {Math.min((page + 1) * pageSize, totalLogs)}
                    </span>
                    <span className="hidden sm:inline"> of </span>
                    <span className="sm:hidden">/</span>
                    <span className="font-medium">{totalLogs}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage(0)}
                      disabled={page === 0}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-1 px-2 text-sm">
                      <span className="font-medium">{page + 1}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-muted-foreground">{totalPages}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!hasMore}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage(totalPages - 1)}
                      disabled={!hasMore}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <ScrollText className="text-muted-foreground mx-auto h-12 w-12" />
              <h3 className="mt-4 text-lg font-semibold">No activity found</h3>
              <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                {hasFilters
                  ? 'Try adjusting your filters to see more activity'
                  : 'Connect a server and wait for activity data to appear'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Log Detail Modal */}
      <LogDetailModal
        logId={selectedLogId}
        open={selectedLogId !== null}
        onClose={() => setSelectedLogId(null)}
      />
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <ScrollText className="h-8 w-8 animate-pulse text-zinc-600" />
        </div>
      }
    >
      <LogsPageContent />
    </Suspense>
  );
}
