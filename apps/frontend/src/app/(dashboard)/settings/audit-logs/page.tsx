'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import {
  Search,
  Download,
  X,
  BarChart3,
  Activity,
  Users,
  AlertTriangle,
  Loader2,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { useAuditLogs, useAuditStatistics } from '@/hooks/use-api';
import type { AuditLogAction, AuditLogCategory, AuditLogEntry } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { onAuditLog, disconnectFromAuditWebSocket } from '@/lib/websocket';

const actionLabels: Record<AuditLogAction, string> = {
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  read: 'Read',
  login: 'Login',
  logout: 'Logout',
  error: 'Error',
  export: 'Export',
  import: 'Import',
  sync: 'Sync',
  test: 'Test',
  other: 'Other',
};

const categoryLabels: Record<AuditLogCategory, string> = {
  auth: 'Auth',
  server: 'Server',
  log_entry: 'Logs',
  session: 'Session',
  playback: 'Playback',
  issue: 'Issues',
  ai_analysis: 'AI Analysis',
  api_key: 'API Keys',
  settings: 'Settings',
  retention: 'Retention',
  proxy: 'Proxy',
  other: 'Other',
};

export default function AuditLogsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [successFilter, setSuccessFilter] = useState<string>('all');
  const [isConnected, setIsConnected] = useState(false);
  const [realtimeLogs, setRealtimeLogs] = useState<AuditLogEntry[]>([]);

  const queryClient = useQueryClient();

  // Fetch audit logs
  const { data: auditLogs, isLoading } = useAuditLogs({
    limit: 500,
  });

  // Fetch statistics
  const { data: stats } = useAuditStatistics(30);

  // Combine fetched logs with real-time logs
  const combinedLogs = useMemo(() => {
    if (!auditLogs) return realtimeLogs;
    // Merge logs, avoiding duplicates by ID
    const logMap = new Map<string, AuditLogEntry>();
    // Add real-time logs first (newer)
    realtimeLogs.forEach((log) => logMap.set(log.id, log));
    // Add fetched logs
    auditLogs.forEach((log) => {
      if (!logMap.has(log.id)) {
        logMap.set(log.id, log);
      }
    });
    // Convert back to array and sort by timestamp descending
    return Array.from(logMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [auditLogs, realtimeLogs]);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    const cleanup = onAuditLog((log: unknown) => {
      const auditLog = log as AuditLogEntry;
      console.log('Real-time audit log received:', auditLog);

      // Add to real-time logs if not already present
      setRealtimeLogs((prev) => {
        if (prev.some((l) => l.id === auditLog.id)) {
          return prev;
        }
        // Keep only last 100 real-time logs to prevent memory issues
        const updated = [auditLog, ...prev].slice(0, 100);
        return updated;
      });

      // Also update statistics periodically
      queryClient.invalidateQueries({ queryKey: ['auditStatistics'] });
    });

    // Monitor connection status
    const checkConnection = setInterval(() => {
      const socket = (window as unknown as { __auditSocket?: { connected: boolean } })
        .__auditSocket;
      setIsConnected(socket?.connected ?? false);
    }, 1000);

    return () => {
      cleanup();
      clearInterval(checkConnection);
      disconnectFromAuditWebSocket();
    };
  }, [queryClient]);

  // Filter logs based on search and filter criteria
  const filteredLogs = useMemo(() => {
    if (!combinedLogs) return [];

    return combinedLogs.filter((log) => {
      // Search filter
      const matchesSearch =
        searchTerm === '' ||
        log.endpoint.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entityType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ipAddress?.includes(searchTerm) ||
        log.userId?.includes(searchTerm);

      // Action filter
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;

      // Category filter
      const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter;

      // Status filter
      const matchesSuccess =
        successFilter === 'all' ||
        (successFilter === 'success' && log.success) ||
        (successFilter === 'error' && !log.success);

      return matchesSearch && matchesAction && matchesCategory && matchesSuccess;
    });
  }, [combinedLogs, searchTerm, actionFilter, categoryFilter, successFilter]);

  // Export to CSV
  const exportToCSV = () => {
    if (!filteredLogs || filteredLogs.length === 0) return;

    const headers = [
      'Timestamp',
      'User ID',
      'Action',
      'Category',
      'Entity Type',
      'Entity ID',
      'Description',
      'Endpoint',
      'Method',
      'Status Code',
      'Success',
      'Response Time (ms)',
      'IP Address',
      'Error Message',
    ];
    const csvRows = [
      headers.join(','),
      ...filteredLogs.map((log) =>
        [
          new Date(log.timestamp).toISOString(),
          log.userId || '',
          log.action,
          log.category,
          log.entityType,
          log.entityId || '',
          log.description.replace(/,/g, ';'),
          log.endpoint,
          log.method,
          log.statusCode,
          log.success,
          log.responseTime,
          log.ipAddress || '',
          log.errorMessage?.replace(/,/g, ';') || '',
        ].join(',')
      ),
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters =
    searchTerm !== '' ||
    actionFilter !== 'all' ||
    categoryFilter !== 'all' ||
    successFilter !== 'all';
  const filteredCount = filteredLogs.length;
  const totalCount = combinedLogs?.length || 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">
      {/* Header with connection status */}
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Audit Logs</h1>
        <div className="flex items-center gap-2 text-xs">
          {isConnected ? (
            <>
              <Wifi className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground">Connecting...</span>
            </>
          )}
        </div>
      </div>

      {/* Statistics Cards - Fixed height */}
      {stats && (
        <div className="grid shrink-0 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Activity className="text-muted-foreground h-4 w-4" />
              <span className="text-xs font-medium">Total Logs</span>
            </div>
            <div className="mt-1 text-xl font-bold">{stats.totalLogs.toLocaleString()}</div>
            <div className="text-muted-foreground text-[10px]">Last 30 days</div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-500" />
              <span className="text-xs font-medium">Success Rate</span>
            </div>
            <div className="mt-1 text-xl font-bold">
              {stats.totalLogs > 0
                ? ((stats.successCount / stats.totalLogs) * 100).toFixed(1)
                : '0'}
              %
            </div>
            <div className="text-muted-foreground text-[10px]">
              {stats.successCount.toLocaleString()} successful
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium">Errors</span>
            </div>
            <div className="mt-1 text-xl font-bold">{stats.errorCount.toLocaleString()}</div>
            <div className="text-muted-foreground text-[10px]">
              {stats.totalLogs > 0 ? ((stats.errorCount / stats.totalLogs) * 100).toFixed(1) : '0'}%
              error rate
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium">Active Users</span>
            </div>
            <div className="mt-1 text-xl font-bold">{stats.byUser.length}</div>
            <div className="text-muted-foreground text-[10px]">
              Top: {stats.byUser[0]?.userId || 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Filters - Fixed */}
      <div className="shrink-0 space-y-3 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold">Filters</h3>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('');
                  setActionFilter('all');
                  setCategoryFilter('all');
                  setSuccessFilter('all');
                }}
                className="h-6 text-[10px]"
              >
                <X className="mr-1 h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[10px]">
              Showing {filteredCount} of {totalCount} logs
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={!filteredLogs || filteredLogs.length === 0}
              className="h-7 text-xs"
            >
              <Download className="mr-1 h-3 w-3" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-sm min-w-[180px] flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search endpoint, entity, description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border-input bg-background focus:ring-ring h-8 w-full rounded-md border pr-3 pl-8 text-xs outline-none focus:ring-1"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border-input bg-background focus:ring-ring h-8 rounded-md border px-3 text-xs outline-none focus:ring-1"
          >
            <option value="all">All Actions</option>
            <option value="read">Read</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="error">Error</option>
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border-input bg-background focus:ring-ring h-8 rounded-md border px-3 text-xs outline-none focus:ring-1"
          >
            <option value="all">All Categories</option>
            <option value="auth">Auth</option>
            <option value="server">Server</option>
            <option value="log_entry">Logs</option>
            <option value="session">Session</option>
            <option value="issue">Issues</option>
            <option value="ai_analysis">AI Analysis</option>
            <option value="api_key">API Keys</option>
            <option value="settings">Settings</option>
            <option value="proxy">Proxy</option>
            <option value="other">Other</option>
          </select>

          <select
            value={successFilter}
            onChange={(e) => setSuccessFilter(e.target.value)}
            className="border-input bg-background focus:ring-ring h-8 rounded-md border px-3 text-xs outline-none focus:ring-1"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>

      {/* Table - Scrollable */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        ) : !auditLogs || auditLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>No audit logs available yet.</AlertDescription>
            </Alert>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>No logs match your current filters.</AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader className="bg-background sticky top-0">
                <TableRow>
                  <TableHead className="w-[160px] py-2 text-xs">Timestamp</TableHead>
                  <TableHead className="w-[90px] py-2 text-xs">Action</TableHead>
                  <TableHead className="w-[90px] py-2 text-xs">Category</TableHead>
                  <TableHead className="py-2 text-xs">Description</TableHead>
                  <TableHead className="w-[130px] py-2 text-xs">Endpoint</TableHead>
                  <TableHead className="w-[70px] py-2 text-xs">Method</TableHead>
                  <TableHead className="w-[70px] py-2 text-xs">Status</TableHead>
                  <TableHead className="w-[90px] py-2 text-xs">Response</TableHead>
                  <TableHead className="w-[110px] py-2 text-xs">User</TableHead>
                  <TableHead className="w-[130px] py-2 text-xs">IP</TableHead>
                  <TableHead className="w-[70px] py-2 text-xs">✓</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted/50">
                    <TableCell className="py-2 font-mono text-[10px]">
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant={
                          log.action === 'create'
                            ? 'default'
                            : log.action === 'delete'
                              ? 'destructive'
                              : log.action === 'update'
                                ? 'secondary'
                                : 'outline'
                        }
                        className="text-[10px]"
                      >
                        {actionLabels[log.action]}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge variant="outline" className="text-[10px]">
                        {categoryLabels[log.category]}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="max-w-[250px] truncate py-2 text-[10px]"
                      title={log.description}
                    >
                      {log.description}
                    </TableCell>
                    <TableCell
                      className="max-w-[130px] truncate py-2 font-mono text-[10px]"
                      title={log.endpoint}
                    >
                      {log.endpoint}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant={
                          log.method === 'GET'
                            ? 'secondary'
                            : log.method === 'POST'
                              ? 'default'
                              : log.method === 'DELETE'
                                ? 'destructive'
                                : 'outline'
                        }
                        className="text-[10px]"
                      >
                        {log.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant={log.success ? 'default' : 'destructive'}
                        className="text-[10px]"
                      >
                        {log.statusCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-[10px]">{log.responseTime}ms</TableCell>
                    <TableCell
                      className="max-w-[110px] truncate py-2 font-mono text-[10px]"
                      title={log.userId || undefined}
                    >
                      {log.userId || '-'}
                    </TableCell>
                    <TableCell className="py-2 font-mono text-[10px]">
                      {log.ipAddress || '-'}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant={log.success ? 'default' : 'destructive'}
                        className="text-[10px]"
                      >
                        {log.success ? '✓' : '✗'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
