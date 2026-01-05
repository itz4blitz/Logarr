'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, FileText, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v3';

import { ProviderIcon } from '@/components/provider-icon';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProviders, useCreateServer } from '@/hooks/use-api';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  providerId: z.string().min(1, 'Provider is required'),
  url: z.string().url('Must be a valid URL'),
  apiKey: z.string().min(1, 'API key is required'),
  logPath: z.string().optional(),
  fileIngestionEnabled: z.boolean(),
  logPaths: z.string().optional(),
  logFilePatterns: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddServerDialogProps {
  trigger?: React.ReactNode;
}

export function AddServerDialog({ trigger }: AddServerDialogProps) {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const createServer = useCreateServer();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      providerId: 'jellyfin',
      url: '',
      apiKey: '',
      logPath: '',
      fileIngestionEnabled: false,
      logPaths: '',
      logFilePatterns: '',
    },
  });

  const fileIngestionEnabled = form.watch('fileIngestionEnabled');

  async function onSubmit(data: FormData) {
    try {
      // Parse comma-separated strings to arrays
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

      await createServer.mutateAsync({
        name: data.name,
        providerId: data.providerId,
        url: data.url,
        apiKey: data.apiKey,
        logPath: data.logPath || undefined,
        fileIngestionEnabled: data.fileIngestionEnabled,
        logPaths: logPaths?.length ? logPaths : undefined,
        logFilePatterns: logFilePatterns?.length ? logFilePatterns : undefined,
      });
      toast.success('Server added successfully');
      setOpen(false);
      form.reset();
      setAdvancedOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add server');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Add Source</DialogTitle>
          <DialogDescription>
            Connect a media server or service to start collecting logs and monitoring activity.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="My Jellyfin Server" {...field} />
                  </FormControl>
                  <FormDescription>A friendly name to identify this server</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="providerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Server Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={loadingProviders}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select server type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {providers?.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          <div className="flex items-center gap-2">
                            <ProviderIcon providerId={provider.id} size="sm" />
                            <span>{provider.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Server URL</FormLabel>
                  <FormControl>
                    <Input placeholder="http://localhost:8096" {...field} />
                  </FormControl>
                  <FormDescription>The URL of your media server (including port)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="apiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Key</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Enter API key" {...field} />
                  </FormControl>
                  <FormDescription>Found in Dashboard &rarr; API Keys</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Advanced Settings Collapsible */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" type="button" className="w-full justify-between px-0">
                  <span className="text-muted-foreground flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    Advanced Settings
                  </span>
                  {advancedOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                <FormField
                  control={form.control}
                  name="logPath"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Log Path (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="/config/log" {...field} />
                      </FormControl>
                      <FormDescription>Path to log files (leave empty for default)</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* File Ingestion Section */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium">File-Based Log Ingestion</h4>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="text-muted-foreground h-3.5 w-3.5 cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          Read logs directly from files to capture application errors, stack traces,
                          and detailed debug info that APIs don&apos;t expose.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <FormField
                    control={form.control}
                    name="fileIngestionEnabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Enable File Ingestion</FormLabel>
                          <FormDescription>Read logs from mounted file paths</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {fileIngestionEnabled && (
                    <>
                      <FormField
                        control={form.control}
                        name="logPaths"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Log Paths</FormLabel>
                            <FormControl>
                              <Input placeholder="/config/log, /var/log/jellyfin" {...field} />
                            </FormControl>
                            <FormDescription>
                              Comma-separated list of log directories to watch
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="logFilePatterns"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>File Patterns (Optional)</FormLabel>
                            <FormControl>
                              <Input placeholder="*.log, *.txt" {...field} />
                            </FormControl>
                            <FormDescription>
                              Comma-separated file patterns to match (leave empty for defaults)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createServer.isPending}>
                {createServer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Add Source
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
