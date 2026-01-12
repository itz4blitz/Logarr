import { config } from './config';

const API_URL = config.apiUrl;

// Types
export interface Server {
  id: string;
  name: string;
  providerId: string;
  url: string;
  apiKey: string;
  logPath: string | null;
  isConnected: boolean;
  lastSeen: string | null;
  lastError: string | null;
  version: string | null;
  serverName: string | null;
  // File-based log ingestion settings
  fileIngestionEnabled: boolean;
  fileIngestionConnected: boolean;
  fileIngestionError: string | null;
  logPaths: string[] | null;
  logFilePatterns: string[] | null;
  lastFileSync: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServerDto {
  name: string;
  providerId: string;
  url: string;
  apiKey: string;
  logPath?: string;
  fileIngestionEnabled?: boolean;
  logPaths?: string[];
  logFilePatterns?: string[];
}

export interface UpdateServerDto {
  name?: string;
  url?: string;
  apiKey?: string;
  logPath?: string;
  fileIngestionEnabled?: boolean;
  logPaths?: string[];
  logFilePatterns?: string[];
}

export interface Provider {
  id: string;
  name: string;
  capabilities: {
    supportsRealTimeLogs: boolean;
    supportsActivityLog: boolean;
    supportsSessions: boolean;
    supportsWebhooks: boolean;
    supportsPlaybackHistory: boolean;
  };
}

export interface FilePathValidation {
  path: string;
  accessible: boolean;
  error?: string;
  files?: string[];
}

export interface FileIngestionStatus {
  enabled: boolean;
  connected: boolean;
  error?: string;
  paths?: FilePathValidation[];
}

export interface ConnectionStatus {
  connected: boolean;
  error?: string;
  serverInfo?: {
    name: string;
    version: string;
    id: string;
  };
  fileIngestion?: FileIngestionStatus | null;
}

export interface LogEntry {
  id: string;
  serverId: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string | null;
  sessionId: string | null;
  userId: string | null;
  deviceId: string | null;
  playbackId: string | null;
  metadata: Record<string, unknown> | null;
  rawLine: string | null;
  createdAt: string;
}

export interface LogSearchParams {
  serverId?: string;
  levels?: string[];
  sources?: string[];
  logSources?: string[];
  sessionId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface PaginatedLogs {
  data: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface LogStats {
  totalCount: number;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  debugCount: number;
  errorRate: number;
  topSources: { source: string; count: number }[];
  topErrors: { message: string; count: number; lastOccurrence: string }[];
}

export interface RelatedIssue {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'ignored';
  source: string;
  occurrenceCount: number;
}

export interface LogEntryDetails {
  id: string;
  serverId: string;
  timestamp: string;
  level: string;
  message: string;
  source: string | null;
  threadId: string | null;
  raw: string;
  sessionId: string | null;
  userId: string | null;
  deviceId: string | null;
  itemId: string | null;
  playSessionId: string | null;
  metadata: Record<string, unknown> | null;
  exception: string | null;
  stackTrace: string | null;
  createdAt: string;
  serverName: string | null;
  serverProviderId: string | null;
  serverUrl: string | null;
  relatedIssue: RelatedIssue | null;
}

export interface NowPlaying {
  itemId: string | null;
  itemName: string | null;
  itemType: string | null;
  seriesName: string | null;
  seasonName: string | null;
  positionTicks: string | null;
  runTimeTicks: string | null;
  isPaused: boolean;
  isMuted: boolean;
  isTranscoding: boolean;
  transcodeReasons: string[] | null;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
  playMethod: string | null;
  thumbnailUrl: string | null;
}

export interface Session {
  id: string;
  serverId: string;
  externalId: string;
  userId: string | null;
  userName: string | null;
  deviceId: string | null;
  deviceName: string | null;
  clientName: string | null;
  clientVersion: string | null;
  ipAddress: string | null;
  startedAt: string;
  endedAt: string | null;
  lastActivity: string;
  isActive: boolean;
  nowPlayingItemId: string | null;
  nowPlayingItemName: string | null;
  nowPlayingItemType: string | null;
  nowPlaying: NowPlaying | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceStatus {
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
}

export interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  service: string;
  timestamp: string;
  services: {
    api: ServiceStatus;
    database: ServiceStatus;
    redis: ServiceStatus;
  };
}

// Issue types
export type IssueStatus = 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'ignored';
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueSource =
  | 'jellyfin'
  | 'plex'
  | 'sonarr'
  | 'radarr'
  | 'prowlarr'
  | 'docker'
  | 'system';

export interface Issue {
  id: string;
  fingerprint: string;
  title: string;
  description: string | null;
  source: IssueSource;
  severity: IssueSeverity;
  status: IssueStatus;
  serverId: string | null;
  serverName?: string;
  category: string | null;
  errorPattern: string;
  sampleMessage: string;
  exceptionType: string | null;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  affectedUsersCount: number;
  affectedSessionsCount: number;
  impactScore: number;
  aiAnalysis: string | null;
  aiAnalysisAt: string | null;
  aiSuggestedFix: string | null;
  relatedLinks: Array<{ title: string; url: string }> | null;
  notes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  recentOccurrences?: Array<{
    id: string;
    timestamp: string;
    userId: string | null;
    sessionId: string | null;
    message: string;
  }>;
}

export interface IssueSearchParams {
  serverId?: string;
  sources?: IssueSource[];
  severities?: IssueSeverity[];
  statuses?: IssueStatus[];
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'impactScore' | 'occurrenceCount' | 'lastSeen' | 'firstSeen' | 'severity';
  sortOrder?: 'asc' | 'desc';
}

export interface IssueStats {
  totalIssues: number;
  openIssues: number;
  criticalIssues: number;
  highIssues: number;
  resolvedToday: number;
  newToday: number;
  bySource: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  topCategories: Array<{ category: string; count: number }>;
  averageImpactScore: number;
}

export interface UpdateIssueDto {
  title?: string;
  description?: string;
  status?: IssueStatus;
  severity?: IssueSeverity;
  category?: string;
  notes?: string;
  resolvedBy?: string;
}

// AI Provider types
export type AiProviderType = 'openai' | 'anthropic' | 'google' | 'ollama' | 'lmstudio';

export interface AiModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  maxOutput?: number;
  supportsVision?: boolean;
  supportsTools?: boolean;
}

export interface AiProviderInfo {
  id: AiProviderType;
  name: string;
  description: string;
  website: string;
  requiresApiKey: boolean;
  supportsBaseUrl: boolean;
  models: AiModelInfo[];
}

export interface AiProviderSettings {
  id: string;
  provider: AiProviderType;
  name: string;
  hasApiKey: boolean;
  baseUrl: string | null;
  model: string;
  maxTokens: number | null;
  temperature: number | null;
  isDefault: boolean;
  isEnabled: boolean;
  lastTestedAt: string | null;
  lastTestResult: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAiProviderDto {
  provider: AiProviderType;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  isDefault?: boolean;
  isEnabled?: boolean;
}

export interface UpdateAiProviderDto {
  name?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  isDefault?: boolean;
  isEnabled?: boolean;
}

export interface TestProviderResult {
  success: boolean;
  message: string;
  responseTime?: number;
  modelInfo?: {
    model: string;
    tokensUsed?: number;
  };
}

export interface AnalysisResult {
  analysis: string;
  suggestedFix?: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

export interface AiUsageStats {
  totalAnalyses: number;
  totalTokens: number;
  analysesByProvider: Record<string, { count: number; tokens: number }>;
  dailyUsage: Array<{ date: string; count: number; tokens: number }>;
}

export interface AiAnalysisHistoryItem {
  id: string;
  provider: string;
  prompt: string;
  response: string;
  tokensUsed: number | null;
  createdAt: string;
  serverId: string | null;
}

export interface AiAnalysisHistoryResponse {
  data: AiAnalysisHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface IssueAnalysisResult {
  issue: Issue;
  analysis: string;
  suggestedFix?: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

// Structured AI Analysis types
export interface StructuredAnalysis {
  rootCause: {
    identified: boolean;
    confidence: number;
    summary: string;
    explanation: string;
    evidence: string[];
  };
  impact: {
    severity: 'critical' | 'high' | 'medium' | 'low';
    summary: string;
    usersAffected: number;
    sessionsAffected: number;
  };
  recommendations: {
    priority: number;
    action: string;
    rationale: string;
    effort: 'low' | 'medium' | 'high';
    commands?: string[];
  }[];
  investigation: string[];
  additionalNotes?: string;
}

export interface AnalysisMetadata {
  provider: string;
  model: string;
  tokensUsed: number;
  generatedAt: string;
  contextSummary: {
    occurrencesIncluded: number;
    stackTracesIncluded: number;
    usersIncluded: number;
    sessionsIncluded: number;
  };
}

export interface DeepAnalysisResult {
  analysis: StructuredAnalysis;
  metadata: AnalysisMetadata;
  conversationId?: string;
}

export interface FollowUpResult {
  conversationId: string;
  response: string;
  tokensUsed: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokensUsed?: number;
}

export interface AnalysisConversation {
  id: string;
  issueId: string;
  messages: ConversationMessage[];
  provider: string;
  model: string;
  totalTokens: number;
  createdAt: string;
  updatedAt: string;
}

// Retention types
export interface RetentionConfig {
  enabled: boolean;
  infoRetentionDays: number;
  errorRetentionDays: number;
  cleanupCron: string;
  batchSize: number;
}

// Per-server storage stats
export interface ServerStorageStats {
  serverId: string;
  serverName: string;
  serverType: string;
  logCount: number;
  estimatedSizeBytes: number;
  estimatedSizeFormatted: string;
  oldestLogTimestamp: string | null;
  newestLogTimestamp: string | null;
  logCountsByLevel: {
    info: number;
    debug: number;
    warn: number;
    error: number;
  };
  ageDistribution: {
    last24h: number;
    last7d: number;
    last30d: number;
    last90d: number;
    older: number;
  };
  eligibleForCleanup: {
    info: number;
    debug: number;
    warn: number;
    error: number;
    total: number;
  };
}

export interface StorageStats {
  logCount: number;
  databaseSizeBytes: number;
  databaseSizeFormatted: string;
  oldestLogTimestamp: string | null;
  newestLogTimestamp: string | null;
  retentionConfig: RetentionConfig;
  logCountsByLevel: {
    info: number;
    debug: number;
    warn: number;
    error: number;
  };
  serverStats: ServerStorageStats[];
  ageDistribution: {
    last24h: number;
    last7d: number;
    last30d: number;
    last90d: number;
    older: number;
  };
  tableSizes?: {
    logEntries: number;
    issues: number;
    sessions: number;
    playbackEvents: number;
    total: number;
  };
}

export interface CleanupPreview {
  infoLogsToDelete: number;
  debugLogsToDelete: number;
  warnLogsToDelete: number;
  errorLogsToDelete: number;
  totalLogsToDelete: number;
  estimatedSpaceSavingsBytes: number;
  estimatedSpaceSavingsFormatted: string;
  infoCutoffDate: string;
  errorCutoffDate: string;
}

export interface RetentionResult {
  success: boolean;
  info: number;
  debug: number;
  warn: number;
  error: number;
  orphanedOccurrences: number;
  totalDeleted: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface RetentionSettings {
  enabled: boolean;
  infoRetentionDays: number;
  errorRetentionDays: number;
  batchSize: number;
}

export interface FileIngestionSettings {
  /** Maximum number of files to tail concurrently per server */
  maxConcurrentTailers: number;
  /** Only process files modified within the last N days on initial startup */
  maxFileAgeDays: number;
  /** Delay between starting each file tailer (ms) to spread out load */
  tailerStartDelayMs: number;
}

export interface RetentionHistoryItem {
  id: string;
  startedAt: string;
  completedAt: string | null;
  infoDeleted: number;
  debugDeleted: number;
  warnDeleted: number;
  errorDeleted: number;
  orphanedOccurrencesDeleted: number;
  totalDeleted: number;
  status: 'running' | 'completed' | 'failed';
  errorMessage: string | null;
}

// Dashboard types
export interface DashboardHealth {
  status: 'healthy' | 'warning' | 'critical';
  sources: { online: number; total: number };
  issues: { critical: number; high: number; open: number };
  activeStreams: number;
}

export interface ActivityHour {
  hour: string;
  error: number;
  warn: number;
  info: number;
  debug: number;
}

export interface HeatmapDay {
  day: string;
  hours: number[];
}

export interface TopLogSource {
  source: string;
  count: number;
  errorCount: number;
}

export interface LogDistribution {
  error: number;
  warn: number;
  info: number;
  debug: number;
  total: number;
  topSources: TopLogSource[];
}

export interface TrendMetric<T = number> {
  current: T;
  trend: number[];
  change: number;
}

export interface DashboardMetrics {
  errorRate: TrendMetric<number>;
  logVolume: { today: number; average: number; trend: number[] };
  sessionCount: { today: number; trend: number[] };
  issueCount: { open: number; trend: number[] };
}

export interface DashboardTopIssue {
  id: string;
  title: string;
  severity: string;
  occurrenceCount: number;
  impactScore: number;
}

export interface DashboardSource {
  id: string;
  name: string;
  providerId: string;
  isConnected: boolean;
  lastSeen: string | null;
  version: string | null;
  activeStreams: number;
  // File ingestion status
  fileIngestionEnabled: boolean;
  fileIngestionConnected: boolean;
}

export interface DashboardNowPlaying {
  id: string;
  userName: string | null;
  nowPlayingItemName: string | null;
  nowPlayingItemType: string | null;
  deviceName: string | null;
  clientName: string | null;
  progress: number;
  serverName: string;
}

export interface DashboardRecentEvent {
  id: string;
  type: 'issue_new' | 'issue_resolved' | 'server_status' | 'error_spike';
  title: string;
  timestamp: string;
  severity?: string;
}

export interface DashboardData {
  health: DashboardHealth;
  activityChart: ActivityHour[];
  activityHeatmap: HeatmapDay[];
  logDistribution: LogDistribution;
  metrics: DashboardMetrics;
  topIssues: DashboardTopIssue[];
  sources: DashboardSource[];
  nowPlaying: DashboardNowPlaying[];
  recentEvents: DashboardRecentEvent[];
}

// API Keys
export interface ApiKeyInfo {
  id: string;
  name: string;
  isEnabled: boolean;
  deviceInfo: string | null;
  rateLimit: number | null;
  rateLimitTtl: number | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  requestCount: number;
  scopes: string[];
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyDto {
  name: string;
  notes?: string;
  rateLimit?: number;
  rateLimitTtl?: number;
  expiresAt?: Date;
}

export interface UpdateApiKeyDto {
  name?: string;
  isEnabled?: boolean;
  notes?: string;
  rateLimit?: number;
  rateLimitTtl?: number;
  expiresAt?: Date;
}

export interface CreateApiKeyResponse {
  key: string;
  apiKey: ApiKeyInfo;
}

export interface ApiKeyAuditLog {
  id: string;
  keyId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  success: boolean;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  timestamp: string;
}

// Global Audit Log types
export type AuditLogAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'read'
  | 'login'
  | 'logout'
  | 'error'
  | 'export'
  | 'import'
  | 'sync'
  | 'test'
  | 'other';
export type AuditLogCategory =
  | 'auth'
  | 'server'
  | 'log_entry'
  | 'session'
  | 'playback'
  | 'issue'
  | 'ai_analysis'
  | 'api_key'
  | 'settings'
  | 'retention'
  | 'proxy'
  | 'other';

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  sessionId: string | null;
  action: AuditLogAction;
  category: AuditLogCategory;
  entityType: string;
  entityId: string | null;
  description: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  success: boolean;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  apiKeyId: string | null;
  timestamp: string;
}

export interface AuditStatistics {
  totalLogs: number;
  successCount: number;
  errorCount: number;
  byCategory: Record<string, number>;
  byAction: Record<string, number>;
  byUser: Array<{ userId: string; count: number }>;
}

// Auth types
export interface SetupStatus {
  setupRequired: boolean;
  setupToken?: string;
}

export interface SetupDto {
  username: string;
  password: string;
  setupToken: string;
}

export interface LoginDto {
  username: string;
  password: string;
}

export interface UpdatePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    username: string;
    createdAt: string;
  };
}

export interface AuthUser {
  username: string;
  createdAt: string | null;
}

export interface SecuritySettings {
  jwtExpirationMs: number;
  sessionTimeoutMs: number;
}

// API Client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options?.headers as Record<string, string> ?? {}),
    };

    // Add Authorization header if token exists
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Health
  async getHealth(): Promise<HealthCheck> {
    return this.request<HealthCheck>('');
  }

  // Dashboard
  async getDashboard(): Promise<DashboardData> {
    return this.request<DashboardData>('/dashboard');
  }

  // Servers
  async getServers(): Promise<Server[]> {
    return this.request<Server[]>('/servers');
  }

  async getServer(id: string): Promise<Server> {
    return this.request<Server>(`/servers/${id}`);
  }

  async createServer(data: CreateServerDto): Promise<Server> {
    return this.request<Server>('/servers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateServer(id: string, data: UpdateServerDto): Promise<Server> {
    return this.request<Server>(`/servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteServer(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/servers/${id}`, { method: 'DELETE' });
  }

  async testServerConnection(id: string): Promise<ConnectionStatus> {
    return this.request<ConnectionStatus>(`/servers/${id}/test`, {
      method: 'POST',
    });
  }

  async testAllConnections(): Promise<Record<string, ConnectionStatus>> {
    return this.request<Record<string, ConnectionStatus>>('/servers/test-all', {
      method: 'POST',
    });
  }

  async getProviders(): Promise<Provider[]> {
    return this.request<Provider[]>('/servers/providers');
  }

  // Logs
  async getLogs(params?: LogSearchParams): Promise<PaginatedLogs> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => searchParams.append(key, v));
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
    }
    const query = searchParams.toString();
    return this.request<PaginatedLogs>(`/logs${query ? `?${query}` : ''}`);
  }

  async getLog(id: string): Promise<LogEntry | null> {
    return this.request<LogEntry | null>(`/logs/${id}`);
  }

  async getLogDetails(id: string): Promise<LogEntryDetails | null> {
    return this.request<LogEntryDetails | null>(`/logs/${id}/details`);
  }

  async getLogStats(serverId?: string): Promise<LogStats> {
    const query = serverId ? `?serverId=${serverId}` : '';
    return this.request<LogStats>(`/logs/stats${query}`);
  }

  async getLogSources(serverId?: string): Promise<string[]> {
    const query = serverId ? `?serverId=${serverId}` : '';
    return this.request<string[]>(`/logs/sources${query}`);
  }

  // Sessions
  async getSessions(): Promise<Session[]> {
    return this.request<Session[]>('/sessions');
  }

  async getActiveSessions(): Promise<Session[]> {
    return this.request<Session[]>('/sessions/active');
  }

  async getSession(id: string): Promise<Session | null> {
    return this.request<Session | null>(`/sessions/${id}`);
  }

  async getSessionTimeline(id: string): Promise<unknown[]> {
    return this.request<unknown[]>(`/sessions/${id}/timeline`);
  }

  async getSessionLogs(id: string): Promise<LogEntry[]> {
    return this.request<LogEntry[]>(`/sessions/${id}/logs`);
  }

  // Issues
  async getIssues(params?: IssueSearchParams): Promise<Issue[]> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => searchParams.append(key, v));
          } else {
            searchParams.append(key, String(value));
          }
        }
      });
    }
    const query = searchParams.toString();
    return this.request<Issue[]>(`/issues${query ? `?${query}` : ''}`);
  }

  async getIssue(id: string): Promise<Issue> {
    return this.request<Issue>(`/issues/${id}`);
  }

  async getIssueStats(serverId?: string): Promise<IssueStats> {
    const query = serverId ? `?serverId=${serverId}` : '';
    return this.request<IssueStats>(`/issues/stats${query}`);
  }

  async getIssueCategories(): Promise<string[]> {
    return this.request<string[]>('/issues/categories');
  }

  async updateIssue(id: string, data: UpdateIssueDto): Promise<Issue> {
    return this.request<Issue>(`/issues/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async acknowledgeIssue(id: string): Promise<Issue> {
    return this.request<Issue>(`/issues/${id}/acknowledge`, {
      method: 'POST',
    });
  }

  async resolveIssue(id: string, resolvedBy?: string): Promise<Issue> {
    return this.request<Issue>(`/issues/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolvedBy }),
    });
  }

  async ignoreIssue(id: string): Promise<Issue> {
    return this.request<Issue>(`/issues/${id}/ignore`, {
      method: 'POST',
    });
  }

  async reopenIssue(id: string): Promise<Issue> {
    return this.request<Issue>(`/issues/${id}/reopen`, {
      method: 'POST',
    });
  }

  async mergeIssues(issueIds: string[], newTitle?: string): Promise<Issue> {
    return this.request<Issue>('/issues/merge', {
      method: 'POST',
      body: JSON.stringify({ issueIds, newTitle }),
    });
  }

  async backfillIssues(serverId?: string): Promise<{
    processedLogs: number;
    issuesCreated: number;
    issuesUpdated: number;
  }> {
    const query = serverId ? `?serverId=${serverId}` : '';
    return this.request(`/issues/backfill${query}`, {
      method: 'POST',
    });
  }

  async getIssueOccurrences(
    id: string,
    limit?: number,
    offset?: number
  ): Promise<{
    data: Array<{
      id: string;
      timestamp: string;
      userId: string | null;
      sessionId: string | null;
      serverId: string | null;
      message: string;
      level: string;
      source: string | null;
      serverName: string | null;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', String(limit));
    if (offset) params.append('offset', String(offset));
    const query = params.toString();
    return this.request(`/issues/${id}/occurrences${query ? `?${query}` : ''}`);
  }

  async getIssueTimeline(id: string): Promise<{
    hourly: Array<{ timestamp: string; count: number }>;
    daily: Array<{ timestamp: string; count: number }>;
    affectedUsers: string[];
  }> {
    return this.request(`/issues/${id}/timeline`);
  }

  async analyzeIssue(id: string, providerId?: string): Promise<DeepAnalysisResult> {
    return this.request<DeepAnalysisResult>(`/issues/${id}/analyze`, {
      method: 'POST',
      body: JSON.stringify({ providerId }),
    });
  }

  async analyzeIssueFollowUp(
    issueId: string,
    conversationId: string,
    question: string,
    providerId?: string
  ): Promise<FollowUpResult> {
    return this.request<FollowUpResult>(`/issues/${issueId}/analyze/followup`, {
      method: 'POST',
      body: JSON.stringify({ conversationId, question, providerId }),
    });
  }

  async getAnalysisConversation(
    issueId: string,
    conversationId: string
  ): Promise<AnalysisConversation> {
    return this.request<AnalysisConversation>(
      `/issues/${issueId}/analyze/conversation/${conversationId}`
    );
  }

  async getLatestAnalysisConversation(issueId: string): Promise<AnalysisConversation | null> {
    return this.request<AnalysisConversation | null>(`/issues/${issueId}/analyze/conversation`);
  }

  // Settings
  async getAvailableAiProviders(): Promise<AiProviderInfo[]> {
    return this.request<AiProviderInfo[]>('/settings/ai/providers');
  }

  async getAiProviderSettings(): Promise<AiProviderSettings[]> {
    return this.request<AiProviderSettings[]>('/settings/ai');
  }

  async getDefaultAiProvider(): Promise<AiProviderSettings | null> {
    return this.request<AiProviderSettings | null>('/settings/ai/default');
  }

  async getAiProviderSetting(id: string): Promise<AiProviderSettings> {
    return this.request<AiProviderSettings>(`/settings/ai/${id}`);
  }

  async createAiProviderSetting(data: CreateAiProviderDto): Promise<AiProviderSettings> {
    return this.request<AiProviderSettings>('/settings/ai', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateAiProviderSetting(
    id: string,
    data: UpdateAiProviderDto
  ): Promise<AiProviderSettings> {
    return this.request<AiProviderSettings>(`/settings/ai/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAiProviderSetting(id: string): Promise<void> {
    await this.request(`/settings/ai/${id}`, { method: 'DELETE' });
  }

  async testAiProvider(
    provider: AiProviderType,
    apiKey: string,
    model: string,
    baseUrl?: string
  ): Promise<TestProviderResult> {
    return this.request<TestProviderResult>('/settings/ai/test', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, model, baseUrl }),
    });
  }

  async testAiProviderSetting(id: string): Promise<TestProviderResult> {
    return this.request<TestProviderResult>(`/settings/ai/${id}/test`, {
      method: 'POST',
    });
  }

  async fetchAiProviderModels(
    provider: AiProviderType,
    apiKey: string,
    baseUrl?: string
  ): Promise<AiModelInfo[]> {
    return this.request<AiModelInfo[]>('/settings/ai/models', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey, baseUrl }),
    });
  }

  async fetchAiProviderModelsForSetting(id: string): Promise<AiModelInfo[]> {
    return this.request<AiModelInfo[]>(`/settings/ai/${id}/models`, {
      method: 'POST',
    });
  }

  async generateAiAnalysis(prompt: string, providerId?: string): Promise<AnalysisResult> {
    return this.request<AnalysisResult>('/settings/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ prompt, providerId }),
    });
  }

  async getAiUsageStats(params?: {
    startDate?: string;
    endDate?: string;
    provider?: string;
  }): Promise<AiUsageStats> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    if (params?.provider) searchParams.append('provider', params.provider);
    const query = searchParams.toString();
    return this.request<AiUsageStats>(`/settings/ai/stats${query ? `?${query}` : ''}`);
  }

  async getAiAnalysisHistory(params?: {
    limit?: number;
    offset?: number;
    provider?: string;
  }): Promise<AiAnalysisHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.limit !== undefined) searchParams.append('limit', String(params.limit));
    if (params?.offset !== undefined) searchParams.append('offset', String(params.offset));
    if (params?.provider) searchParams.append('provider', params.provider);
    const query = searchParams.toString();
    return this.request<AiAnalysisHistoryResponse>(
      `/settings/ai/history${query ? `?${query}` : ''}`
    );
  }

  // Retention
  async getRetentionConfig(): Promise<RetentionConfig> {
    return this.request<RetentionConfig>('/retention/config');
  }

  async getStorageStats(): Promise<StorageStats> {
    return this.request<StorageStats>('/retention/stats');
  }

  async getCleanupPreview(): Promise<CleanupPreview> {
    return this.request<CleanupPreview>('/retention/preview');
  }

  async runCleanup(): Promise<RetentionResult> {
    return this.request<RetentionResult>('/retention/run', {
      method: 'POST',
    });
  }

  // Retention Settings
  async getRetentionSettings(): Promise<RetentionSettings> {
    return this.request<RetentionSettings>('/retention/settings');
  }

  async updateRetentionSettings(settings: Partial<RetentionSettings>): Promise<RetentionSettings> {
    return this.request<RetentionSettings>('/retention/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  async getRetentionHistory(limit = 20): Promise<RetentionHistoryItem[]> {
    return this.request<RetentionHistoryItem[]>(`/retention/history?limit=${limit}`);
  }

  // Targeted Log Deletion
  async deleteServerLogs(serverId: string): Promise<{ deleted: number; durationMs: number }> {
    return this.request<{ deleted: number; durationMs: number }>(
      `/retention/logs/server/${serverId}`,
      { method: 'DELETE' }
    );
  }

  async deleteServerLogsByLevel(
    serverId: string,
    levels: string[]
  ): Promise<{ deleted: number; durationMs: number }> {
    return this.request<{ deleted: number; durationMs: number }>(
      `/retention/logs/server/${serverId}/level`,
      {
        method: 'DELETE',
        body: JSON.stringify({ levels }),
      }
    );
  }

  async deleteAllLogs(): Promise<{ deleted: number; durationMs: number }> {
    return this.request<{ deleted: number; durationMs: number }>('/retention/logs/all', {
      method: 'DELETE',
    });
  }

  // File Ingestion Settings
  async getFileIngestionSettings(): Promise<FileIngestionSettings> {
    return this.request<FileIngestionSettings>('/settings/file-ingestion');
  }

  async updateFileIngestionSettings(
    settings: Partial<FileIngestionSettings>
  ): Promise<FileIngestionSettings> {
    return this.request<FileIngestionSettings>('/settings/file-ingestion', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // API Keys
  async getApiKeys(): Promise<ApiKeyInfo[]> {
    return this.request<ApiKeyInfo[]>('/settings/api-keys');
  }

  async createApiKey(data: CreateApiKeyDto): Promise<CreateApiKeyResponse> {
    return this.request<CreateApiKeyResponse>('/settings/api-keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateApiKey(id: string, data: UpdateApiKeyDto): Promise<ApiKeyInfo> {
    return this.request<ApiKeyInfo>(`/settings/api-keys/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteApiKey(id: string): Promise<void> {
    return this.request<void>(`/settings/api-keys/${id}`, {
      method: 'DELETE',
    });
  }

  async getApiKeyAuditLogs(
    id: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<ApiKeyAuditLog[]> {
    return this.request<ApiKeyAuditLog[]>(
      `/settings/api-keys/${id}/audit?limit=${limit}&offset=${offset}`
    );
  }

  // Global Audit Logs
  async getAuditLogs(params?: {
    userId?: string;
    action?: string;
    category?: string;
    entityType?: string;
    entityId?: string;
    success?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> {
    const searchParams = new URLSearchParams();
    if (params?.userId !== undefined) searchParams.set('userId', params.userId);
    if (params?.action !== undefined) searchParams.set('action', params.action);
    if (params?.category !== undefined) searchParams.set('category', params.category);
    if (params?.entityType !== undefined) searchParams.set('entityType', params.entityType);
    if (params?.entityId !== undefined) searchParams.set('entityId', params.entityId);
    if (params?.success !== undefined) searchParams.set('success', params.success.toString());
    if (params?.limit !== undefined) searchParams.set('limit', params.limit.toString());
    if (params?.offset !== undefined) searchParams.set('offset', params.offset.toString());

    const queryString = searchParams.toString();
    return this.request<AuditLogEntry[]>(`/settings/audit${queryString ? `?${queryString}` : ''}`);
  }

  async getAuditStatistics(days: number = 30): Promise<AuditStatistics> {
    return this.request<AuditStatistics>(`/settings/audit/statistics?days=${days}`);
  }

  // Token helpers
  private setToken(token: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  private clearToken(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private hasToken(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('auth_token') !== null;
  }

  // Auth methods (setup/login don't need auth token)
  async getSetupStatus(): Promise<SetupStatus> {
    return this.request<SetupStatus>('/auth/setup');
  }

  async setup(dto: SetupDto): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    // Store token on successful setup
    this.setToken(response.accessToken);
    return response;
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    // Store token on successful login
    this.setToken(response.accessToken);
    return response;
  }

  // Methods below require auth token (included automatically via request())
  async me(): Promise<AuthUser> {
    return this.request<AuthUser>('/auth/me');
  }

  async updatePassword(dto: UpdatePasswordDto): Promise<void> {
    return this.request<void>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify(dto),
    });
  }

  async logout(): Promise<void> {
    const response = await this.request<void>('/auth/logout', {
      method: 'POST',
    });
    // Clear token on logout
    this.clearToken();
    return response;
  }

  async getSecuritySettings(): Promise<SecuritySettings> {
    return this.request<SecuritySettings>('/settings/security');
  }

  async updateSecuritySettings(
    settings: Partial<SecuritySettings>
  ): Promise<SecuritySettings> {
    return this.request<SecuritySettings>('/settings/security', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // Check if user is authenticated (has a valid token)
  isAuthenticated(): boolean {
    return this.hasToken();
  }
}

export const api = new ApiClient(API_URL);
