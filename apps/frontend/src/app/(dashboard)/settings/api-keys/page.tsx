'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  Plus,
  Key,
  Check,
  Loader2,
  Copy,
  AlertCircle,
  Trash2,
  Search,
  Download,
  X,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

import type { ApiKeyInfo, CreateApiKeyDto, UpdateApiKeyDto } from '@/lib/api';

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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useApiKeys,
  useCreateApiKey,
  useUpdateApiKey,
  useDeleteApiKey,
  useApiKeyAuditLogs,
} from '@/hooks/use-api';

function ApiKeysGrid({
  apiKeys,
  isLoading,
  onEdit,
  onDelete,
  onViewAudit,
}: {
  apiKeys: ApiKeyInfo[] | undefined;
  isLoading: boolean;
  onEdit: (apiKey: ApiKeyInfo) => void;
  onDelete: (apiKey: ApiKeyInfo) => void;
  onViewAudit: (keyId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Skeleton className="h-4 w-4 shrink-0" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <Skeleton className="h-4 w-14 shrink-0" />
              </div>
              <Skeleton className="mt-1 h-3 w-48" />
            </CardHeader>
            <CardContent className="space-y-2 pb-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 pt-0">
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-8 flex-1" />
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (!apiKeys || apiKeys.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Key className="text-muted-foreground/50 h-12 w-12" />
          <p className="text-muted-foreground mt-4">No API keys found</p>
          <p className="text-muted-foreground text-sm">
            Add API keys for allowing authenticated remote access
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {apiKeys.map((apiKey) => (
        <Card key={apiKey.id}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Key className="text-muted-foreground h-4 w-4 shrink-0" />
                <CardTitle className="truncate text-base">{apiKey.name}</CardTitle>
              </div>
              <Badge
                variant={apiKey.isEnabled ? 'default' : 'secondary'}
                className="shrink-0 text-xs"
              >
                {apiKey.isEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <CardDescription className="mt-1 flex items-center gap-2 text-xs">
              <span className="font-mono text-xs">{apiKey.id}</span>
              {apiKey.lastUsedIp && (
                <>
                  <span>•</span>
                  <span className="truncate">{apiKey.lastUsedIp}</span>
                </>
              )}
            </CardDescription>
          </CardHeader>
            <CardContent className="space-y-2 pb-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Requests</span>
                  <span className="font-medium">{apiKey.requestCount.toLocaleString()}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-muted-foreground">Rate Limit</span>
                  <span className="font-medium">
                    {apiKey.rateLimit
                      ? `${apiKey.rateLimit}/${apiKey.rateLimitTtl ? `${apiKey.rateLimitTtl / 1000}s` : 'ttl'}`
                      : 'Unlimited'}
                  </span>
                </div>
                {apiKey.lastUsedAt && (
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Last Used</span>
                    <span className="font-medium" suppressHydrationWarning>
                      {formatDistanceToNow(new Date(apiKey.lastUsedAt), { addSuffix: true })}
                    </span>
                  </div>
                )}
                {apiKey.expiresAt && (
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">Expires</span>
                    <span className="font-medium" suppressHydrationWarning>
                      {formatDistanceToNow(new Date(apiKey.expiresAt), { addSuffix: true })}
                    </span>
                  </div>
                )}
              </div>
              {apiKey.notes && (
                <p className="text-muted-foreground line-clamp-2 border-t pt-2 text-xs">
                  {apiKey.notes}
                </p>
              )}
            </CardContent>
          <CardFooter className="flex gap-2 pt-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 text-xs"
              onClick={() => onEdit(apiKey)}
            >
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 flex-1 text-xs"
              onClick={() => onViewAudit(apiKey.id)}
            >
              Audit Log
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 text-xs"
              onClick={() => onDelete(apiKey)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function CreateEditDialog({
  apiKey,
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  apiKey: ApiKeyInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateApiKeyDto | UpdateApiKeyDto) => void;
  isSubmitting: boolean;
}) {
  const [formData, setFormData] = useState({
    name: apiKey?.name || '',
    notes: apiKey?.notes || '',
    rateLimit: apiKey?.rateLimit?.toString() || '0',
    rateLimitTtl: apiKey?.rateLimitTtl?.toString() || '60000',
    expiresAt: apiKey?.expiresAt ? new Date(apiKey.expiresAt).toISOString().split('T')[0] : '',
  });

  // Sync form data when apiKey changes
  useEffect(() => {
    setFormData({
      name: apiKey?.name || '',
      notes: apiKey?.notes || '',
      rateLimit: apiKey?.rateLimit?.toString() || '0',
      rateLimitTtl: apiKey?.rateLimitTtl?.toString() || '60000',
      expiresAt: apiKey?.expiresAt ? new Date(apiKey.expiresAt).toISOString().split('T')[0] : '',
    });
  }, [apiKey]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const rateLimitNum = parseInt(formData.rateLimit, 10);
    const rateLimitTtlNum = parseInt(formData.rateLimitTtl, 10);

    if (apiKey) {
      // UpdateApiKeyDto - type cannot be changed
      const data: UpdateApiKeyDto = {
        name: formData.name,
        notes: formData.notes || undefined,
        rateLimit: isNaN(rateLimitNum) || rateLimitNum === 0 ? undefined : rateLimitNum,
        rateLimitTtl: isNaN(rateLimitTtlNum) || rateLimitTtlNum === 0 ? undefined : rateLimitTtlNum,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined,
      };
      onSubmit(data);
    } else {
      const data: CreateApiKeyDto = {
        name: formData.name,
        notes: formData.notes || undefined,
        rateLimit: isNaN(rateLimitNum) || rateLimitNum === 0 ? undefined : rateLimitNum,
        rateLimitTtl: isNaN(rateLimitTtlNum) || rateLimitTtlNum === 0 ? undefined : rateLimitTtlNum,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt) : undefined,
      };
      onSubmit(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{apiKey ? 'Edit API Key' : 'Create API Key'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My ArrCaptain App"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rateLimit">Rate Limit (0 = unlimited)</Label>
              <Input
                id="rateLimit"
                type="number"
                min="0"
                value={formData.rateLimit}
                onChange={(e) => setFormData({ ...formData, rateLimit: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">Max requests per time window</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rateLimitTtl">Time Window (milliseconds)</Label>
              <Input
                id="rateLimitTtl"
                type="number"
                min="0"
                value={formData.rateLimitTtl}
                onChange={(e) => setFormData({ ...formData, rateLimitTtl: e.target.value })}
              />
              <p className="text-muted-foreground text-xs">
                {parseInt(formData.rateLimitTtl, 10) / 1000}s window (60000 = 1 minute)
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expires At</Label>
            <Input
              id="expiresAt"
              type="date"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Personal phone, test environment, etc."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {apiKey ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewKeyDialog({
  open,
  onOpenChange,
  apiKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: { key: string; apiKey: ApiKeyInfo } | null;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    toast.success('API key copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!apiKey) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API Key Created</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              Please save this API key now. You won&apos;t be able to see it again!
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <Input value={apiKey.key} readOnly className="font-mono text-sm" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium">{apiKey.apiKey.name}</p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ApiKeysPage() {
  const { data: apiKeys, isLoading, isFetching } = useApiKeys();
  const createApiKey = useCreateApiKey();
  const updateApiKey = useUpdateApiKey();
  const deleteApiKeyMutation = useDeleteApiKey();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newKeyDialogOpen, setNewKeyDialogOpen] = useState(false);
  const [auditDialogOpen, setAuditDialogOpen] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKeyInfo | null>(null);
  const [selectedAuditKeyId, setSelectedAuditKeyId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<{ key: string; apiKey: ApiKeyInfo } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleCreate = async (data: CreateApiKeyDto) => {
    try {
      const result = await createApiKey.mutateAsync(data);
      setNewKey(result);
      setCreateDialogOpen(false);
      setNewKeyDialogOpen(true);
      toast.success('API key created successfully');
    } catch {
      toast.error('Failed to create API key');
    }
  };

  const handleEdit = async (data: UpdateApiKeyDto) => {
    if (!selectedApiKey) return;
    try {
      await updateApiKey.mutateAsync({ id: selectedApiKey.id, data });
      setEditDialogOpen(false);
      setSelectedApiKey(null);
      toast.success('API key updated successfully');
    } catch {
      toast.error('Failed to update API key');
    }
  };

  const handleDelete = async () => {
    if (!selectedApiKey) return;
    try {
      await deleteApiKeyMutation.mutateAsync(selectedApiKey.id);
      setDeleteConfirmOpen(false);
      setSelectedApiKey(null);
      toast.success('API key deleted successfully');
    } catch {
      toast.error('Failed to delete API key');
    }
  };

  const handleSubmit = async (data: CreateApiKeyDto | UpdateApiKeyDto) => {
    if (selectedApiKey) {
      await handleEdit(data as UpdateApiKeyDto);
    } else {
      await handleCreate(data as CreateApiKeyDto);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New API Key
        </Button>
      </div>

      <ApiKeysGrid
        apiKeys={apiKeys}
        isLoading={isLoading || isFetching}
        onEdit={(apiKey) => {
          setSelectedApiKey(apiKey);
          setEditDialogOpen(true);
        }}
        onDelete={(apiKey) => {
          setSelectedApiKey(apiKey);
          setDeleteConfirmOpen(true);
        }}
        onViewAudit={(keyId) => {
          setSelectedAuditKeyId(keyId);
          setAuditDialogOpen(true);
        }}
      />

      <CreateEditDialog
        apiKey={selectedApiKey}
        open={createDialogOpen || editDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateDialogOpen(false);
            setEditDialogOpen(false);
            setSelectedApiKey(null);
          }
        }}
        onSubmit={handleSubmit}
        isSubmitting={createApiKey.isPending || updateApiKey.isPending}
      />

      <NewKeyDialog open={newKeyDialogOpen} onOpenChange={setNewKeyDialogOpen} apiKey={newKey} />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{selectedApiKey?.name}&quot;? This action cannot
              be undone. Any applications using this key will no longer be able to access the API.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700 focus:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AuditLogDialog
        open={auditDialogOpen}
        onOpenChange={setAuditDialogOpen}
        keyId={selectedAuditKeyId}
      />
    </div>
  );
}

function AuditLogDialog({
  open,
  onOpenChange,
  keyId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: string | null;
}) {
  const { data: auditLogs, isLoading } = useApiKeyAuditLogs(keyId);

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Reset filters when dialog opens/closes or key changes
  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setMethodFilter('all');
      setStatusFilter('all');
    }
  }, [open, keyId]);

  // Filter logs based on search and filter criteria
  const filteredLogs = useMemo(() => {
    if (!auditLogs) return [];

    return auditLogs.filter((log) => {
      // Search filter
      const matchesSearch =
        searchTerm === '' ||
        log.endpoint.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.ipAddress?.includes(searchTerm);

      // Method filter
      const matchesMethod = methodFilter === 'all' || log.method === methodFilter;

      // Status filter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'success' && log.success) ||
        (statusFilter === 'error' && !log.success);

      return matchesSearch && matchesMethod && matchesStatus;
    });
  }, [auditLogs, searchTerm, methodFilter, statusFilter]);

  // Get unique methods and statuses for filters
  const uniqueMethods = useMemo(() => {
    if (!auditLogs) return [];
    return Array.from(new Set(auditLogs.map((log) => log.method))).sort();
  }, [auditLogs]);

  // Export to CSV
  const exportToCSV = () => {
    if (!filteredLogs || filteredLogs.length === 0) return;

    const headers = [
      'Timestamp',
      'Endpoint',
      'Method',
      'Status Code',
      'Success',
      'Response Time (ms)',
      'IP Address',
      'User Agent',
      'Error Message',
    ];
    const csvRows = [
      headers.join(','),
      ...filteredLogs.map((log) =>
        [
          new Date(log.timestamp).toISOString(),
          log.endpoint,
          log.method,
          log.statusCode,
          log.success,
          log.responseTime,
          log.ipAddress || '',
          log.userAgent?.replace(/,/g, ';') || '',
          log.errorMessage?.replace(/,/g, ';') || '',
        ].join(',')
      ),
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `api-key-audit-${keyId}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters = searchTerm !== '' || methodFilter !== 'all' || statusFilter !== 'all';
  const filteredCount = filteredLogs.length;
  const totalCount = auditLogs?.length || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] w-[95vw] !max-w-none max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="space-y-4 border-b px-6 py-4 pr-16">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-lg font-semibold">Audit Log</DialogTitle>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setMethodFilter('all');
                    setStatusFilter('all');
                  }}
                  className="h-8 text-xs"
                >
                  <X className="mr-1 h-3 w-3" />
                  Clear Filters
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={!filteredLogs || filteredLogs.length === 0}
                className="h-8"
              >
                <Download className="mr-2 h-3 w-3" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative max-w-md flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by endpoint or IP address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-md border pr-3 pl-9 text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </div>

            {/* Method Filter */}
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="all">All Methods</option>
              {uniqueMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success Only</option>
              <option value="error">Errors Only</option>
            </select>
          </div>

          {/* Results count */}
          {hasActiveFilters && (
            <p className="text-muted-foreground text-xs">
              Showing {filteredCount} of {totalCount} logs
            </p>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {!keyId ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground text-sm">No API key selected</p>
            </div>
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : !auditLogs || auditLogs.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Alert className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No audit logs found for this API key. Logs will appear here once the key is used
                  to make API requests.
                </AlertDescription>
              </Alert>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Alert className="max-w-md">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No logs match your current filters. Try adjusting your search or filter criteria.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-background sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="w-[100px]">Method</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[120px]">Response Time</TableHead>
                  <TableHead className="w-[140px]">IP Address</TableHead>
                  <TableHead className="w-[100px]">Success</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                    <TableCell>
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
                        className="text-xs"
                      >
                        {log.method}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.success ? 'default' : 'destructive'} className="text-xs">
                        {log.statusCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{log.responseTime}ms</TableCell>
                    <TableCell className="font-mono text-xs">{log.ipAddress || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={log.success ? 'default' : 'destructive'} className="text-xs">
                        {log.success ? '✓' : '✗'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Footer */}
        <div className="bg-background flex items-center justify-between border-t px-6 py-4">
          <p className="text-muted-foreground text-xs">
            {auditLogs?.length || 0} total logs
            {hasActiveFilters && ` (${filteredCount} shown)`}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-8">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
