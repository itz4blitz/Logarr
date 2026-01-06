'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  RefreshCw,
  Loader2,
  ExternalLink,
  Server,
  Plus,
  Bug,
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { toast } from 'sonner';

import type { Server as ServerType, ConnectionStatus as ConnectionStatusType } from '@/lib/api';

import { AddSourceModal } from '@/components/add-source-modal';
import { ConnectionStatus } from '@/components/connection-status';
import { SourceDiagnosticsDialog } from '@/components/source-diagnostics-dialog';
import {
  ConnectionTestToastContent,
  getToastType,
  getToastTitle,
} from '@/components/connection-test-toast';
import { EditServerDialog } from '@/components/edit-server-dialog';
import { IntegrationIcon } from '@/components/integration-icon';
import { TablePagination } from '@/components/table-pagination';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useServers,
  useDeleteServer,
  useTestConnection,
  useTestAllConnections,
} from '@/hooks/use-api';
import { useFitToViewport, useFitToViewportPagination } from '@/hooks/use-fit-to-viewport';
import { getIntegrationById, integrationCategories } from '@/lib/integrations';

// Fixed heights for layout calculations
const ROW_HEIGHT = 64; // Height of each table row
const HEADER_HEIGHT = 40; // Height of the table header
const CARD_HEADER_HEIGHT = 76; // Height of CardHeader
const PAGINATION_HEIGHT = 48;

function ServersPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: servers, isLoading } = useServers();
  const deleteServer = useDeleteServer();
  const testConnection = useTestConnection();
  const testAllConnections = useTestAllConnections();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<ServerType | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [serverToEdit, setServerToEdit] = useState<ServerType | null>(null);
  const [testingServerId, setTestingServerId] = useState<string | null>(null);
  const [hasTestedOnLoad, setHasTestedOnLoad] = useState(false);
  const [diagnosticsDialogOpen, setDiagnosticsDialogOpen] = useState(false);
  const [diagnosticsServer, setDiagnosticsServer] = useState<ServerType | null>(null);
  const [diagnosticsResult, setDiagnosticsResult] = useState<ConnectionStatusType | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);

  // Auto-test all connections when servers are first loaded
  useEffect(() => {
    if (servers && servers.length > 0 && !hasTestedOnLoad && !testAllConnections.isPending) {
      setHasTestedOnLoad(true);
      testAllConnections.mutate();
    }
  }, [servers, hasTestedOnLoad, testAllConnections]);

  // Handle edit param from URL (e.g., /sources?edit=server-id)
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && servers && !editDialogOpen) {
      const server = servers.find((s) => s.id === editId);
      if (server) {
        setServerToEdit(server);
        setEditDialogOpen(true);
        // Clear the URL param
        router.replace('/sources', { scroll: false });
      }
    }
  }, [searchParams, servers, editDialogOpen, router]);

  // Fit-to-viewport pagination
  const { containerRef, pageSize, isReady } = useFitToViewport<HTMLDivElement>({
    rowHeight: ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT + CARD_HEADER_HEIGHT,
    paginationHeight: PAGINATION_HEIGHT,
    minRows: 3,
  });

  const {
    paginatedData,
    currentPage,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
  } = useFitToViewportPagination(servers || [], pageSize);

  const handleDelete = async () => {
    if (!serverToDelete) return;

    try {
      await deleteServer.mutateAsync(serverToDelete.id);
      toast.success(`Server "${serverToDelete.name}" deleted`);
      setDeleteDialogOpen(false);
      setServerToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete server');
    }
  };

  const handleTestConnection = async (server: ServerType) => {
    setTestingServerId(server.id);
    try {
      const result = await testConnection.mutateAsync(server.id);
      const toastType = getToastType(result);
      const toastTitle = getToastTitle(result);

      const toastFn =
        toastType === 'success'
          ? toast.success
          : toastType === 'warning'
            ? toast.warning
            : toast.error;

      toastFn(toastTitle, {
        description: <ConnectionTestToastContent result={result} serverName={server.name} />,
        duration: toastType === 'success' ? 5000 : 8000,
      });
    } catch (error) {
      toast.error('Connection Test Failed', {
        description: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setTestingServerId(null);
    }
  };

  const handleOpenDiagnostics = async (server: ServerType) => {
    setDiagnosticsServer(server);
    setDiagnosticsDialogOpen(true);
    setDiagnosticsLoading(true);
    try {
      const result = await testConnection.mutateAsync(server.id);
      setDiagnosticsResult(result);
    } catch (error) {
      setDiagnosticsResult({
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        fileIngestion: null,
      });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const handleRefreshDiagnostics = async () => {
    if (!diagnosticsServer) return;
    setDiagnosticsLoading(true);
    try {
      const result = await testConnection.mutateAsync(diagnosticsServer.id);
      setDiagnosticsResult(result);
    } catch (error) {
      setDiagnosticsResult({
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        fileIngestion: null,
      });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  return (
    <Card ref={containerRef} className="flex flex-1 flex-col overflow-hidden">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between space-y-0 px-4 py-3 sm:px-6 sm:py-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            Connected Sources
            {testAllConnections.isPending && (
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">Checking status...</span>
              </span>
            )}
          </CardTitle>
          <CardDescription className="hidden sm:block">
            View and manage your media server and service connections
          </CardDescription>
        </div>
        <AddSourceModal
          trigger={
            <Button size="sm" className="sm:size-default">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Source</span>
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
        {isLoading || !isReady ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : servers && servers.length > 0 ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Mobile Card View */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:hidden">
              {(servers || []).map((server) => {
                const integration = getIntegrationById(server.providerId);
                return (
                  <div
                    key={server.id}
                    className="bg-muted/30 rounded-lg border border-white/10 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {integration ? (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                            style={{
                              backgroundColor: `${integration.color}15`,
                            }}
                          >
                            <IntegrationIcon integration={integration} size="md" />
                          </div>
                        ) : (
                          <div className="bg-muted flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                            <Server className="text-muted-foreground h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium">{server.name}</div>
                          <a
                            href={server.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
                          >
                            {new URL(server.url).host}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleTestConnection(server)}
                            disabled={testingServerId === server.id}
                          >
                            {testingServerId === server.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Test Connection
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleOpenDiagnostics(server)}>
                            <Bug className="mr-2 h-4 w-4" />
                            Diagnostics
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setServerToEdit(server);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setServerToDelete(server);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <ConnectionStatus
                        apiConnected={server.isConnected}
                        fileIngestionEnabled={server.fileIngestionEnabled}
                        fileIngestionConnected={server.fileIngestionConnected}
                        lastSeen={server.lastSeen}
                        lastFileSync={server.lastFileSync}
                        variant="badge"
                      />
                      <span className="text-muted-foreground text-xs">
                        {server.lastSeen
                          ? formatDistanceToNow(new Date(server.lastSeen), {
                              addSuffix: true,
                            })
                          : 'Never seen'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden flex-1 overflow-hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.map((server) => {
                    const integration = getIntegrationById(server.providerId);
                    return (
                      <TableRow key={server.id} style={{ height: ROW_HEIGHT }}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {integration ? (
                              <div
                                className="flex h-10 w-10 items-center justify-center rounded-lg"
                                style={{
                                  backgroundColor: `${integration.color}15`,
                                }}
                              >
                                <IntegrationIcon integration={integration} size="md" />
                              </div>
                            ) : (
                              <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-lg">
                                <Server className="text-muted-foreground h-5 w-5" />
                              </div>
                            )}
                            <div>
                              <div className="font-medium">{server.name}</div>
                              {(server.serverName || server.version) && (
                                <div className="text-muted-foreground text-xs">
                                  {server.serverName && server.version
                                    ? `${server.serverName} v${server.version}`
                                    : server.serverName ||
                                      (server.version ? `v${server.version}` : '')}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const category = integration
                              ? integrationCategories.find((c) => c.id === integration.category)
                              : null;
                            return (
                              <Badge
                                variant="outline"
                                className="capitalize"
                                style={{
                                  borderColor: integration?.color || '#6B7280',
                                  color: integration?.color || '#6B7280',
                                }}
                              >
                                {category?.name || server.providerId}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <a
                            href={server.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
                          >
                            {new URL(server.url).host}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </TableCell>
                        <TableCell>
                          <ConnectionStatus
                            apiConnected={server.isConnected}
                            fileIngestionEnabled={server.fileIngestionEnabled}
                            fileIngestionConnected={server.fileIngestionConnected}
                            lastSeen={server.lastSeen}
                            lastFileSync={server.lastFileSync}
                            variant="badge"
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {server.lastSeen
                            ? formatDistanceToNow(new Date(server.lastSeen), {
                                addSuffix: true,
                              })
                            : 'Never'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleTestConnection(server)}
                                disabled={testingServerId === server.id}
                              >
                                {testingServerId === server.id ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                Test Connection
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleOpenDiagnostics(server)}>
                                <Bug className="mr-2 h-4 w-4" />
                                Diagnostics
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setServerToEdit(server);
                                  setEditDialogOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setServerToDelete(server);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination - only shown on desktop when needed */}
            {totalPages > 1 && (
              <div className="hidden sm:block">
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  startIndex={startIndex}
                  endIndex={endIndex}
                  hasNextPage={hasNextPage}
                  hasPrevPage={hasPrevPage}
                  onNextPage={nextPage}
                  onPrevPage={prevPage}
                  onFirstPage={firstPage}
                  onLastPage={lastPage}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="m-6 flex flex-1 items-center justify-center rounded-lg border border-dashed">
            <div className="text-center">
              <Server className="text-muted-foreground mx-auto h-8 w-8" />
              <h3 className="mt-4 text-lg font-semibold">No sources configured</h3>
              <p className="text-muted-foreground mt-2 text-sm">
                Add your first source to start collecting logs
              </p>
              <div className="mt-4">
                <AddSourceModal
                  trigger={
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Source
                    </Button>
                  }
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Server</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{serverToDelete?.name}
              &quot;? This action cannot be undone. All logs associated with this server will be
              preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteServer.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {serverToEdit && (
        <EditServerDialog
          server={serverToEdit}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setServerToEdit(null);
          }}
        />
      )}

      {diagnosticsServer && (
        <SourceDiagnosticsDialog
          server={diagnosticsServer}
          connectionStatus={diagnosticsResult}
          isLoading={diagnosticsLoading}
          open={diagnosticsDialogOpen}
          onOpenChange={(open) => {
            setDiagnosticsDialogOpen(open);
            if (!open) {
              setDiagnosticsServer(null);
              setDiagnosticsResult(null);
            }
          }}
          onRefresh={handleRefreshDiagnostics}
        />
      )}
    </Card>
  );
}

export default function ServersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Server className="h-8 w-8 animate-pulse text-zinc-600" />
        </div>
      }
    >
      <ServersPageContent />
    </Suspense>
  );
}
