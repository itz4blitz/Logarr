"use client";

import { useState, useMemo, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
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
  CheckCircle,
  Eye,
  Clock,
  Server,
  Hash,
  User,
  Tv,
  Activity,
} from "lucide-react";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";

import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useLogs, useServers, useLogDetails } from "@/hooks/use-api";
import { useLogSocket } from "@/hooks/use-log-socket";
import type { LogEntry, Server as ServerType, LogEntryDetails } from "@/lib/api";
import { getActivityTypeInfo } from "@/lib/activity-types";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
const LOG_SOURCE_TYPES = ["api", "file"] as const;
const ROW_HEIGHT = 40;
const PAGINATION_HEIGHT = 48;

// Short time format for compact display
function formatShortTime(date: Date): string {
  const now = new Date();
  const diffMins = differenceInMinutes(now, date);
  const diffHours = differenceInHours(now, date);
  const diffDays = differenceInDays(now, date);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return format(date, "MMM d");
}

// Level color utilities
const levelColors: Record<string, string> = {
  error: "bg-red-500",
  warn: "bg-yellow-500",
  info: "bg-blue-500",
  debug: "bg-gray-500",
};

const levelBgColors: Record<string, string> = {
  error: "bg-red-500/10 text-red-500 border-red-500/30",
  warn: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  info: "bg-blue-500/10 text-blue-500 border-blue-500/30",
  debug: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};

// Severity badge for related issues
function SeverityBadge({ severity }: { severity: string }) {
  const severityConfig: Record<string, { color: string; icon: React.ReactNode }> = {
    critical: { color: "bg-red-500/10 text-red-500 border-red-500/30", icon: <AlertCircle className="h-3 w-3" /> },
    high: { color: "bg-orange-500/10 text-orange-500 border-orange-500/30", icon: <AlertTriangle className="h-3 w-3" /> },
    medium: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", icon: <AlertTriangle className="h-3 w-3" /> },
    low: { color: "bg-blue-500/10 text-blue-500 border-blue-500/30", icon: <AlertCircle className="h-3 w-3" /> },
    info: { color: "bg-gray-500/10 text-gray-400 border-gray-500/30", icon: <AlertCircle className="h-3 w-3" /> },
  };

  const config = severityConfig[severity] || severityConfig.info;

  return (
    <Badge variant="outline" className={cn("text-xs gap-1", config.color)}>
      {config.icon}
      {severity}
    </Badge>
  );
}

// Status badge for related issues
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; icon: React.ReactNode }> = {
    open: { color: "bg-red-500/10 text-red-500 border-red-500/30", icon: <AlertCircle className="h-3 w-3" /> },
    acknowledged: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", icon: <Eye className="h-3 w-3" /> },
    in_progress: { color: "bg-blue-500/10 text-blue-500 border-blue-500/30", icon: <Activity className="h-3 w-3" /> },
    resolved: { color: "bg-green-500/10 text-green-500 border-green-500/30", icon: <CheckCircle className="h-3 w-3" /> },
    ignored: { color: "bg-gray-500/10 text-gray-400 border-gray-500/30", icon: <X className="h-3 w-3" /> },
  };

  const config = statusConfig[status] || statusConfig.open;

  return (
    <Badge variant="outline" className={cn("text-xs gap-1", config.color)}>
      {config.icon}
      {status.replace("_", " ")}
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
  const { data: log, isLoading } = useLogDetails(logId || "");

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  // Build external link based on provider
  // *arr apps: /system/events shows searchable event log (more useful than raw files)
  const getExternalLink = (log: LogEntryDetails) => {
    if (!log.serverUrl || !log.serverProviderId) return null;

    const baseUrl = log.serverUrl.replace(/\/$/, "");

    switch (log.serverProviderId) {
      case "jellyfin":
        // Jellyfin dashboard - activity log
        return `${baseUrl}/web/index.html#!/dashboard/activity`;
      case "radarr":
      case "sonarr":
      case "prowlarr":
        // *arr apps: system/events shows searchable event log
        return `${baseUrl}/system/events`;
      default:
        return null;
    }
  };

  // Get provider display name
  const getProviderName = (providerId: string | null) => {
    if (!providerId) return "Source";
    return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  };

  // Get level-based gradient for header
  const getLevelGradient = (level: string) => {
    switch (level.toLowerCase()) {
      case "error": return "from-red-500/20 via-red-500/5 to-transparent";
      case "warn": return "from-amber-500/20 via-amber-500/5 to-transparent";
      case "info": return "from-blue-500/20 via-blue-500/5 to-transparent";
      case "debug": return "from-zinc-500/20 via-zinc-500/5 to-transparent";
      default: return "from-zinc-500/20 via-zinc-500/5 to-transparent";
    }
  };

  if (!logId) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-w-[95vw] w-full max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden border-white/10 bg-linear-to-b from-background to-background/95">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <DialogTitle className="sr-only">Loading Log</DialogTitle>
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading log details...</p>
          </div>
        ) : log ? (
          <>
            {/* Header with level-based gradient */}
            <div className={cn("relative overflow-hidden", `bg-linear-to-b ${getLevelGradient(log.level)}`)}>
              {/* Subtle pattern overlay */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute inset-0" style={{
                  backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
                  backgroundSize: '20px 20px'
                }} />
              </div>
              <DialogHeader className="relative p-6 pb-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative">
                    <ProviderIcon providerId={log.serverProviderId || "unknown"} size="lg" />
                    {/* Level indicator dot */}
                    <div className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
                      log.level === "error" && "bg-red-500",
                      log.level === "warn" && "bg-amber-500",
                      log.level === "info" && "bg-blue-500",
                      log.level === "debug" && "bg-zinc-500",
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={cn("text-xs font-medium", levelBgColors[log.level] || levelBgColors.info)}>
                        {log.level.toUpperCase()}
                      </Badge>
                      {log.source && (
                        <Badge variant="outline" className="text-xs bg-white/5 border-white/10">
                          {log.source}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {log.serverName || "Unknown Server"} &bull; {format(new Date(log.timestamp), "PPpp")}
                    </p>
                  </div>
                </div>
                <DialogTitle className="text-base font-semibold leading-relaxed pr-8">
                  {log.message}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Log entry details from {log.serverName}
                </DialogDescription>
              </DialogHeader>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-6 space-y-5">
                {/* Related Issue - Spotify green accent */}
                {log.relatedIssue && (
                  <Link
                    href={`/issues?id=${log.relatedIssue.id}`}
                    className="block rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 hover:bg-emerald-500/10 transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                          <AlertTriangle className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{log.relatedIssue.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <SeverityBadge severity={log.relatedIssue.severity} />
                            <span className="text-xs text-muted-foreground">
                              {log.relatedIssue.occurrenceCount} occurrences
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-emerald-500 transition-colors shrink-0" />
                    </div>
                  </Link>
                )}

                {/* Context info - compact pills */}
                <div className="flex flex-wrap gap-2">
                  {log.userId && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-mono">{log.userId}</span>
                    </div>
                  )}
                  {log.sessionId && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                      <Tv className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-mono">{log.sessionId}</span>
                    </div>
                  )}
                  {log.deviceId && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                      <Tv className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-mono">{log.deviceId}</span>
                    </div>
                  )}
                  {log.itemId && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-mono">{log.itemId}</span>
                    </div>
                  )}
                  {log.threadId && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-mono">Thread: {log.threadId}</span>
                    </div>
                  )}
                </div>

                {/* Exception - show prominently if present */}
                {(log.exception || log.stackTrace) && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-red-500/10">
                      <span className="text-xs font-medium text-red-400">Exception</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => copyToClipboard(log.stackTrace || log.exception || "", "exception")}
                      >
                        {copied === "exception" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <pre className="p-4 text-xs font-mono text-red-300/90 overflow-x-auto whitespace-pre-wrap max-h-40">
                      {log.exception || log.stackTrace}
                    </pre>
                  </div>
                )}

                {/* Raw log - collapsible */}
                <details className="group">
                  <summary className="flex items-center justify-between cursor-pointer list-none">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Raw Log</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          copyToClipboard(log.raw, "raw");
                        }}
                      >
                        {copied === "raw" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                    </div>
                  </summary>
                  <pre className="mt-3 p-4 rounded-lg bg-zinc-900/50 border border-white/5 text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                    {log.raw}
                  </pre>
                </details>

                {/* Metadata - collapsible, only if present */}
                {log.metadata && Object.keys(log.metadata).length > 0 && (
                  <details className="group">
                    <summary className="flex items-center justify-between cursor-pointer list-none">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Metadata</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={(e) => {
                            e.preventDefault();
                            copyToClipboard(JSON.stringify(log.metadata, null, 2), "metadata");
                          }}
                        >
                          {copied === "metadata" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
                      </div>
                    </summary>
                    <pre className="mt-3 p-4 rounded-lg bg-zinc-900/50 border border-white/5 text-xs font-mono text-zinc-400 overflow-x-auto max-h-48">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </ScrollArea>

            {/* Footer with external link */}
            {getExternalLink(log) && (
              <div className="p-4 border-t border-white/10 bg-muted/20">
                <a
                  href={getExternalLink(log) || ""}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  View activity in {getProviderName(log.serverProviderId)}
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="p-12 flex flex-col items-center justify-center gap-3">
            <DialogTitle className="sr-only">Log Not Found</DialogTitle>
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Log entry not found</p>
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
      className="flex items-center gap-2 px-3 cursor-pointer border-b last:border-b-0 hover:bg-muted/50 transition-colors group"
      style={{ height: ROW_HEIGHT }}
      onClick={onClick}
    >
      {/* Level indicator as colored left border accent */}
      <div className={cn(
        "w-0.5 h-6 rounded-full shrink-0 -ml-1",
        levelColors[log.level] || levelColors.info
      )} />

      {/* Provider Icon - smaller */}
      <ProviderIcon providerId={server?.providerId || "unknown"} size="sm" className="shrink-0" />

      {/* Activity Type - compact badge style */}
      <span className={cn(
        "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 bg-muted/50 truncate max-w-[100px]",
        activityInfo.color
      )}>
        {activityInfo.label}
      </span>

      {/* Message - takes remaining space with better truncation */}
      <p className="text-xs text-foreground truncate flex-1 min-w-0" title={itemName || log.message}>
        {itemName || log.message}
      </p>

      {/* User (if any) - more compact */}
      {userName && (
        <span className="text-[10px] text-muted-foreground shrink-0 hidden xl:block max-w-[80px] truncate">
          {userName}
        </span>
      )}

      {/* Timestamp - slightly narrower */}
      <span className="text-[10px] text-muted-foreground shrink-0 w-14 text-right tabular-nums">
        {formatShortTime(new Date(log.timestamp))}
      </span>

      {/* View icon - only on hover */}
      <Eye className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function LogsPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize state from URL params
  const initialLevel = searchParams.get("level");
  const initialLive = searchParams.get("live");
  const initialSource = searchParams.get("source");

  const [serverId, setServerId] = useState<string>("all");
  const [selectedLevels, setSelectedLevels] = useState<string[]>(
    initialLevel ? [initialLevel] : []
  );
  const [selectedSources, setSelectedSources] = useState<string[]>(
    initialSource ? [initialSource] : []
  );
  const [selectedLogSources, setSelectedLogSources] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [liveMode, setLiveMode] = useState(initialLive !== "false");
  const [page, setPage] = useState(0);
  const [initialized, setInitialized] = useState(false);

  // Clear URL params after reading them (one-time)
  useEffect(() => {
    if (!initialized && (initialLevel || initialLive || initialSource)) {
      router.replace("/logs", { scroll: false });
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
  const actualServerId = serverId === "all" ? undefined : serverId;

  const { data: servers } = useServers();

  // Create a map of server ID to server object for quick lookup
  const serverMap = useMemo(() => {
    return servers?.reduce((acc, server) => {
      acc[server.id] = server;
      return acc;
    }, {} as Record<string, ServerType>) || {};
  }, [servers]);

  // Fetch logs with pagination
  const { data: logsResult, isLoading, refetch } = useLogs({
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

  const {
    connected,
    logs: liveLogs,
  } = useLogSocket({
    enabled: liveMode,
    serverId: actualServerId,
    levels: selectedLevels.length > 0 ? selectedLevels : undefined,
    logSources: selectedLogSources.length > 0 ? selectedLogSources as ('api' | 'file')[] : undefined,
  });

  // Combine live logs with historical logs
  const allLogs = useMemo(() => {
    if (liveMode && liveLogs.length > 0) {
      // Filter live logs by search if needed
      const filteredLive = searchQuery
        ? liveLogs.filter((log) =>
            log.message.toLowerCase().includes(searchQuery.toLowerCase())
          )
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
      prev.includes(level)
        ? prev.filter((l) => l !== level)
        : [...prev, level]
    );
  };

  const toggleLogSource = (source: string) => {
    setSelectedLogSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source]
    );
  };

  const clearFilters = () => {
    setServerId("all");
    setSelectedLevels([]);
    setSelectedSources([]);
    setSelectedLogSources([]);
    setSearchQuery("");
    setPage(0);
  };

  const hasFilters = serverId !== "all" || selectedLevels.length > 0 || selectedSources.length > 0 || selectedLogSources.length > 0 || searchQuery;

  return (
    <div className="flex flex-col h-full gap-2 min-h-0">
      {/* Filter bar */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Server filter */}
        <Select value={serverId} onValueChange={setServerId}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="All Servers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Servers</SelectItem>
            {servers?.map((server) => (
              <SelectItem key={server.id} value={server.id}>
                {server.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Level filter buttons */}
        <div className="flex items-center border rounded-md overflow-hidden">
          {LOG_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors capitalize border-r last:border-r-0",
                selectedLevels.includes(level)
                  ? levelBgColors[level]
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Log source type filter (API vs File) */}
        <div className="flex items-center border rounded-md overflow-hidden">
          {LOG_SOURCE_TYPES.map((source) => (
            <button
              key={source}
              onClick={() => toggleLogSource(source)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors capitalize border-r last:border-r-0",
                selectedLogSources.includes(source)
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              {source === "api" ? "API" : "File"}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[150px] max-w-[250px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>

        {/* Active source filter */}
        {selectedSources.length > 0 && (
          <Badge variant="secondary" className="h-6 px-2 text-xs gap-1">
            {selectedSources[0]}
            <button onClick={() => setSelectedSources([])} className="ml-1 hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}

        {/* Clear filters */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs">
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Live mode */}
        <div className="flex items-center gap-2">
          {liveMode && (
            <Badge
              variant={connected ? "default" : "secondary"}
              className={cn(
                "text-xs",
                connected && "bg-green-500/10 text-green-500 border-green-500/20"
              )}
            >
              {connected ? (
                <><Wifi className="h-3 w-3 mr-1" />Live</>
              ) : (
                <><WifiOff className="h-3 w-3 mr-1" />Offline</>
              )}
            </Badge>
          )}
          <Button
            variant={liveMode ? "default" : "outline"}
            size="sm"
            onClick={() => setLiveMode(!liveMode)}
            className="h-8 text-xs"
          >
            {liveMode ? "Pause" : "Live"}
          </Button>
          {!liveMode && (
            <Button variant="outline" size="sm" onClick={() => refetch()} className="h-8 w-8 p-0">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden rounded-lg border bg-card">
        {isLoading && !liveMode ? (
          <div className="p-4 space-y-2">
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
                className="flex items-center justify-between border-t px-4 bg-muted/30 shrink-0"
                style={{ height: PAGINATION_HEIGHT }}
              >
                {liveMode ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      Showing latest <span className="font-medium">{allLogs.length}</span> entries
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Pause live mode to browse history
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-sm text-muted-foreground">
                      <span className="font-medium">{page * pageSize + 1}</span>
                      <span>-</span>
                      <span className="font-medium">{Math.min((page + 1) * pageSize, totalLogs)}</span>
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
            <div className="flex items-center justify-center flex-1">
              <div className="text-center">
                <ScrollText className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-semibold">No activity found</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-sm">
                  {hasFilters
                    ? "Try adjusting your filters to see more activity"
                    : "Connect a server and wait for activity data to appear"}
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
        <div className="flex items-center justify-center h-full">
          <ScrollText className="h-8 w-8 animate-pulse text-zinc-600" />
        </div>
      }
    >
      <LogsPageContent />
    </Suspense>
  );
}
