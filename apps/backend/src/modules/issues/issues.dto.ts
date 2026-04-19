// Mirror the enums from schema
export const ISSUE_STATUSES = ['open', 'acknowledged', 'in_progress', 'resolved', 'ignored'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueSource = 'jellyfin' | 'sonarr' | 'radarr' | 'prowlarr' | 'docker' | 'system';

export interface IssueSearchDto {
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

export interface UpdateIssueDto {
  title?: string;
  description?: string;
  status?: IssueStatus;
  severity?: IssueSeverity;
  category?: string;
  notes?: string;
  resolvedBy?: string;
}

export interface MergeIssuesDto {
  issueIds: string[];
  newTitle?: string;
}

export interface BulkUpdateIssueStatusDto {
  issueIds: string[];
  status: IssueStatus;
  resolvedBy?: string;
}

export interface IssueStatsDto {
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

export interface IssueDetailDto {
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
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
  affectedUsersCount: number;
  affectedSessionsCount: number;
  impactScore: number;
  aiAnalysis: string | null;
  aiAnalysisAt: Date | null;
  aiSuggestedFix: string | null;
  relatedLinks: Array<{ title: string; url: string }> | null;
  notes: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  recentOccurrences?: Array<{
    id: string;
    timestamp: Date;
    userId: string | null;
    sessionId: string | null;
    message: string;
  }>;
}
