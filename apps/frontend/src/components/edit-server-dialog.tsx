'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Loader2,
  FileText,
  Info,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Server,
  Key,
  Tag,
  FolderOpen,
  FileSearch,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v3';

import type { Server as ServerType } from '@/lib/api';

import {
  ConnectionTestToastContent,
  getToastType,
  getToastTitle,
} from '@/components/connection-test-toast';
import { ProviderIcon, getProviderMeta } from '@/components/provider-icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useUpdateServer, useTestConnection } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  url: z.string().url('Must be a valid URL'),
  apiKey: z.string().min(1, 'API key is required'),
  logPath: z.string().optional(),
  fileIngestionEnabled: z.boolean(),
  logPaths: z.string().optional(),
  logFilePatterns: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface EditServerDialogProps {
  server: ServerType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditServerDialog({ server, open, onOpenChange }: EditServerDialogProps) {
  const updateServer = useUpdateServer();
  const testConnection = useTestConnection();
  const [isTesting, setIsTesting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: server.name,
      url: server.url,
      apiKey: server.apiKey,
      logPath: server.logPath || '',
      fileIngestionEnabled: server.fileIngestionEnabled || false,
      logPaths: server.logPaths?.join(', ') || '',
      logFilePatterns: server.logFilePatterns?.join(', ') || '',
    },
  });

  const fileIngestionEnabled = form.watch('fileIngestionEnabled');

  useEffect(() => {
    if (open) {
      form.reset({
        name: server.name,
        url: server.url,
        apiKey: server.apiKey,
        logPath: server.logPath || '',
        fileIngestionEnabled: server.fileIngestionEnabled || false,
        logPaths: server.logPaths?.join(', ') || '',
        logFilePatterns: server.logFilePatterns?.join(', ') || '',
      });
    }
  }, [open, server, form]);

  async function handleTest() {
    setIsTesting(true);
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
      setIsTesting(false);
    }
  }

  async function onSubmit(data: FormData) {
    try {
      const logPaths = data.logPaths
        ? data.logPaths
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        : undefined;
      const logFilePatterns = data.logFilePatterns
        ? data.logFilePatterns
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        : undefined;

      const fileIngestionChanged =
        data.fileIngestionEnabled !== server.fileIngestionEnabled ||
        JSON.stringify(logPaths) !== JSON.stringify(server.logPaths) ||
        JSON.stringify(logFilePatterns) !== JSON.stringify(server.logFilePatterns);

      await updateServer.mutateAsync({
        id: server.id,
        data: {
          name: data.name,
          url: data.url,
          apiKey: data.apiKey,
          logPath: data.logPath || undefined,
          fileIngestionEnabled: data.fileIngestionEnabled,
          logPaths: logPaths?.length ? logPaths : undefined,
          logFilePatterns: logFilePatterns?.length ? logFilePatterns : undefined,
        },
      });

      if (data.fileIngestionEnabled && fileIngestionChanged) {
        toast.info('Settings saved, validating file paths...', { duration: 2000 });

        setTimeout(async () => {
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
              description: <ConnectionTestToastContent result={result} serverName={data.name} />,
              duration: toastType === 'success' ? 5000 : 8000,
            });
          } catch {
            // Ignore test errors on save
          }
        }, 500);

        onOpenChange(false);
      } else {
        toast.success('Server updated successfully');
        onOpenChange(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update server');
    }
  }

  const FileIngestionStatus = () => {
    if (!server.fileIngestionEnabled) return null;

    const isConnected = server.fileIngestionConnected;
    const error = server.fileIngestionError;

    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
          isConnected
            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
        )}
      >
        {isConnected ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <span className="font-medium">{isConnected ? 'Active' : 'Issue'}</span>
        <span className="text-xs opacity-75">
          {isConnected
            ? server.lastFileSync
              ? `Last sync: ${new Date(server.lastFileSync).toLocaleTimeString()}`
              : 'Monitoring log files'
            : error || 'Unable to access paths'}
        </span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ProviderIcon providerId={server.providerId} size="md" />
            Edit {getProviderMeta(server.providerId).name} Source
          </DialogTitle>
          <DialogDescription>Update the configuration for "{server.name}"</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Connection Settings Section */}
            <div className="space-y-4">
              <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                <Server className="h-4 w-4" />
                Connection Settings
              </div>

              {/* Name and URL side by side */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5" />
                        Name
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="My Jellyfin Server" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Server className="h-3.5 w-3.5" />
                        Server URL
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="http://localhost:8096" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* API Key full width */}
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5" />
                      API Key
                    </FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter API key" {...field} />
                    </FormControl>
                    <FormDescription>Found in Dashboard → API Keys</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* File Ingestion Section */}
            <div className="space-y-4 border-t pt-2">
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  File-Based Log Ingestion
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        Read logs directly from files instead of just the API. Captures application
                        errors, stack traces, and debug info.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={isTesting}
                  className="h-8"
                >
                  {isTesting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Test Connection
                </Button>
              </div>

              {/* Enable toggle and status inline */}
              <div className="flex items-center gap-4">
                <FormField
                  control={form.control}
                  name="fileIngestionEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 space-y-0">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="cursor-pointer font-normal">
                        Enable file ingestion
                      </FormLabel>
                    </FormItem>
                  )}
                />
                <FileIngestionStatus />
              </div>

              {fileIngestionEnabled && (
                <>
                  {/* Log Paths and File Patterns side by side */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="logPaths"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <FolderOpen className="h-3.5 w-3.5" />
                            Log Paths
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="/config/log, /var/log/jellyfin" {...field} />
                          </FormControl>
                          <FormDescription>Comma-separated directories to watch</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="logFilePatterns"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1.5">
                            <FileSearch className="h-3.5 w-3.5" />
                            File Patterns
                            <span className="text-muted-foreground font-normal">(optional)</span>
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="*.log, *.txt" {...field} />
                          </FormControl>
                          <FormDescription>Leave empty for defaults</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Warning if paths are empty */}
                  {!form.watch('logPaths')?.trim() && (
                    <Alert variant="default" className="border-amber-500/50 bg-amber-500/5">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <AlertDescription className="text-amber-600 dark:text-amber-400">
                        No log paths configured. Add at least one path for file ingestion to work.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateServer.isPending}>
                {updateServer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
