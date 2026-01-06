'use client';

import { formatDistanceToNow } from 'date-fns';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Star,
  CheckCircle,
  XCircle,
  Zap,
  MoreHorizontal,
  ExternalLink,
  Sparkles,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { useState, useRef } from 'react';
import { toast } from 'sonner';

import type {
  AiProviderType,
  AiProviderInfo,
  AiProviderSettings,
  AiModelInfo,
  CreateAiProviderDto,
  UpdateAiProviderDto,
} from '@/lib/api';

import { ProviderIcon, providerMeta } from '@/components/provider-icon';
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  useAvailableAiProviders,
  useAiProviderSettings,
  useCreateAiProviderSetting,
  useUpdateAiProviderSetting,
  useDeleteAiProviderSetting,
  useTestAiProvider,
  useTestAiProviderSetting,
  useFetchAiProviderModels,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';

function AiProvidersGrid({
  providers,
  settings,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
  onTest,
  onSetDefault,
}: {
  providers: AiProviderInfo[] | undefined;
  settings: AiProviderSettings[] | undefined;
  isLoading: boolean;
  onAdd: (provider: AiProviderInfo) => void;
  onEdit: (setting: AiProviderSettings, provider: AiProviderInfo) => void;
  onDelete: (setting: AiProviderSettings) => void;
  onTest: (setting: AiProviderSettings) => void;
  onSetDefault: (setting: AiProviderSettings) => void;
}) {
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleTest = async (setting: AiProviderSettings) => {
    setTestingId(setting.id);
    try {
      await onTest(setting);
    } finally {
      setTestingId(null);
    }
  };

  // Get all configured settings with their provider info
  const configuredSettings = (settings || []).map((setting) => {
    const provider = providers?.find((p) => p.id === setting.provider);
    return { setting, provider };
  });

  // Get unconfigured providers
  const configuredProviderIds = new Set((settings || []).map((s) => s.provider));
  const unconfiguredProviders = (providers || []).filter((p) => !configuredProviderIds.has(p.id));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border p-5">
              <div className="flex items-start gap-4">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hasNoConfigured = configuredSettings.length === 0;

  return (
    <div className="space-y-6">
      {/* Configured Providers */}
      {hasNoConfigured ? (
        <div className="border-muted-foreground/20 from-muted/30 to-muted/10 relative overflow-hidden rounded-2xl border-2 border-dashed bg-linear-to-br p-12">
          <div className="bg-grid-white/5 absolute inset-0" />
          <div className="relative flex flex-col items-center justify-center text-center">
            <div className="mb-4 rounded-2xl bg-linear-to-br from-violet-500/20 to-purple-500/20 p-4">
              <Sparkles className="h-8 w-8 text-violet-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">No AI Providers Configured</h3>
            <p className="text-muted-foreground mb-6 max-w-md text-sm">
              Connect an AI provider to enable intelligent log analysis, error detection, and
              automated troubleshooting suggestions.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {(providers || []).slice(0, 3).map((provider) => {
                const meta = providerMeta[provider.id] || {
                  bgColor: 'bg-gray-500/10',
                  color: '#888',
                };
                return (
                  <Button
                    key={provider.id}
                    variant="outline"
                    className="gap-2"
                    onClick={() => onAdd(provider)}
                  >
                    <div className={cn('rounded p-1', meta.bgColor)}>
                      <ProviderIcon providerId={provider.id} size="sm" />
                    </div>
                    {provider.name}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 p-0.5 md:grid-cols-2 xl:grid-cols-3">
          {configuredSettings.map(({ setting, provider }) => {
            if (!provider) return null;
            const meta = providerMeta[provider.id] || { bgColor: 'bg-gray-500/10', color: '#888' };
            const modelName =
              provider.models.find((m) => m.id === setting.model)?.name || setting.model;
            const isTesting = testingId === setting.id;
            const isConnected = setting.lastTestResult === 'success';
            const hasFailed = setting.lastTestResult && setting.lastTestResult !== 'success';

            return (
              <div
                key={setting.id}
                className={cn(
                  'group bg-card relative rounded-xl border transition-all duration-200',
                  'hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20'
                )}
                style={
                  setting.isDefault
                    ? {
                        boxShadow: `0 0 0 2px ${meta.color}40`,
                      }
                    : undefined
                }
              >
                {/* Gradient accent bar - hidden when default since outline provides visual distinction */}
                {!setting.isDefault && (
                  <div
                    className="absolute top-0 right-0 left-0 h-1 rounded-t-xl"
                    style={{
                      background: `linear-gradient(to right, ${meta.color}, ${meta.color}80)`,
                    }}
                  />
                )}

                <div className="p-5">
                  {/* Header */}
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'rounded-xl p-3 transition-transform group-hover:scale-105',
                          meta.bgColor
                        )}
                        style={{ boxShadow: `0 4px 12px ${meta.color}20` }}
                      >
                        <ProviderIcon providerId={provider.id} size="md" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{setting.name}</h3>
                          {setting.isDefault && (
                            <Badge
                              className="border px-1.5 text-[10px]"
                              style={{
                                backgroundColor: `${meta.color}15`,
                                color: meta.color,
                                borderColor: `${meta.color}30`,
                              }}
                            >
                              <Star className="mr-0.5 h-2.5 w-2.5 fill-current" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <a
                          href={provider.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                        >
                          {provider.name}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(setting, provider)}>
                          <Edit2 className="mr-2 h-4 w-4" />
                          Edit Configuration
                        </DropdownMenuItem>
                        {!setting.isDefault && (
                          <DropdownMenuItem onClick={() => onSetDefault(setting)}>
                            <Star className="mr-2 h-4 w-4" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(setting)}
                          className="text-red-500 focus:text-red-500"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Model & Settings */}
                  <div className="mb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-xs tracking-wide uppercase">
                        Model
                      </span>
                      <code className="bg-muted/50 rounded-md px-2 py-0.5 font-mono text-xs">
                        {modelName}
                      </code>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <div className="flex-1">
                        <span className="text-muted-foreground">Temp</span>
                        <div className="font-medium">
                          {setting.temperature?.toFixed(1) ?? '0.7'}
                        </div>
                      </div>
                      <div className="flex-1">
                        <span className="text-muted-foreground">Max Tokens</span>
                        <div className="font-medium">
                          {setting.maxTokens?.toLocaleString() ?? '1,000'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status & Actions */}
                  <div className="border-border/50 flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-2">
                      {setting.lastTestResult ? (
                        <>
                          <div
                            className={cn(
                              'flex items-center gap-1.5 text-xs font-medium',
                              isConnected ? 'text-emerald-500' : 'text-red-500'
                            )}
                          >
                            <div
                              className={cn(
                                'h-2 w-2 animate-pulse rounded-full',
                                isConnected ? 'bg-emerald-500' : 'bg-red-500'
                              )}
                            />
                            {isConnected ? 'Connected' : 'Failed'}
                          </div>
                          {setting.lastTestedAt && (
                            <span className="text-muted-foreground text-[10px]">
                              {formatDistanceToNow(new Date(setting.lastTestedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-1 text-xs">
                          <Activity className="h-3 w-3" />
                          Not tested
                        </span>
                      )}
                    </div>

                    <Button
                      variant={hasFailed ? 'destructive' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleTest(setting)}
                      disabled={isTesting}
                    >
                      {isTesting ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="mr-1 h-3 w-3" />
                      )}
                      Test
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Available Providers Section */}
      {unconfiguredProviders.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" />
            Add Provider
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {unconfiguredProviders.map((provider) => {
              const meta = providerMeta[provider.id] || {
                bgColor: 'bg-gray-500/10',
                color: '#888',
              };
              return (
                <button
                  key={provider.id}
                  onClick={() => onAdd(provider)}
                  className={cn(
                    'group bg-card/50 flex items-center gap-3 rounded-lg border p-3',
                    'hover:bg-card hover:border-muted-foreground/30 transition-all duration-200 hover:shadow-md',
                    'text-left'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-lg p-2 transition-transform group-hover:scale-110',
                      meta.bgColor
                    )}
                  >
                    <ProviderIcon providerId={provider.id} size="sm" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{provider.name}</div>
                    <div className="text-muted-foreground text-[10px]">
                      {provider.requiresApiKey ? 'API Key' : 'Local'}
                    </div>
                  </div>
                  <Plus className="text-muted-foreground h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AddEditProviderDialog({
  open,
  onClose,
  provider,
  setting,
}: {
  open: boolean;
  onClose: () => void;
  provider: AiProviderInfo | null;
  setting: AiProviderSettings | null;
}) {
  const [formData, setFormData] = useState<{
    name: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    maxTokens: number;
    temperature: number;
    isDefault: boolean;
    isEnabled: boolean;
  }>({
    name: '',
    apiKey: '',
    baseUrl: '',
    model: '',
    maxTokens: 1000,
    temperature: 0.7,
    isDefault: false,
    isEnabled: true,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    responseTime?: number;
  } | null>(null);
  const [dynamicModels, setDynamicModels] = useState<AiModelInfo[] | null>(null);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [autoFetchTriggered, setAutoFetchTriggered] = useState(false);
  const prevProviderIdRef = useRef<string | null>(null);

  const createMutation = useCreateAiProviderSetting();
  const updateMutation = useUpdateAiProviderSetting();
  const testMutation = useTestAiProvider();
  const fetchModelsMutation = useFetchAiProviderModels();

  // Reset form when provider/setting changes
  const providerId = provider?.id ?? null;
  if (providerId !== prevProviderIdRef.current) {
    prevProviderIdRef.current = providerId;
    if (provider) {
      const defaultBaseUrl =
        provider.id === 'ollama'
          ? 'http://localhost:11434'
          : provider.id === 'lmstudio'
            ? 'http://localhost:1234'
            : '';
      setFormData({
        name: setting?.name || `My ${provider.name}`,
        apiKey: '',
        baseUrl: setting?.baseUrl || defaultBaseUrl,
        model: setting?.model || provider.models[0]?.id || '',
        maxTokens: setting?.maxTokens || 1000,
        temperature: setting?.temperature || 0.7,
        isDefault: setting?.isDefault || false,
        isEnabled: setting?.isEnabled ?? true,
      });
      setTestResult(null);
      setShowApiKey(false);
      setDynamicModels(null);
      setModelsFetched(false);
      setAutoFetchTriggered(false);
    }
  }

  // Fetch models dynamically
  const handleFetchModels = async (showToast = false) => {
    if (!provider) return;

    // For providers requiring API key, we need it to fetch
    if (provider.requiresApiKey && !formData.apiKey) {
      if (showToast) toast.error('API key required to fetch models');
      return;
    }

    try {
      const models = await fetchModelsMutation.mutateAsync({
        provider: provider.id,
        apiKey: formData.apiKey || '',
        baseUrl: formData.baseUrl || undefined,
      });
      setDynamicModels(models);
      setModelsFetched(true);
      // If we got models and current selection isn't in the list, select first
      if (models.length > 0 && !models.find((m) => m.id === formData.model)) {
        setFormData((prev) => ({ ...prev, model: models[0].id }));
      }
      if (showToast) toast.success(`Found ${models.length} models`);
    } catch (err) {
      if (showToast) toast.error(err instanceof Error ? err.message : 'Failed to fetch models');
      setModelsFetched(true);
    }
  };

  // Auto-fetch models for local providers when baseUrl is set
  const shouldAutoFetch =
    provider &&
    !provider.requiresApiKey &&
    formData.baseUrl &&
    !autoFetchTriggered &&
    !modelsFetched;
  if (shouldAutoFetch) {
    setAutoFetchTriggered(true);
    handleFetchModels(false);
  }

  // Use dynamic models if fetched, otherwise use provider fallback
  const availableModels = dynamicModels || provider?.models || [];

  const isEditing = !!setting;
  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isTesting = testMutation.isPending;

  const handleTest = async () => {
    if (!provider || !formData.apiKey) {
      toast.error('API key is required to test');
      return;
    }

    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync({
        provider: provider.id,
        apiKey: formData.apiKey,
        model: formData.model,
        baseUrl: formData.baseUrl || undefined,
      });
      setTestResult(result);
      if (result.success) {
        toast.success(`Connected (${result.responseTime}ms)`);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test failed');
    }
  };

  const handleSubmit = async () => {
    if (!provider) return;

    try {
      if (isEditing) {
        const updateData: UpdateAiProviderDto = {
          name: formData.name,
          model: formData.model,
          maxTokens: formData.maxTokens,
          temperature: formData.temperature,
          isDefault: formData.isDefault,
          isEnabled: formData.isEnabled,
        };
        if (formData.apiKey) updateData.apiKey = formData.apiKey;
        if (formData.baseUrl) updateData.baseUrl = formData.baseUrl;

        await updateMutation.mutateAsync({ id: setting.id, data: updateData });
        toast.success('Updated');
      } else {
        if (!formData.apiKey && provider.requiresApiKey) {
          toast.error('API key is required');
          return;
        }

        const createData: CreateAiProviderDto = {
          provider: provider.id,
          name: formData.name,
          apiKey: formData.apiKey,
          model: formData.model,
          maxTokens: formData.maxTokens,
          temperature: formData.temperature,
          isDefault: formData.isDefault,
          isEnabled: formData.isEnabled,
        };
        if (formData.baseUrl) createData.baseUrl = formData.baseUrl;

        await createMutation.mutateAsync(createData);
        toast.success('Configured');
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  if (!provider) return null;

  const meta = providerMeta[provider.id] || { bgColor: 'bg-gray-500/10' };
  const selectedModel = availableModels.find((m) => m.id === formData.model);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={cn('rounded-lg p-2', meta.bgColor)}>
              <ProviderIcon providerId={provider.id} size="sm" />
            </div>
            {isEditing ? `Edit ${provider.name}` : `Configure ${provider.name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* API Key - only show if provider requires it */}
          {provider.requiresApiKey && (
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">
                API Key{' '}
                {isEditing && <span className="text-muted-foreground">(blank to keep)</span>}
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.apiKey}
                  onChange={(e) => setFormData((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder={isEditing && setting?.hasApiKey ? '••••••••' : 'sk-...'}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-0 right-0 h-full w-10"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {/* Base URL - show if provider supports it */}
          {provider.supportsBaseUrl && (
            <div className="space-y-1.5">
              <Label htmlFor="baseUrl">
                Base URL{' '}
                {provider.requiresApiKey && (
                  <span className="text-muted-foreground">(optional)</span>
                )}
              </Label>
              <Input
                id="baseUrl"
                value={formData.baseUrl}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, baseUrl: e.target.value }));
                  // Reset model fetch state when base URL changes for local providers
                  if (!provider.requiresApiKey) {
                    setModelsFetched(false);
                    setAutoFetchTriggered(false);
                  }
                }}
                placeholder={
                  provider.id === 'ollama'
                    ? 'http://localhost:11434'
                    : provider.id === 'lmstudio'
                      ? 'http://localhost:1234'
                      : 'https://api.openai.com/v1'
                }
              />
              {!provider.requiresApiKey && (
                <p className="text-muted-foreground text-xs">
                  Models will be auto-detected from this endpoint
                </p>
              )}
            </div>
          )}

          {/* Model Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="model">Model</Label>
              <div className="flex items-center gap-2">
                {dynamicModels && (
                  <span className="flex items-center gap-1 text-xs text-emerald-500">
                    <CheckCircle className="h-3 w-3" />
                    {dynamicModels.length} detected
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-xs"
                  onClick={() => handleFetchModels(true)}
                  disabled={
                    fetchModelsMutation.isPending || (provider?.requiresApiKey && !formData.apiKey)
                  }
                >
                  {fetchModelsMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  {dynamicModels ? 'Refresh' : 'Detect'}
                </Button>
              </div>
            </div>
            <Select
              value={formData.model}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, model: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedModel?.contextWindow && (
              <p className="text-muted-foreground text-xs">
                {selectedModel.contextWindow.toLocaleString()} tokens context
              </p>
            )}
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-muted-foreground text-sm">
                {formData.temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[formData.temperature]}
              onValueChange={([value]) => setFormData((prev) => ({ ...prev, temperature: value }))}
              min={0}
              max={1}
              step={0.1}
            />
          </div>

          {/* Max Tokens */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Max Tokens</Label>
              <span className="text-muted-foreground text-sm">{formData.maxTokens}</span>
            </div>
            <Slider
              value={[formData.maxTokens]}
              onValueChange={([value]) => setFormData((prev) => ({ ...prev, maxTokens: value }))}
              min={100}
              max={4000}
              step={100}
            />
          </div>

          {/* Set as Default */}
          <div className="flex items-center justify-between">
            <Label>Set as Default</Label>
            <Switch
              checked={formData.isDefault}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, isDefault: checked }))
              }
            />
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg p-3 text-sm',
                testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
              )}
            >
              {testResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {testResult.success ? `Connected (${testResult.responseTime}ms)` : testResult.message}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || (!formData.apiKey && provider.requiresApiKey)}
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-1 h-4 w-4" />
            )}
            Test
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AiProvidersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AiProviderInfo | null>(null);
  const [selectedSetting, setSelectedSetting] = useState<AiProviderSettings | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [settingToDelete, setSettingToDelete] = useState<AiProviderSettings | null>(null);

  const { data: providers, isLoading: providersLoading } = useAvailableAiProviders();
  const { data: settings, isLoading: settingsLoading } = useAiProviderSettings();
  const deleteMutation = useDeleteAiProviderSetting();
  const updateMutation = useUpdateAiProviderSetting();
  const testMutation = useTestAiProviderSetting();

  const handleAddProvider = (provider: AiProviderInfo) => {
    setSelectedProvider(provider);
    setSelectedSetting(null);
    setDialogOpen(true);
  };

  const handleEditProvider = (setting: AiProviderSettings, provider: AiProviderInfo) => {
    setSelectedProvider(provider);
    setSelectedSetting(setting);
    setDialogOpen(true);
  };

  const handleDeleteProvider = (setting: AiProviderSettings) => {
    setSettingToDelete(setting);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!settingToDelete) return;
    try {
      await deleteMutation.mutateAsync(settingToDelete.id);
      toast.success('Deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
    setDeleteConfirmOpen(false);
    setSettingToDelete(null);
  };

  const handleTestProvider = async (setting: AiProviderSettings) => {
    try {
      const result = await testMutation.mutateAsync(setting.id);
      if (result.success) {
        toast.success(`Connected (${result.responseTime}ms)`);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const handleSetDefault = async (setting: AiProviderSettings) => {
    try {
      await updateMutation.mutateAsync({
        id: setting.id,
        data: { isDefault: true },
      });
      toast.success('Set as default');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed');
    }
  };

  const isLoading = providersLoading || settingsLoading;

  return (
    <>
      <AiProvidersGrid
        providers={providers}
        settings={settings}
        isLoading={isLoading}
        onAdd={handleAddProvider}
        onEdit={handleEditProvider}
        onDelete={handleDeleteProvider}
        onTest={handleTestProvider}
        onSetDefault={handleSetDefault}
      />

      {/* Add/Edit Dialog */}
      <AddEditProviderDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setSelectedProvider(null);
          setSelectedSetting(null);
        }}
        provider={selectedProvider}
        setting={selectedSetting}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete &quot;{settingToDelete?.name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
