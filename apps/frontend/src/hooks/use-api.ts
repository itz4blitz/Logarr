import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';

import type {
  CreateServerDto,
  UpdateServerDto,
  LogSearchParams,
  IssueSearchParams,
  UpdateIssueDto,
  CreateAiProviderDto,
  UpdateAiProviderDto,
  AiProviderType,
  CreateApiKeyDto,
  UpdateApiKeyDto,
  ApiKeyInfo,
  SetupDto,
  LoginDto,
  UpdatePasswordDto,
  SecuritySettings,
} from '@/lib/api';

import { api } from '@/lib/api';

// Query Keys
export const queryKeys = {
  health: ['health'] as const,
  dashboard: ['dashboard'] as const,
  servers: ['servers'] as const,
  server: (id: string) => ['servers', id] as const,
  providers: ['providers'] as const,
  logs: (params?: LogSearchParams) => ['logs', params] as const,
  log: (id: string) => ['logs', 'detail', id] as const,
  logDetails: (id: string) => ['logs', 'details', id] as const,
  logStats: (serverId?: string) => ['logs', 'stats', serverId] as const,
  logSources: (serverId?: string) => ['logs', 'sources', serverId] as const,
  sessions: ['sessions'] as const,
  activeSessions: ['sessions', 'active'] as const,
  session: (id: string) => ['sessions', id] as const,
  sessionTimeline: (id: string) => ['sessions', id, 'timeline'] as const,
  sessionLogs: (id: string) => ['sessions', id, 'logs'] as const,
  issues: (params?: IssueSearchParams) => ['issues', params] as const,
  issue: (id: string) => ['issues', 'detail', id] as const,
  issueStats: (serverId?: string) => ['issues', 'stats', serverId] as const,
  issueCategories: ['issues', 'categories'] as const,
  // Settings
  aiProviders: ['settings', 'ai', 'providers'] as const,
  aiProviderSettings: ['settings', 'ai'] as const,
  aiProviderSetting: (id: string) => ['settings', 'ai', id] as const,
  defaultAiProvider: ['settings', 'ai', 'default'] as const,
  // Retention
  retentionConfig: ['retention', 'config'] as const,
  storageStats: ['retention', 'stats'] as const,
  cleanupPreview: ['retention', 'preview'] as const,
  retentionSettings: ['settings', 'retention'] as const,
  retentionHistory: ['settings', 'retention', 'history'] as const,
  // File Ingestion
  fileIngestionSettings: ['settings', 'file-ingestion'] as const,
  // API Keys
  apiKeys: ['settings', 'api-keys'] as const,
  // Auth
  setupStatus: ['auth', 'setup'] as const,
  me: ['auth', 'me'] as const,
  securitySettings: ['settings', 'security'] as const,
};

// Health
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.getHealth(),
    refetchInterval: 30000,
  });
}

// Dashboard - aggregated data for command center
export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.getDashboard(),
    refetchInterval: 30000, // Refresh every 30 seconds
    placeholderData: keepPreviousData,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

// Servers
export function useServers() {
  return useQuery({
    queryKey: queryKeys.servers,
    queryFn: () => api.getServers(),
    placeholderData: keepPreviousData,
    refetchInterval: 30000, // Refresh server status every 30 seconds
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

export function useServer(id: string) {
  return useQuery({
    queryKey: queryKeys.server(id),
    queryFn: () => api.getServer(id),
    enabled: !!id,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

export function useProviders() {
  return useQuery({
    queryKey: queryKeys.providers,
    queryFn: () => api.getProviders(),
    staleTime: 60000, // Provider list rarely changes - cache for 1 minute
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateServerDto) => api.createServer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.servers });
    },
  });
}

export function useUpdateServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateServerDto }) => api.updateServer(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      queryClient.invalidateQueries({ queryKey: queryKeys.server(id) });
    },
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.servers });
    },
  });
}

export function useTestConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.testServerConnection(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.servers });
      queryClient.invalidateQueries({ queryKey: queryKeys.server(id) });
    },
  });
}

export function useTestAllConnections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.testAllConnections(),
    onSuccess: () => {
      // Invalidate servers to refresh the list with updated status
      queryClient.invalidateQueries({ queryKey: queryKeys.servers });
    },
  });
}

// Logs
export function useLogs(params?: LogSearchParams) {
  return useQuery({
    queryKey: queryKeys.logs(params),
    queryFn: () => api.getLogs(params),
    refetchInterval: 5000,
    staleTime: 3000, // Consider data fresh for 3 seconds (less than refetch interval)
    placeholderData: keepPreviousData,
  });
}

export function useLog(id: string) {
  return useQuery({
    queryKey: queryKeys.log(id),
    queryFn: () => api.getLog(id),
    enabled: !!id,
    staleTime: 30000, // Log details don't change - cache for 30 seconds
  });
}

export function useLogDetails(id: string) {
  return useQuery({
    queryKey: queryKeys.logDetails(id),
    queryFn: () => api.getLogDetails(id),
    enabled: !!id,
    staleTime: 30000, // Log details don't change - cache for 30 seconds
  });
}

export function useLogStats(serverId?: string) {
  return useQuery({
    queryKey: queryKeys.logStats(serverId),
    queryFn: () => api.getLogStats(serverId),
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
    staleTime: 5000, // Consider data fresh for 5 seconds
  });
}

export function useLogSources(serverId?: string) {
  return useQuery({
    queryKey: queryKeys.logSources(serverId),
    queryFn: () => api.getLogSources(serverId),
    staleTime: 30000, // Source list changes rarely - cache for 30 seconds
  });
}

// Sessions - 100% real-time via WebSocket, no polling
export function useSessions() {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api.getSessions(),
    staleTime: 5000, // Consider data fresh for 5 seconds
    placeholderData: keepPreviousData,
  });
}

export function useActiveSessions() {
  return useQuery({
    queryKey: queryKeys.activeSessions,
    queryFn: () => api.getActiveSessions(),
    placeholderData: keepPreviousData,
    refetchInterval: 5000, // Refetch every 5 seconds as backup to WebSocket
    staleTime: 3000, // Consider data fresh for 3 seconds (less than refetch interval)
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: queryKeys.session(id),
    queryFn: () => api.getSession(id),
    enabled: !!id,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

export function useSessionTimeline(id: string) {
  return useQuery({
    queryKey: queryKeys.sessionTimeline(id),
    queryFn: () => api.getSessionTimeline(id),
    enabled: !!id,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

export function useSessionLogs(id: string) {
  return useQuery({
    queryKey: queryKeys.sessionLogs(id),
    queryFn: () => api.getSessionLogs(id),
    enabled: !!id,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

// Issues
export function useIssues(params?: IssueSearchParams) {
  return useQuery({
    queryKey: queryKeys.issues(params),
    queryFn: () => api.getIssues(params),
    placeholderData: keepPreviousData,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

export function useIssue(id: string) {
  return useQuery({
    queryKey: queryKeys.issue(id),
    queryFn: () => api.getIssue(id),
    enabled: !!id,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

export function useIssueStats(serverId?: string) {
  return useQuery({
    queryKey: queryKeys.issueStats(serverId),
    queryFn: () => api.getIssueStats(serverId),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
    staleTime: 15000, // Consider data fresh for 15 seconds
  });
}

export function useIssueCategories() {
  return useQuery({
    queryKey: queryKeys.issueCategories,
    queryFn: () => api.getIssueCategories(),
    staleTime: 60000, // Categories rarely change - cache for 1 minute
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateIssueDto }) => api.updateIssue(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(id) });
    },
  });
}

export function useAcknowledgeIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.acknowledgeIssue(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(id) });
    },
  });
}

export function useResolveIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, resolvedBy }: { id: string; resolvedBy?: string }) =>
      api.resolveIssue(id, resolvedBy),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(id) });
    },
  });
}

export function useIgnoreIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.ignoreIssue(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(id) });
    },
  });
}

export function useReopenIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.reopenIssue(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(id) });
    },
  });
}

export function useMergeIssues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ issueIds, newTitle }: { issueIds: string[]; newTitle?: string }) =>
      api.mergeIssues(issueIds, newTitle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export function useBackfillIssues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverId?: string) => api.backfillIssues(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export function useIssueOccurrences(id: string, limit?: number, offset?: number) {
  return useQuery({
    queryKey: ['issues', 'occurrences', id, limit, offset] as const,
    queryFn: () => api.getIssueOccurrences(id, limit, offset),
    enabled: !!id,
    staleTime: 10000, // Consider data fresh for 10 seconds
    placeholderData: keepPreviousData,
  });
}

export function useIssueTimeline(id: string) {
  return useQuery({
    queryKey: ['issues', 'timeline', id] as const,
    queryFn: () => api.getIssueTimeline(id),
    enabled: !!id,
    staleTime: 30000, // Timeline is relatively static - cache for 30 seconds
  });
}

export function useAnalyzeIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, providerId }: { id: string; providerId?: string }) =>
      api.analyzeIssue(id, providerId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(id) });
    },
  });
}

// Settings - AI Providers
export function useAvailableAiProviders() {
  return useQuery({
    queryKey: queryKeys.aiProviders,
    queryFn: () => api.getAvailableAiProviders(),
    staleTime: 300000, // Provider list is static - cache for 5 minutes
  });
}

export function useAiProviderSettings() {
  return useQuery({
    queryKey: queryKeys.aiProviderSettings,
    queryFn: () => api.getAiProviderSettings(),
    staleTime: 30000, // Settings rarely change - cache for 30 seconds
  });
}

export function useAiProviderSetting(id: string) {
  return useQuery({
    queryKey: queryKeys.aiProviderSetting(id),
    queryFn: () => api.getAiProviderSetting(id),
    enabled: !!id,
    staleTime: 30000, // Settings rarely change - cache for 30 seconds
  });
}

export function useDefaultAiProvider() {
  return useQuery({
    queryKey: queryKeys.defaultAiProvider,
    queryFn: () => api.getDefaultAiProvider(),
    staleTime: 30000, // Settings rarely change - cache for 30 seconds
  });
}

export function useCreateAiProviderSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAiProviderDto) => api.createAiProviderSetting(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiProviderSettings });
      queryClient.invalidateQueries({ queryKey: queryKeys.defaultAiProvider });
    },
  });
}

export function useUpdateAiProviderSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAiProviderDto }) =>
      api.updateAiProviderSetting(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiProviderSettings });
      queryClient.invalidateQueries({ queryKey: queryKeys.aiProviderSetting(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.defaultAiProvider });
    },
  });
}

export function useDeleteAiProviderSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteAiProviderSetting(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiProviderSettings });
      queryClient.invalidateQueries({ queryKey: queryKeys.defaultAiProvider });
    },
  });
}

export function useTestAiProvider() {
  return useMutation({
    mutationFn: ({
      provider,
      apiKey,
      model,
      baseUrl,
    }: {
      provider: AiProviderType;
      apiKey: string;
      model: string;
      baseUrl?: string;
    }) => api.testAiProvider(provider, apiKey, model, baseUrl),
  });
}

export function useTestAiProviderSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.testAiProviderSetting(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.aiProviderSettings });
      queryClient.invalidateQueries({ queryKey: queryKeys.aiProviderSetting(id) });
    },
  });
}

export function useFetchAiProviderModels() {
  return useMutation({
    mutationFn: ({
      provider,
      apiKey,
      baseUrl,
    }: {
      provider: AiProviderType;
      apiKey: string;
      baseUrl?: string;
    }) => api.fetchAiProviderModels(provider, apiKey, baseUrl),
  });
}

export function useFetchAiProviderModelsForSetting() {
  return useMutation({
    mutationFn: (id: string) => api.fetchAiProviderModelsForSetting(id),
  });
}

export function useGenerateAiAnalysis() {
  return useMutation({
    mutationFn: ({ prompt, providerId }: { prompt: string; providerId?: string }) =>
      api.generateAiAnalysis(prompt, providerId),
  });
}

// AI Usage Stats
export function useAiUsageStats(params?: {
  startDate?: string;
  endDate?: string;
  provider?: string;
}) {
  return useQuery({
    queryKey: ['settings', 'ai', 'stats', params] as const,
    queryFn: () => api.getAiUsageStats(params),
    staleTime: 60000, // Stats can be cached for a minute
  });
}

export function useAiAnalysisHistory(params?: {
  limit?: number;
  offset?: number;
  provider?: string;
}) {
  return useQuery({
    queryKey: ['settings', 'ai', 'history', params] as const,
    queryFn: () => api.getAiAnalysisHistory(params),
    placeholderData: keepPreviousData,
    staleTime: 30000, // History rarely changes - cache for 30 seconds
  });
}

// Retention
export function useRetentionConfig() {
  return useQuery({
    queryKey: queryKeys.retentionConfig,
    queryFn: () => api.getRetentionConfig(),
    staleTime: 60000, // Config rarely changes - cache for 1 minute
  });
}

export function useStorageStats() {
  return useQuery({
    queryKey: queryKeys.storageStats,
    queryFn: () => api.getStorageStats(),
    refetchInterval: 15000, // Refresh every 15 seconds for near real-time updates
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

export function useCleanupPreview() {
  return useQuery({
    queryKey: queryKeys.cleanupPreview,
    queryFn: () => api.getCleanupPreview(),
    staleTime: 30000, // Preview can be cached for 30 seconds
  });
}

export function useRunCleanup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.runCleanup(),
    onSuccess: () => {
      // Invalidate storage stats and logs after cleanup
      queryClient.invalidateQueries({ queryKey: queryKeys.storageStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.cleanupPreview });
      queryClient.invalidateQueries({ queryKey: queryKeys.retentionHistory });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
    },
  });
}

// Retention Settings (DB-stored)
export function useRetentionSettings() {
  return useQuery({
    queryKey: queryKeys.retentionSettings,
    queryFn: () => api.getRetentionSettings(),
    staleTime: 60000,
  });
}

export function useUpdateRetentionSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Parameters<typeof api.updateRetentionSettings>[0]) =>
      api.updateRetentionSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.retentionSettings });
      queryClient.invalidateQueries({ queryKey: queryKeys.retentionConfig });
      queryClient.invalidateQueries({ queryKey: queryKeys.storageStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.cleanupPreview });
    },
  });
}

export function useRetentionHistory(limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.retentionHistory, limit] as const,
    queryFn: () => api.getRetentionHistory(limit),
    staleTime: 30000,
  });
}

// File Ingestion Settings (DB-stored)
export function useFileIngestionSettings() {
  return useQuery({
    queryKey: queryKeys.fileIngestionSettings,
    queryFn: () => api.getFileIngestionSettings(),
    staleTime: 60000,
  });
}

export function useUpdateFileIngestionSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Parameters<typeof api.updateFileIngestionSettings>[0]) =>
      api.updateFileIngestionSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fileIngestionSettings });
    },
  });
}

// Targeted Log Deletion
export function useDeleteServerLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serverId: string) => api.deleteServerLogs(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storageStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.cleanupPreview });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
    },
  });
}

export function useDeleteServerLogsByLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ serverId, levels }: { serverId: string; levels: string[] }) =>
      api.deleteServerLogsByLevel(serverId, levels),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storageStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.cleanupPreview });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
    },
  });
}

export function useDeleteAllLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.deleteAllLogs(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.storageStats });
      queryClient.invalidateQueries({ queryKey: queryKeys.cleanupPreview });
      queryClient.invalidateQueries({ queryKey: queryKeys.retentionHistory });
      queryClient.invalidateQueries({ queryKey: ['logs'] });
    },
  });
}

// API Keys
export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.apiKeys,
    queryFn: () => api.getApiKeys(),
    staleTime: 0, // Don't cache - always fetch fresh data
    gcTime: 0, // Don't cache garbage either
    retry: 1, // Only retry once to avoid long delays
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateApiKeyDto) => api.createApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
  });
}

export function useUpdateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateApiKeyDto }) => api.updateApiKey(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteApiKey(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.apiKeys });

      // Snapshot previous value
      const previousApiKeys = queryClient.getQueryData(queryKeys.apiKeys);

      // Optimistically update to the new value
      queryClient.setQueryData(queryKeys.apiKeys, (old: ApiKeyInfo[] | undefined) =>
        old?.filter((key) => key.id !== id)
      );

      // Return context with previous value
      return { previousApiKeys };
    },
    onError: (err, id, context) => {
      // Rollback to previous value on error
      if (context?.previousApiKeys) {
        queryClient.setQueryData(queryKeys.apiKeys, context.previousApiKeys);
      }
    },
    onSettled: () => {
      // Refetch to ensure server state matches client state
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
  });
}

export function useApiKeyAuditLogs(keyId: string | null, limit: number = 100) {
  return useQuery({
    queryKey: ['apiKeyAuditLogs', keyId, limit],
    queryFn: () => (keyId ? api.getApiKeyAuditLogs(keyId, limit) : []),
    enabled: !!keyId, // Only run query if keyId is provided
    staleTime: 0, // Don't cache - always fetch fresh data
    gcTime: 0, // Don't cache garbage either
  });
}

// Global Audit Logs
export function useAuditLogs(params?: {
  userId?: string;
  action?: string;
  category?: string;
  entityType?: string;
  entityId?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ['auditLogs', params],
    queryFn: () => api.getAuditLogs(params),
    placeholderData: keepPreviousData,
    staleTime: 10000, // Consider data fresh for 10 seconds
  });
}

export function useAuditStatistics(days: number = 30) {
  return useQuery({
    queryKey: ['auditStatistics', days],
    queryFn: () => api.getAuditStatistics(days),
    staleTime: 60000, // Stats can be cached for 1 minute
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

// Auth - Setup status (checked before login/setup flow)
export function useSetupStatus() {
  return useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: () => api.getSetupStatus(),
    staleTime: 0, // Don't cache - always need fresh setup status
    gcTime: 0, // Don't cache garbage either
    retry: false, // Don't retry setup check - likely a network/auth issue
  });
}

// Auth - Setup mutation
export function useSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: SetupDto) => api.setup(dto),
    onSuccess: () => {
      // Invalidate setup status and user info after successful setup
      queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

// Auth - Login mutation
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: LoginDto) => api.login(dto),
    onSuccess: () => {
      // Invalidate user info after successful login
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
      // Refetch all queries to get fresh authenticated data
      queryClient.refetchQueries();
    },
  });
}

// Auth - Get current user
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.me(),
    staleTime: 60000, // User info rarely changes - cache for 1 minute
    retry: false, // Don't retry if auth fails
  });
}

// Auth - Update password mutation
export function useUpdatePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: UpdatePasswordDto) => api.updatePassword(dto),
    onSuccess: () => {
      // Invalidate user info after password update
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

// Auth - Logout mutation
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      // Clear all queries after logout
      queryClient.clear();
      // Refetch setup status to know where to redirect
      queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
    },
  });
}

// Settings - Security (DB-stored)
export function useSecuritySettings() {
  return useQuery({
    queryKey: queryKeys.securitySettings,
    queryFn: () => api.getSecuritySettings(),
    staleTime: 60000, // Security settings rarely change - cache for 1 minute
  });
}

export function useUpdateSecuritySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<SecuritySettings>) =>
      api.updateSecuritySettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.securitySettings });
    },
  });
}
