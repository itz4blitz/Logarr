'use client';

import { format, formatDistanceToNow } from 'date-fns';
import {
  Search,
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  X,
  Clock,
  Users,
  Activity,
  TrendingUp,
  MoreVertical,
  Eye,
  CheckCircle,
  XCircle,
  RefreshCw,
  Database,
  Loader2,
  ExternalLink,
  BarChart3,
  Calendar,
  Server,
  Sparkles,
  Settings,
  Copy,
  Check,
  Lightbulb,
  BookOpen,
  Zap,
  Target,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useCallback, useRef, useEffect, useMemo, Suspense } from 'react';
import { toast } from 'sonner';

import type {
  Issue,
  IssueSeverity,
  IssueStatus,
  IssueSource,
  DeepAnalysisResult,
  ConversationMessage,
} from '@/lib/api';

import { AnalysisDisplay } from '@/components/analysis-display';
import { ProviderIcon } from '@/components/provider-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useIssues,
  useIssueStats,
  useAcknowledgeIssue,
  useResolveIssue,
  useIgnoreIssue,
  useReopenIssue,
  useBackfillIssues,
  useIssueOccurrences,
  useIssueTimeline,
  useIssue,
  useAnalyzeIssue,
  useDefaultAiProvider,
} from '@/hooks/use-api';
import { useIssueSocket, type BackfillProgress } from '@/hooks/use-issue-socket';
import { cn } from '@/lib/utils';

const SEVERITIES: IssueSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
const ROW_HEIGHT = 52; // Height of each issue row - fixed height for consistent sizing
const PAGINATION_HEIGHT = 48;

// Copy button component
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('h-7 gap-1.5 text-xs', className)}
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-500" />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy
        </>
      )}
    </Button>
  );
}

// Backfill Progress Dialog
function BackfillProgressDialog({
  open,
  progress,
  onClose,
}: {
  open: boolean;
  progress: BackfillProgress | null;
  onClose: () => void;
}) {
  const percentage = progress?.totalLogs
    ? Math.round((progress.processedLogs / progress.totalLogs) * 100)
    : 0;

  const isComplete = progress?.status === 'completed';
  const isError = progress?.status === 'error';
  const isAlreadyCurrent = isComplete && progress?.totalLogs === 0;
  const hasNewWork =
    (isComplete && (progress?.issuesCreated ?? 0) > 0) || (progress?.issuesUpdated ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && isComplete && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isAlreadyCurrent ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                All Logs Up to Date
              </>
            ) : isComplete ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-500" />
                Backfill Complete
              </>
            ) : isError ? (
              <>
                <AlertCircle className="h-5 w-5 text-red-500" />
                Backfill Failed
              </>
            ) : (
              <>
                <Loader2 className="text-primary h-5 w-5 animate-spin" />
                Processing Logs...
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isAlreadyCurrent
              ? 'All existing logs have already been processed. No new issues to detect.'
              : isComplete
                ? hasNewWork
                  ? 'All logs have been processed and issues have been detected.'
                  : 'All logs have been processed. No new issues were found.'
                : isError
                  ? progress?.error || 'An error occurred during backfill.'
                  : 'Scanning existing logs for errors and warnings...'}
          </DialogDescription>
        </DialogHeader>

        {isAlreadyCurrent ? (
          // Show a friendly "all caught up" state
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <p className="text-muted-foreground max-w-xs text-sm">
              Your issue tracking is current. New logs will be automatically processed as they
              arrive.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{isComplete ? '100%' : `${percentage}%`}</span>
              </div>
              <Progress value={isComplete ? 100 : percentage} className="h-2" />
              <div className="text-muted-foreground flex justify-between text-xs">
                <span>
                  {progress?.processedLogs?.toLocaleString() || 0} /{' '}
                  {progress?.totalLogs?.toLocaleString() || 0} logs
                </span>
                {progress?.currentBatch !== undefined && progress?.totalBatches !== undefined && (
                  <span>
                    Batch {progress.currentBatch} of {progress.totalBatches}
                  </span>
                )}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/30 rounded-lg border border-white/5 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  <span className="text-muted-foreground text-xs">Issues Created</span>
                </div>
                <p className="text-xl font-bold">{progress?.issuesCreated || 0}</p>
              </div>
              <div className="bg-muted/30 rounded-lg border border-white/5 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-blue-500" />
                  <span className="text-muted-foreground text-xs">Issues Updated</span>
                </div>
                <p className="text-xl font-bold">{progress?.issuesUpdated || 0}</p>
              </div>
            </div>
          </div>
        )}

        {isComplete && (
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const config: Record<IssueSeverity, { color: string; icon: React.ReactNode }> = {
    critical: {
      color: 'bg-red-500/10 text-red-500 border-red-500/20',
      icon: <AlertOctagon className="h-3 w-3" />,
    },
    high: {
      color: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    medium: {
      color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      icon: <AlertCircle className="h-3 w-3" />,
    },
    low: {
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      icon: <Info className="h-3 w-3" />,
    },
    info: {
      color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      icon: <Info className="h-3 w-3" />,
    },
  };

  const { color, icon } = config[severity];

  return (
    <Badge variant="outline" className={cn('flex items-center gap-1 text-xs capitalize', color)}>
      {icon}
      {severity}
    </Badge>
  );
}

function StatusBadge({ status }: { status: IssueStatus }) {
  const config: Record<IssueStatus, { color: string; icon: React.ReactNode }> = {
    open: {
      color: 'bg-red-500/10 text-red-500 border-red-500/20',
      icon: <AlertCircle className="h-3 w-3" />,
    },
    acknowledged: {
      color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      icon: <Eye className="h-3 w-3" />,
    },
    in_progress: {
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      icon: <RefreshCw className="h-3 w-3" />,
    },
    resolved: {
      color: 'bg-green-500/10 text-green-500 border-green-500/20',
      icon: <CheckCircle className="h-3 w-3" />,
    },
    ignored: {
      color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      icon: <XCircle className="h-3 w-3" />,
    },
  };

  const { color, icon } = config[status];
  const label = status.replace('_', ' ');

  return (
    <Badge variant="outline" className={cn('flex items-center gap-1 text-xs capitalize', color)}>
      {icon}
      {label}
    </Badge>
  );
}

function ImpactScoreBar({ score }: { score: number }) {
  const getColor = () => {
    if (score >= 75) return 'bg-red-500';
    if (score >= 50) return 'bg-orange-500';
    if (score >= 25) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="bg-muted h-2 w-16 overflow-hidden rounded-full">
          <div
            className={cn('h-full rounded-full transition-all', getColor())}
            style={{ width: `${score}%` }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>Impact Score: {score}/100</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Bar chart component for timeline visualization
function BarChart({
  data,
  className,
}: {
  data: { count: number; hour?: string; date?: string }[];
  className?: string;
}) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={cn('flex h-full w-full min-w-0 items-end gap-px', className)}>
      {data.map((d, i) => {
        const height = (d.count / max) * 100;
        const hasValue = d.count > 0;
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'min-w-0 flex-1 cursor-default rounded-t-lg transition-all',
                  hasValue ? 'bg-primary/80 hover:bg-primary' : 'bg-muted/30'
                )}
                style={{ height: `${Math.max(height, 2)}%` }}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {d.count} occurrence{d.count !== 1 ? 's' : ''}
                {d.hour && ` at ${d.hour}`}
                {d.date && ` on ${d.date}`}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// Circular progress component for impact score
function ImpactScoreCircle({ score, size = 'lg' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeConfig = {
    sm: { width: 48, stroke: 4 },
    md: { width: 64, stroke: 5 },
    lg: { width: 80, stroke: 6 },
  };
  const { width, stroke } = sizeConfig[size];
  const radius = (width - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getColor = () => {
    if (score >= 75) return 'text-red-500';
    if (score >= 50) return 'text-orange-500';
    if (score >= 25) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="relative" style={{ width, height: width }}>
      <svg className="-rotate-90 transform" width={width} height={width}>
        {/* Background circle */}
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={width / 2}
          cy={width / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={cn('transition-all duration-500', getColor())}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            'font-bold',
            size === 'lg' ? 'text-lg' : size === 'md' ? 'text-base' : 'text-sm'
          )}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

// Issue Detail Modal - Redesigned
function IssueDetailModal({
  issueId,
  open,
  onClose,
  onAction,
}: {
  issueId: string | null;
  open: boolean;
  onClose: () => void;
  onAction: (action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen') => void;
}) {
  const [occurrencesPage, setOccurrencesPage] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [occurrenceSort, setOccurrenceSort] = useState<'newest' | 'oldest'>('newest');
  const [analysisResult, setAnalysisResult] = useState<DeepAnalysisResult | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);
  const pageSize = 10;

  const { data: issue, isLoading: issueLoading, refetch: refetchIssue } = useIssue(issueId || '');
  const { data: occurrencesData, isLoading: occurrencesLoading } = useIssueOccurrences(
    issueId || '',
    pageSize,
    occurrencesPage * pageSize
  );
  const { data: timeline, isLoading: timelineLoading } = useIssueTimeline(issueId || '');
  const { data: defaultAiProvider } = useDefaultAiProvider();
  const analyzeIssue = useAnalyzeIssue();

  const handleAnalyze = async () => {
    if (!issueId) return;

    try {
      const result = await analyzeIssue.mutateAsync({ id: issueId });
      setAnalysisResult(result);
      // Initialize conversation history with the first assistant message
      if (result.conversationId) {
        setConversationHistory([
          {
            role: 'assistant',
            content: JSON.stringify(result.analysis),
            timestamp: result.metadata.generatedAt,
          },
        ]);
      }
      toast.success('AI analysis generated successfully');
      refetchIssue();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate AI analysis');
    }
  };

  const handleFollowUp = async (question: string) => {
    if (!issueId || !analysisResult?.conversationId) return;

    setIsFollowUpLoading(true);
    try {
      const { api } = await import('@/lib/api');
      const result = await api.analyzeIssueFollowUp(
        issueId,
        analysisResult.conversationId,
        question
      );

      // Add both user question and AI response to conversation history
      setConversationHistory((prev) => [
        ...prev,
        { role: 'user', content: question, timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: result.response,
          timestamp: new Date().toISOString(),
          tokensUsed: result.tokensUsed,
        },
      ]);

      toast.success('Follow-up response received');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to get follow-up response');
    } finally {
      setIsFollowUpLoading(false);
    }
  };

  const sourceToProvider: Record<IssueSource, string> = {
    jellyfin: 'jellyfin',
    plex: 'plex',
    sonarr: 'sonarr',
    radarr: 'radarr',
    prowlarr: 'prowlarr',
    docker: 'docker',
    system: 'system',
  };

  const getSeverityGradient = (severity: IssueSeverity) => {
    switch (severity) {
      case 'critical':
        return 'from-red-500/20 via-red-500/5 to-transparent';
      case 'high':
        return 'from-orange-500/20 via-orange-500/5 to-transparent';
      case 'medium':
        return 'from-yellow-500/20 via-yellow-500/5 to-transparent';
      case 'low':
        return 'from-blue-500/20 via-blue-500/5 to-transparent';
      default:
        return 'from-gray-500/20 via-gray-500/5 to-transparent';
    }
  };

  if (!issueId) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-background flex h-[85vh] w-full max-w-[95vw] flex-col gap-0 overflow-hidden rounded-xl border border-white/20 p-0 shadow-2xl ring-1 ring-white/10 sm:max-w-4xl">
        {issueLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-12">
            <DialogTitle className="sr-only">Loading Issue</DialogTitle>
            <Loader2 className="text-primary h-10 w-10 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading issue details...</p>
          </div>
        ) : issue ? (
          <>
            {/* Hero Header with gradient based on severity */}
            <div
              className={cn(
                'relative overflow-hidden border-b border-white/10',
                `bg-linear-to-b ${getSeverityGradient(issue.severity)}`
              )}
            >
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-5">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
                    backgroundSize: '24px 24px',
                  }}
                />
              </div>

              <DialogHeader className="relative p-4 pb-4 sm:p-6">
                {/* Top row: Provider, Status, Actions */}
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <ProviderIcon providerId={sourceToProvider[issue.source]} size="lg" />
                      <div
                        className={cn(
                          'border-background absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full border-2',
                          issue.status === 'open' && 'bg-red-500',
                          issue.status === 'acknowledged' && 'bg-yellow-500',
                          issue.status === 'in_progress' && 'bg-blue-500',
                          issue.status === 'resolved' && 'bg-green-500',
                          issue.status === 'ignored' && 'bg-gray-500'
                        )}
                      >
                        {issue.status === 'resolved' && (
                          <CheckCircle className="h-2.5 w-2.5 text-white" />
                        )}
                        {issue.status === 'open' && (
                          <AlertCircle className="h-2.5 w-2.5 text-white" />
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                        {issue.source} Issue
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <SeverityBadge severity={issue.severity} />
                        <StatusBadge status={issue.status} />
                      </div>
                    </div>
                  </div>

                  {/* Action buttons - mr-8 to avoid overlap with dialog close button */}
                  <div className="flex flex-wrap items-center gap-2 sm:mr-8">
                    {issue.status === 'open' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAction('acknowledge')}
                        className="bg-background/50 border-white/10 backdrop-blur-sm hover:border-yellow-500/30 hover:bg-yellow-500/10 hover:text-yellow-500"
                      >
                        <Eye className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Acknowledge</span>
                      </Button>
                    )}
                    {issue.status !== 'resolved' && issue.status !== 'ignored' && (
                      <Button
                        size="sm"
                        onClick={() => onAction('resolve')}
                        className="bg-green-600 text-white shadow-lg shadow-green-500/20 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Resolve</span>
                      </Button>
                    )}
                    {issue.status !== 'ignored' && issue.status !== 'resolved' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAction('ignore')}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <XCircle className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Ignore</span>
                      </Button>
                    )}
                    {(issue.status === 'resolved' || issue.status === 'ignored') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAction('reopen')}
                        className="bg-background/50 border-white/10 backdrop-blur-sm"
                      >
                        <RefreshCw className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Reopen</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Title */}
                <DialogTitle className="pr-8 text-xl leading-tight font-semibold">
                  {issue.title}
                </DialogTitle>
                <DialogDescription className="mt-2 flex items-center gap-3 text-sm">
                  {issue.category && (
                    <Badge variant="secondary" className="text-xs font-normal">
                      {issue.category}
                    </Badge>
                  )}
                  {issue.exceptionType && (
                    <code className="bg-muted/50 rounded px-1.5 py-0.5 font-mono text-xs">
                      {issue.exceptionType}
                    </code>
                  )}
                </DialogDescription>
              </DialogHeader>

              {/* Quick stats bar */}
              <div className="relative px-4 pb-4 sm:px-6">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                  <div className="bg-background/40 flex items-center gap-3 rounded-xl border border-white/5 px-4 py-3 backdrop-blur-sm">
                    <div className="bg-primary/10 rounded-lg p-2">
                      <Activity className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{issue.occurrenceCount.toLocaleString()}</p>
                      <p className="text-muted-foreground text-xs">Occurrences</p>
                    </div>
                  </div>
                  <div className="bg-background/40 flex items-center gap-3 rounded-xl border border-white/5 px-4 py-3 backdrop-blur-sm">
                    <div className="rounded-lg bg-blue-500/10 p-2">
                      <Users className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">{issue.affectedUsersCount}</p>
                      <p className="text-muted-foreground text-xs">Users Affected</p>
                    </div>
                  </div>
                  <div className="bg-background/40 flex items-center gap-3 rounded-xl border border-white/5 px-4 py-3 backdrop-blur-sm">
                    <ImpactScoreCircle score={issue.impactScore} size="sm" />
                    <div>
                      <p className="text-muted-foreground text-xs">Impact Score</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">out of 100</p>
                    </div>
                  </div>
                  <div className="bg-background/40 flex items-center gap-3 rounded-xl border border-white/5 px-4 py-3 backdrop-blur-sm">
                    <div className="rounded-lg bg-orange-500/10 p-2">
                      <Clock className="h-4 w-4 text-orange-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {formatDistanceToNow(new Date(issue.lastSeen), { addSuffix: false })}
                      </p>
                      <p className="text-muted-foreground text-xs">Since last seen</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs Navigation - Pill/Segment Style */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="shrink-0 border-b border-white/5 px-4 py-3 sm:px-6">
                <TabsList className="bg-muted/30 h-10 w-full gap-1 rounded-lg p-1">
                  <TabsTrigger
                    value="overview"
                    className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
                  >
                    <Info className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Overview</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="timeline"
                    className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
                  >
                    <BarChart3 className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Timeline</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="occurrences"
                    className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
                  >
                    <Activity className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Occurrences</span>
                    {issue.occurrenceCount > 0 && (
                      <span className="bg-primary/20 text-primary ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium sm:ml-1.5">
                        {issue.occurrenceCount > 99 ? '99+' : issue.occurrenceCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="ai"
                    className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
                  >
                    <Sparkles className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">AI Analysis</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">
                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-0 h-full data-[state=inactive]:hidden">
                  <ScrollArea className="h-full" alwaysShowScrollbar>
                    <div className="space-y-6 p-4 sm:p-6">
                      {/* Sample Error Message - Full Width */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="flex items-center gap-2 text-sm font-medium">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            Sample Error Message
                          </h4>
                          <div className="flex items-center gap-2">
                            <CopyButton text={issue.sampleMessage || ''} />
                            <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                              <Link href={`/logs?fingerprint=${issue.fingerprint}`}>
                                <ExternalLink className="mr-1 h-3 w-3" />
                                View in Logs
                              </Link>
                            </Button>
                          </div>
                        </div>
                        <div className="group relative">
                          <div className="absolute -inset-px rounded-xl bg-linear-to-r from-red-500/20 to-orange-500/20 opacity-50" />
                          <div className="bg-muted/50 relative max-h-32 overflow-hidden overflow-y-auto rounded-xl border border-white/5 p-4">
                            <pre className="text-muted-foreground font-mono text-sm leading-relaxed break-all whitespace-pre-wrap">
                              {issue.sampleMessage || 'No sample message available'}
                            </pre>
                          </div>
                        </div>
                      </div>

                      {/* Two column layout */}
                      <div className="grid gap-6 md:grid-cols-2">
                        {/* Left column - Details */}
                        <div className="min-w-0 space-y-4">
                          {/* Combined Details Card */}
                          <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                            <div className="space-y-4 text-sm">
                              {/* Timeline info */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-muted-foreground text-xs">First seen</span>
                                  <p className="font-medium">
                                    {format(new Date(issue.firstSeen), 'MMM d, HH:mm')}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground text-xs">Last seen</span>
                                  <p className="font-medium">
                                    {format(new Date(issue.lastSeen), 'MMM d, HH:mm')}
                                  </p>
                                </div>
                              </div>

                              <Separator />

                              {/* Source info */}
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-muted-foreground text-xs">Category</span>
                                  <p className="font-medium">{issue.category || '—'}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground text-xs">Active for</span>
                                  <p className="text-primary font-medium">
                                    {formatDistanceToNow(new Date(issue.firstSeen), {
                                      addSuffix: false,
                                    })}
                                  </p>
                                </div>
                              </div>

                              <Separator />

                              {/* Fingerprint - full with copy */}
                              <div>
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                                    Fingerprint
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Info className="text-muted-foreground/50 h-3 w-3 cursor-help" />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-xs">
                                          A unique hash used to group similar errors.
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </span>
                                  <CopyButton
                                    text={issue.fingerprint || ''}
                                    className="h-5 px-1.5"
                                  />
                                </div>
                                <code className="text-muted-foreground bg-muted/30 block rounded px-2 py-1.5 font-mono text-xs break-all">
                                  {issue.fingerprint}
                                </code>
                              </div>
                            </div>
                          </div>

                          {/* Notes if present */}
                          {issue.notes && (
                            <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                              <h4 className="mb-2 text-sm font-medium">Notes</h4>
                              <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                                {issue.notes}
                              </p>
                            </div>
                          )}

                          {/* Related Links */}
                          {issue.relatedLinks && issue.relatedLinks.length > 0 && (
                            <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                              <h4 className="mb-3 text-sm font-medium">Related Resources</h4>
                              <div className="space-y-2">
                                {issue.relatedLinks.slice(0, 3).map((link, i) => (
                                  <a
                                    key={i}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-muted-foreground hover:text-primary flex items-center gap-2 text-sm transition-colors"
                                  >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{link.title}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right column - AI & Actions */}
                        <div className="min-w-0 space-y-4">
                          {/* AI Insight - rendered summary or analyze button */}
                          {issue.aiAnalysis ? (
                            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                              <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="h-4 w-4 text-violet-400" />
                                  <h4 className="text-sm font-medium">AI Summary</h4>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-violet-400 hover:text-violet-300"
                                  onClick={() => setActiveTab('ai')}
                                >
                                  Full analysis →
                                </Button>
                              </div>
                              <p className="text-muted-foreground text-sm leading-relaxed">
                                {/* Extract first sentence or first 150 chars as summary */}
                                {(() => {
                                  const text = issue.aiAnalysis
                                    .replace(/^#+\s*.+\n*/gm, '')
                                    .replace(/\*\*/g, '')
                                    .trim();
                                  const firstSentence = text.match(/^[^.!?]+[.!?]/)?.[0];
                                  return (
                                    firstSentence ||
                                    text.substring(0, 150) + (text.length > 150 ? '...' : '')
                                  );
                                })()}
                              </p>
                            </div>
                          ) : defaultAiProvider ? (
                            <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                              <div className="flex items-center gap-3">
                                <div className="rounded-lg bg-violet-500/10 p-2">
                                  <Sparkles className="h-5 w-5 text-violet-400" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium">AI Analysis Available</p>
                                  <p className="text-muted-foreground text-xs">
                                    Get insights about this issue
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setActiveTab('ai');
                                    handleAnalyze();
                                  }}
                                  disabled={analyzeIssue.isPending}
                                  className="bg-violet-600 hover:bg-violet-700"
                                >
                                  {analyzeIssue.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    'Analyze'
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          {/* Resolution Info */}
                          {issue.resolvedAt && (
                            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                              <div className="mb-2 flex items-center gap-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <h4 className="text-sm font-medium text-green-500">Resolved</h4>
                              </div>
                              <p className="text-muted-foreground text-sm">
                                {format(new Date(issue.resolvedAt), "MMM d, yyyy 'at' h:mm a")}
                              </p>
                              {issue.resolvedBy && (
                                <p className="text-muted-foreground mt-1 text-xs">
                                  by {issue.resolvedBy}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Full-width 24h Activity Chart */}
                      {timeline?.hourly && timeline.hourly.length > 0 && (
                        <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <h4 className="flex items-center gap-2 text-sm font-medium">
                              <BarChart3 className="text-muted-foreground h-4 w-4" />
                              24h Activity
                            </h4>
                            <span className="text-muted-foreground text-xs">
                              {timeline.hourly
                                .reduce((sum, d) => sum + d.count, 0)
                                .toLocaleString()}{' '}
                              events
                            </span>
                          </div>
                          <div className="h-24 w-full">
                            <BarChart data={timeline.hourly} />
                          </div>
                          <div className="text-muted-foreground mt-2 flex justify-between text-[10px]">
                            <span>24h ago</span>
                            <span>Now</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Timeline Tab */}
                <TabsContent value="timeline" className="mt-0 h-full data-[state=inactive]:hidden">
                  <ScrollArea className="h-full" alwaysShowScrollbar>
                    <div className="space-y-6 p-4 sm:p-6">
                      {timelineLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                        </div>
                      ) : timeline ? (
                        <>
                          {/* Summary Stats Row */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                              <div className="mb-1 flex items-center gap-2">
                                <Activity className="text-primary h-4 w-4" />
                                <span className="text-muted-foreground text-xs">24h Total</span>
                              </div>
                              <p className="text-2xl font-bold">
                                {timeline.hourly?.reduce((sum, d) => sum + d.count, 0) || 0}
                              </p>
                            </div>
                            <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                              <div className="mb-1 flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-orange-500" />
                                <span className="text-muted-foreground text-xs">Peak Hour</span>
                              </div>
                              <p className="text-2xl font-bold">
                                {timeline.hourly && timeline.hourly.length > 0
                                  ? Math.max(...timeline.hourly.map((d) => d.count))
                                  : 0}
                              </p>
                            </div>
                            <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                              <div className="mb-1 flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-blue-500" />
                                <span className="text-muted-foreground text-xs">30d Total</span>
                              </div>
                              <p className="text-2xl font-bold">
                                {timeline.daily?.reduce((sum, d) => sum + d.count, 0) || 0}
                              </p>
                            </div>
                          </div>

                          {/* 24 Hour Chart */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="flex items-center gap-2 text-sm font-medium">
                                <Clock className="text-muted-foreground h-4 w-4" />
                                Last 24 Hours
                              </h4>
                              {timeline.hourly && timeline.hourly.length > 0 && (
                                <p className="text-muted-foreground text-xs">
                                  {timeline.hourly.reduce((sum, d) => sum + d.count, 0)} total
                                  occurrences
                                </p>
                              )}
                            </div>
                            <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                              {timeline.hourly && timeline.hourly.length > 0 ? (
                                <div className="space-y-3">
                                  <div className="h-32">
                                    <BarChart data={timeline.hourly} />
                                  </div>
                                  <div className="text-muted-foreground flex justify-between border-t border-white/5 pt-2 text-xs">
                                    <span>24 hours ago</span>
                                    <span>12 hours ago</span>
                                    <span>Now</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-muted-foreground flex flex-col items-center justify-center py-8">
                                  <BarChart3 className="mb-2 h-8 w-8 opacity-50" />
                                  <p className="text-sm">No occurrences in the last 24 hours</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 30 Day Chart */}
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="flex items-center gap-2 text-sm font-medium">
                                <Calendar className="text-muted-foreground h-4 w-4" />
                                Last 30 Days
                              </h4>
                              {timeline.daily && timeline.daily.length > 0 && (
                                <p className="text-muted-foreground text-xs">
                                  {timeline.daily.reduce((sum, d) => sum + d.count, 0)} total
                                  occurrences
                                </p>
                              )}
                            </div>
                            <div className="bg-muted/20 rounded-xl border border-white/10 p-4">
                              {timeline.daily && timeline.daily.length > 0 ? (
                                <div className="space-y-3">
                                  <div className="h-32">
                                    <BarChart data={timeline.daily} />
                                  </div>
                                  <div className="text-muted-foreground flex justify-between border-t border-white/5 pt-2 text-xs">
                                    <span>30 days ago</span>
                                    <span>15 days ago</span>
                                    <span>Today</span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-muted-foreground flex flex-col items-center justify-center py-8">
                                  <Calendar className="mb-2 h-8 w-8 opacity-50" />
                                  <p className="text-sm">No historical data available</p>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Affected Users */}
                          {timeline.affectedUsers && timeline.affectedUsers.length > 0 && (
                            <div className="space-y-4">
                              <h4 className="flex items-center gap-2 text-sm font-medium">
                                <Users className="text-muted-foreground h-4 w-4" />
                                Affected Users ({timeline.affectedUsers.length})
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {timeline.affectedUsers.map((user, i) => (
                                  <Badge key={i} variant="secondary" className="px-3 py-1 text-xs">
                                    {user}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
                          <BarChart3 className="mb-3 h-12 w-12 opacity-30" />
                          <p className="text-sm">No timeline data available</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Occurrences Tab */}
                <TabsContent
                  value="occurrences"
                  className="mt-0 h-full data-[state=inactive]:hidden"
                >
                  <ScrollArea className="h-full" alwaysShowScrollbar>
                    <div className="p-4 sm:p-6">
                      {occurrencesLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                        </div>
                      ) : occurrencesData?.data && occurrencesData.data.length > 0 ? (
                        <div className="space-y-4">
                          {/* Filter/Sort Bar */}
                          <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-xs">
                                Showing {occurrencesData.data.length} of{' '}
                                {occurrencesData.total.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Select
                                value={occurrenceSort}
                                onValueChange={(v) => setOccurrenceSort(v as 'newest' | 'oldest')}
                              >
                                <SelectTrigger className="bg-background/50 h-7 w-[100px] text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="newest">Newest</SelectItem>
                                  <SelectItem value="oldest">Oldest</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* Occurrence list */}
                          <div className="space-y-3">
                            {[...occurrencesData.data]
                              .sort((a, b) => {
                                const dateA = new Date(a.timestamp).getTime();
                                const dateB = new Date(b.timestamp).getTime();
                                return occurrenceSort === 'newest' ? dateB - dateA : dateA - dateB;
                              })
                              .map((occurrence, index) => (
                                <div key={occurrence.id} className="group relative">
                                  {/* Timeline connector */}
                                  {index < occurrencesData.data.length - 1 && (
                                    <div className="bg-border absolute top-10 bottom-0 left-5 -mb-3 w-px" />
                                  )}

                                  <div className="flex gap-4">
                                    {/* Timeline dot */}
                                    <div
                                      className={cn(
                                        'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                                        occurrence.level === 'error' && 'bg-red-500/10',
                                        occurrence.level === 'warn' && 'bg-yellow-500/10',
                                        occurrence.level !== 'error' &&
                                          occurrence.level !== 'warn' &&
                                          'bg-muted/50'
                                      )}
                                    >
                                      {occurrence.level === 'error' ? (
                                        <AlertOctagon className="h-4 w-4 text-red-500" />
                                      ) : occurrence.level === 'warn' ? (
                                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                      ) : (
                                        <Info className="text-muted-foreground h-4 w-4" />
                                      )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 pb-4">
                                      <div className="bg-muted/20 hover:bg-muted/30 rounded-xl border border-white/5 p-4 transition-colors">
                                        <div className="mb-2 flex items-center justify-between gap-4">
                                          <div className="flex items-center gap-2 text-xs">
                                            <span className="font-medium">
                                              {format(
                                                new Date(occurrence.timestamp),
                                                'MMM d, HH:mm:ss'
                                              )}
                                            </span>
                                            {occurrence.serverName && (
                                              <>
                                                <span className="text-muted-foreground">•</span>
                                                <span className="text-muted-foreground flex items-center gap-1">
                                                  <Server className="h-3 w-3" />
                                                  {occurrence.serverName}
                                                </span>
                                              </>
                                            )}
                                            {occurrence.userId && (
                                              <>
                                                <span className="text-muted-foreground">•</span>
                                                <span className="text-muted-foreground flex items-center gap-1">
                                                  <Users className="h-3 w-3" />
                                                  {occurrence.userId}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              'text-xs capitalize',
                                              occurrence.level === 'error' &&
                                                'border-red-500/50 text-red-500',
                                              occurrence.level === 'warn' &&
                                                'border-yellow-500/50 text-yellow-500'
                                            )}
                                          >
                                            {occurrence.level}
                                          </Badge>
                                        </div>
                                        <pre className="text-muted-foreground font-mono text-xs leading-relaxed break-all whitespace-pre-wrap">
                                          {occurrence.message}
                                        </pre>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>

                          {/* Pagination */}
                          {occurrencesData.total > pageSize && (
                            <div className="flex items-center justify-between border-t border-white/5 pt-4">
                              <p className="text-muted-foreground text-xs">
                                Showing {occurrencesPage * pageSize + 1}-
                                {Math.min((occurrencesPage + 1) * pageSize, occurrencesData.total)}{' '}
                                of {occurrencesData.total.toLocaleString()} occurrences
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={occurrencesPage === 0}
                                  onClick={() => setOccurrencesPage((p) => p - 1)}
                                >
                                  Previous
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    (occurrencesPage + 1) * pageSize >= occurrencesData.total
                                  }
                                  onClick={() => setOccurrencesPage((p) => p + 1)}
                                >
                                  Next
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-muted-foreground flex flex-col items-center justify-center py-12">
                          <Activity className="mb-3 h-12 w-12 opacity-30" />
                          <p className="text-sm">No occurrences found</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* AI Analysis Tab */}
                <TabsContent value="ai" className="mt-0 h-full data-[state=inactive]:hidden">
                  <ScrollArea className="h-full" alwaysShowScrollbar>
                    <div className="space-y-6 p-4 sm:p-6">
                      {/* Show structured analysis if available */}
                      {analysisResult ? (
                        <AnalysisDisplay
                          analysis={analysisResult.analysis}
                          metadata={analysisResult.metadata}
                          onFollowUp={analysisResult.conversationId ? handleFollowUp : undefined}
                          isLoading={isFollowUpLoading}
                          conversationHistory={conversationHistory}
                        />
                      ) : defaultAiProvider ? (
                        // AI provider configured but no analysis yet
                        <div className="bg-muted/30 rounded-xl border border-white/5 p-8 text-center">
                          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/10">
                            <Sparkles className="h-7 w-7 text-violet-400" />
                          </div>
                          <h4 className="mb-2 text-base font-medium">Generate Deep AI Analysis</h4>
                          <p className="text-muted-foreground mx-auto mb-5 max-w-md text-sm">
                            Use AI to analyze this issue with full context - including timelines,
                            affected users, sessions, and stack traces - for actionable insights.
                          </p>
                          <Button
                            onClick={handleAnalyze}
                            disabled={analyzeIssue.isPending}
                            className="bg-violet-600 text-white hover:bg-violet-700"
                          >
                            {analyzeIssue.isPending ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Analyzing...
                              </>
                            ) : (
                              <>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Generate Analysis
                              </>
                            )}
                          </Button>
                          {analyzeIssue.isPending && (
                            <p className="text-muted-foreground mt-3 text-xs">
                              Gathering context and analyzing... This may take a few seconds.
                            </p>
                          )}
                        </div>
                      ) : (
                        // No AI provider configured
                        <div className="relative">
                          <div className="from-muted/50 to-muted/30 absolute -inset-px rounded-xl bg-linear-to-r" />
                          <div className="bg-muted/20 relative rounded-xl border border-dashed border-white/10 p-8 text-center">
                            <div className="bg-muted/50 mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full">
                              <Sparkles className="text-muted-foreground/50 h-8 w-8" />
                            </div>
                            <h4 className="mb-2 text-base font-medium">
                              AI Analysis Not Available
                            </h4>
                            <p className="text-muted-foreground mx-auto mb-4 max-w-md text-sm">
                              Configure an AI provider in settings to enable intelligent issue
                              analysis. AI can help identify root causes and suggest fixes.
                            </p>
                            <Button variant="outline" size="sm" asChild>
                              <a href="/settings">
                                <Settings className="mr-2 h-4 w-4" />
                                Configure AI Provider
                              </a>
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* What AI can help with - only show when no provider configured */}
                      {!analysisResult && !defaultAiProvider && (
                        <div className="space-y-4">
                          <h4 className="text-sm font-medium">What AI Analysis Provides</h4>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="bg-muted/20 group hover:bg-muted/30 rounded-lg border border-white/5 p-4 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="rounded-lg bg-purple-500/10 p-2 transition-colors group-hover:bg-purple-500/20">
                                  <Target className="h-4 w-4 text-purple-500" />
                                </div>
                                <div>
                                  <h5 className="mb-1 text-sm font-medium">Root Cause Analysis</h5>
                                  <p className="text-muted-foreground text-xs">
                                    Identifies the likely cause of errors based on patterns
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="bg-muted/20 group hover:bg-muted/30 rounded-lg border border-white/5 p-4 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="rounded-lg bg-green-500/10 p-2 transition-colors group-hover:bg-green-500/20">
                                  <Lightbulb className="h-4 w-4 text-green-500" />
                                </div>
                                <div>
                                  <h5 className="mb-1 text-sm font-medium">Suggested Fixes</h5>
                                  <p className="text-muted-foreground text-xs">
                                    Recommends solutions based on similar issues
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="bg-muted/20 group hover:bg-muted/30 rounded-lg border border-white/5 p-4 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="rounded-lg bg-orange-500/10 p-2 transition-colors group-hover:bg-orange-500/20">
                                  <Zap className="h-4 w-4 text-orange-500" />
                                </div>
                                <div>
                                  <h5 className="mb-1 text-sm font-medium">Impact Assessment</h5>
                                  <p className="text-muted-foreground text-xs">
                                    Evaluates how critical the issue is to your system
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="bg-muted/20 group hover:bg-muted/30 rounded-lg border border-white/5 p-4 transition-colors">
                              <div className="flex items-start gap-3">
                                <div className="rounded-lg bg-blue-500/10 p-2 transition-colors group-hover:bg-blue-500/20">
                                  <BookOpen className="h-4 w-4 text-blue-500" />
                                </div>
                                <div>
                                  <h5 className="mb-1 text-sm font-medium">Follow-up Questions</h5>
                                  <p className="text-muted-foreground text-xs">
                                    Ask follow-up questions for deeper insights
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </div>
            </Tabs>
          </>
        ) : (
          <div className="p-12 text-center">
            <DialogTitle className="sr-only">Issue Not Found</DialogTitle>
            <AlertCircle className="text-muted-foreground/30 mx-auto mb-3 h-12 w-12" />
            <p className="text-muted-foreground">Issue not found</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const sourceToProviderMap: Record<IssueSource, string> = {
  jellyfin: 'jellyfin',
  plex: 'plex',
  sonarr: 'sonarr',
  radarr: 'radarr',
  prowlarr: 'prowlarr',
  docker: 'docker',
  system: 'system',
};

function IssueCard({
  issue,
  onClick,
  onAction,
}: {
  issue: Issue;
  onClick: () => void;
  onAction: (action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen') => void;
}) {
  return (
    <div
      className="bg-muted/30 flex h-[120px] cursor-pointer flex-col rounded-lg border border-white/10 p-3"
      onClick={onClick}
    >
      {/* Top row: icon, title, menu */}
      <div className="flex min-h-0 flex-1 items-start gap-3">
        <div className="bg-muted/50 flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
          <ProviderIcon providerId={sourceToProviderMap[issue.source]} size="md" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium leading-tight">{issue.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={issue.severity} />
            <StatusBadge status={issue.status} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 w-7 shrink-0 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            {issue.status === 'open' && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('acknowledge');
                }}
              >
                <Eye className="mr-2 h-4 w-4" />
                Acknowledge
              </DropdownMenuItem>
            )}
            {issue.status !== 'resolved' && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('resolve');
                }}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark Resolved
              </DropdownMenuItem>
            )}
            {issue.status !== 'ignored' && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('ignore');
                }}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Ignore
              </DropdownMenuItem>
            )}
            {(issue.status === 'resolved' || issue.status === 'ignored') && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onAction('reopen');
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Reopen
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {/* Bottom row: stats */}
      <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-white/5 pt-2">
        <div className="text-muted-foreground flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {issue.occurrenceCount.toLocaleString()}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {issue.affectedUsersCount.toLocaleString()}
          </span>
          <ImpactScoreBar score={issue.impactScore} />
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">
          {formatDistanceToNow(new Date(issue.lastSeen), { addSuffix: true })}
        </span>
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  onClick,
  onAction,
}: {
  issue: Issue;
  onClick: () => void;
  onAction: (action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen') => void;
}) {
  return (
    <div
      className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-4 transition-colors"
      style={{ height: ROW_HEIGHT }}
      onClick={onClick}
    >
      {/* Provider Icon */}
      <ProviderIcon providerId={sourceToProviderMap[issue.source]} size="sm" />

      {/* Severity */}
      <SeverityBadge severity={issue.severity} />

      {/* Title */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{issue.title}</p>
        <p className="text-muted-foreground truncate text-xs">
          {issue.category && <span className="mr-2">{issue.category}</span>}
          {issue.serverName && <span>{issue.serverName}</span>}
        </p>
      </div>

      {/* Stats */}
      <div className="text-muted-foreground hidden items-center gap-4 text-xs md:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              <span>{issue.occurrenceCount.toLocaleString()}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{issue.occurrenceCount.toLocaleString()} occurrences</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span>{issue.affectedUsersCount.toLocaleString()}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{issue.affectedUsersCount.toLocaleString()} affected users</p>
          </TooltipContent>
        </Tooltip>

        <ImpactScoreBar score={issue.impactScore} />
      </div>

      {/* Status */}
      <StatusBadge status={issue.status} />

      {/* Last seen */}
      <span className="text-muted-foreground hidden w-20 text-right text-xs lg:block">
        {formatDistanceToNow(new Date(issue.lastSeen), { addSuffix: true })}
      </span>

      {/* Actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          {issue.status === 'open' && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAction('acknowledge');
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              Acknowledge
            </DropdownMenuItem>
          )}
          {issue.status !== 'resolved' && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAction('resolve');
              }}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Mark Resolved
            </DropdownMenuItem>
          )}
          {issue.status !== 'ignored' && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAction('ignore');
              }}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Ignore
            </DropdownMenuItem>
          )}
          {(issue.status === 'resolved' || issue.status === 'ignored') && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onAction('reopen');
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reopen
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StatsCard({
  title,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}) {
  // Format numbers with commas
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <Card className="bg-card border-border/50">
      <CardContent className="flex h-full flex-col justify-center p-3 sm:p-4">
        {/* Mobile: centered vertical layout filling space */}
        <div className="flex flex-col items-center justify-center gap-1 sm:hidden">
          <div className={cn('rounded-lg p-2', color)}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold leading-none">{formattedValue}</span>
            {subtext && <span className="text-muted-foreground text-xs">{subtext}</span>}
          </div>
          <p className="text-muted-foreground text-xs">{title}</p>
        </div>
        {/* Desktop: horizontal with icon */}
        <div className="hidden items-center gap-3 sm:flex">
          <div className={cn('rounded-lg p-2', color)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs">{title}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{formattedValue}</span>
              {subtext && <span className="text-muted-foreground text-xs">{subtext}</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function IssuesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Initialize from URL params
  const initialIssueId = searchParams.get('id');
  const urlClearedRef = useRef(false);

  const [selectedSeverities, setSelectedSeverities] = useState<IssueSeverity[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<IssueStatus[]>([
    'open',
    'acknowledged',
    'in_progress',
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'impactScore' | 'occurrenceCount' | 'lastSeen'>(
    'impactScore'
  );
  // Open detail modal if there's an issue ID in the URL
  const [detailIssueId, setDetailIssueId] = useState<string | null>(initialIssueId);
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null);
  const [showBackfillDialog, setShowBackfillDialog] = useState(false);
  const [page, setPage] = useState(0);

  // Clear URL params after reading them (one-time)
  useEffect(() => {
    if (!urlClearedRef.current && initialIssueId) {
      urlClearedRef.current = true;
      router.replace('/issues', { scroll: false });
    }
  }, [initialIssueId, router]);

  // Fit-to-viewport measurement
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const height = containerRef.current.offsetHeight - PAGINATION_HEIGHT;
        const count = Math.max(3, Math.floor(height / ROW_HEIGHT));
        setPageSize(count);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { data: stats, isLoading: statsLoading } = useIssueStats();
  const {
    data: issues,
    isLoading: issuesLoading,
    refetch,
  } = useIssues({
    severities: selectedSeverities.length > 0 ? selectedSeverities : undefined,
    statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
    search: searchQuery || undefined,
    sortBy,
    sortOrder: 'desc',
    limit: 50,
  });

  const acknowledgeIssue = useAcknowledgeIssue();
  const resolveIssue = useResolveIssue();
  const ignoreIssue = useIgnoreIssue();
  const reopenIssue = useReopenIssue();
  const backfillIssues = useBackfillIssues();

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil((issues?.length || 0) / pageSize));

  // Clamp page to valid range
  const validPage = Math.min(page, Math.max(0, totalPages - 1));

  const paginatedIssues = useMemo(() => {
    if (!issues) return [];
    const start = validPage * pageSize;
    return issues.slice(start, start + pageSize);
  }, [issues, validPage, pageSize]);

  // Real-time WebSocket updates
  const handleNewIssue = useCallback((issue: Issue) => {
    if (issue.severity === 'critical') {
      toast.error('New Critical Issue Detected', {
        description: issue.title,
      });
    } else {
      toast.info('New Issue Detected', {
        description: issue.title,
      });
    }
  }, []);

  const handleBackfillProgress = useCallback((progress: BackfillProgress) => {
    setBackfillProgress(progress);
    // Open dialog when backfill starts
    if (progress.status === 'started') {
      setShowBackfillDialog(true);
    }
  }, []);

  useIssueSocket({
    enabled: true,
    onNewIssue: handleNewIssue,
    onBackfillProgress: handleBackfillProgress,
  });

  const handleAction = (
    issueId: string,
    action: 'acknowledge' | 'resolve' | 'ignore' | 'reopen'
  ) => {
    switch (action) {
      case 'acknowledge':
        acknowledgeIssue.mutate(issueId);
        break;
      case 'resolve':
        resolveIssue.mutate({ id: issueId });
        break;
      case 'ignore':
        ignoreIssue.mutate(issueId);
        break;
      case 'reopen':
        reopenIssue.mutate(issueId);
        break;
    }
  };

  const handleBackfill = () => {
    // Show dialog immediately with initial state
    setBackfillProgress({
      status: 'started',
      totalLogs: 0,
      processedLogs: 0,
      issuesCreated: 0,
      issuesUpdated: 0,
    });
    setShowBackfillDialog(true);

    backfillIssues.mutate(undefined, {
      onSuccess: () => {
        // Progress updates come via WebSocket, so we don't need to show toast here
        // The dialog will show completion
      },
      onError: (error) => {
        setBackfillProgress((prev) =>
          prev ? { ...prev, status: 'error', error: error.message } : null
        );
      },
    });
  };

  const handleCloseBackfillDialog = () => {
    setShowBackfillDialog(false);
    setBackfillProgress(null);
  };

  const toggleSeverity = (severity: IssueSeverity) => {
    setSelectedSeverities((prev) =>
      prev.includes(severity) ? prev.filter((s) => s !== severity) : [...prev, severity]
    );
  };

  const clearFilters = () => {
    setSelectedSeverities([]);
    setSelectedStatuses(['open', 'acknowledged', 'in_progress']);
    setSearchQuery('');
  };

  const hasFilters =
    selectedSeverities.length > 0 ||
    searchQuery ||
    (selectedStatuses.length > 0 &&
      !(
        selectedStatuses.length === 3 &&
        selectedStatuses.includes('open') &&
        selectedStatuses.includes('acknowledged') &&
        selectedStatuses.includes('in_progress')
      ));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Stats Cards - horizontal 1x4 on mobile, 2x2 on sm, 1x4 on md+ */}
      <div className="grid shrink-0 grid-cols-4 gap-1.5 sm:grid-cols-2 sm:gap-4 md:grid-cols-4">
        <StatsCard
          title="Open"
          value={statsLoading ? '-' : (stats?.openIssues ?? 0)}
          icon={AlertCircle}
          color="bg-red-500/10 text-red-500"
        />
        <StatsCard
          title="Critical"
          value={statsLoading ? '-' : (stats?.criticalIssues ?? 0)}
          icon={AlertOctagon}
          color="bg-orange-500/10 text-orange-500"
        />
        <StatsCard
          title="Resolved"
          value={statsLoading ? '-' : (stats?.resolvedToday ?? 0)}
          icon={CheckCircle}
          color="bg-green-500/10 text-green-500"
        />
        <StatsCard
          title="Impact"
          value={statsLoading ? '-' : Math.round(stats?.averageImpactScore ?? 0)}
          icon={TrendingUp}
          color="bg-blue-500/10 text-blue-500"
          subtext="/100"
        />
      </div>

      {/* Filters */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
        {/* Row 1: Search + Actions */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative min-w-0 flex-1 sm:max-w-[400px] sm:min-w-[200px]">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search issues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-background h-9 border-white/10 pl-9"
            />
          </div>

          {/* Mobile: Clear, Backfill, Refresh */}
          <div className="flex items-center gap-1 sm:hidden">
            {hasFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters} className="h-9 w-9">
                <X className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={handleBackfill}
              disabled={backfillIssues.isPending}
              className="h-9 w-9"
            >
              {backfillIssues.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Database className="h-4 w-4" />
              )}
            </Button>
            <Button variant="outline" size="icon" onClick={() => refetch()} className="h-9 w-9">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: Filters (stacked on mobile) */}
        <div className="flex flex-1 flex-wrap items-center gap-2 sm:gap-3">
          {/* Severity filters - hidden on mobile, shown on sm+ */}
          <div className="bg-background hidden h-9 items-center gap-2 rounded-md border border-white/10 px-3 sm:flex">
            <span className="text-muted-foreground text-xs">Severity:</span>
            {SEVERITIES.slice(0, 3).map((severity) => (
              <label
                key={severity}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
                  selectedSeverities.includes(severity)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Checkbox
                  checked={selectedSeverities.includes(severity)}
                  onCheckedChange={() => toggleSeverity(severity)}
                  className="h-3.5 w-3.5"
                />
                <span className="capitalize">{severity}</span>
              </label>
            ))}
          </div>

          {/* Status and Sort filters - full width on mobile, auto on desktop */}
          <div className="flex w-full gap-2 sm:w-auto sm:gap-3">
            {/* Status filters */}
            <Select
              value={
                selectedStatuses.length === 0
                  ? 'all'
                  : selectedStatuses.includes('open') &&
                      selectedStatuses.includes('acknowledged') &&
                      selectedStatuses.includes('in_progress')
                    ? 'active'
                    : selectedStatuses[0]
              }
              onValueChange={(v) => {
                if (v === 'all') {
                  setSelectedStatuses([]);
                } else if (v === 'active') {
                  setSelectedStatuses(['open', 'acknowledged', 'in_progress']);
                } else {
                  setSelectedStatuses([v as IssueStatus]);
                }
              }}
            >
              <SelectTrigger className="bg-background h-9 flex-1 border-white/10 text-xs sm:w-[140px] sm:flex-none">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" align="start">
                <SelectItem value="all">All Issues</SelectItem>
                <SelectItem value="active">Active Issues</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="bg-background h-9 flex-1 border-white/10 text-xs sm:w-[140px] sm:flex-none">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent position="popper" side="bottom" align="start">
                <SelectItem value="impactScore">Impact Score</SelectItem>
                <SelectItem value="occurrenceCount">Occurrences</SelectItem>
                <SelectItem value="lastSeen">Last Seen</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Clear filters - desktop only */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="hidden h-9 text-xs sm:flex"
            >
              <X className="mr-1 h-3 w-3" />
              Clear
            </Button>
          )}

          {/* Spacer */}
          <div className="hidden flex-1 sm:block" />

          {/* Backfill Button - desktop only */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackfill}
                disabled={backfillIssues.isPending}
                className="hidden h-9 sm:flex"
              >
                {backfillIssues.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Database className="mr-1 h-3 w-3" />
                )}
                Backfill
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Process existing logs to detect issues</p>
            </TooltipContent>
          </Tooltip>

          {/* Refresh - desktop only */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="hidden h-9 sm:flex"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Issues List */}
      <div
        ref={containerRef}
        className="bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border"
      >
        {issuesLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: pageSize }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : issues && issues.length > 0 ? (
          <>
            {/* Mobile Card View - scrollable, no pagination */}
            <div className="flex flex-1 flex-col overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-track]:bg-transparent sm:hidden">
              <div className="space-y-3">
                {issues.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onClick={() => setDetailIssueId(issue.id)}
                    onAction={(action) => handleAction(issue.id, action)}
                  />
                ))}
              </div>
            </div>

            {/* Desktop Row View - with fit-to-viewport pagination */}
            <div className="hidden flex-1 flex-col overflow-hidden sm:flex">
              <div className="flex-1 overflow-hidden">
                {paginatedIssues.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    onClick={() => setDetailIssueId(issue.id)}
                    onAction={(action) => handleAction(issue.id, action)}
                  />
                ))}
              </div>
              {/* Pagination bar - always reserve space for consistent layout */}
              <div
                className="bg-muted/30 flex shrink-0 items-center justify-between border-t border-white/5 px-4"
                style={{ height: PAGINATION_HEIGHT }}
              >
                {totalPages > 1 ? (
                  <>
                    <div className="text-muted-foreground text-sm">
                      <span className="font-medium">{validPage * pageSize + 1}</span>
                      <span>-</span>
                      <span className="font-medium">
                        {Math.min((validPage + 1) * pageSize, issues.length)}
                      </span>
                      <span> of </span>
                      <span className="font-medium">{issues.length}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(0)}
                        disabled={validPage === 0}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={validPage === 0}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="flex items-center gap-1 px-2 text-sm">
                        <span className="font-medium">{validPage + 1}</span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-muted-foreground">{totalPages}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={validPage >= totalPages - 1}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setPage(totalPages - 1)}
                        disabled={validPage >= totalPages - 1}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Showing all <span className="font-medium">{issues.length}</span> issues
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
              <h3 className="mt-4 text-lg font-semibold">No issues found</h3>
              <p className="text-muted-foreground mt-2 max-w-sm text-sm">
                {hasFilters
                  ? 'Try adjusting your filters to see more issues'
                  : 'Great news! There are no active issues detected'}
              </p>
              {!hasFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={handleBackfill}
                  disabled={backfillIssues.isPending}
                >
                  {backfillIssues.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Database className="mr-2 h-4 w-4" />
                  )}
                  Scan Existing Logs for Issues
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Issue Detail Modal */}
      <IssueDetailModal
        issueId={detailIssueId}
        open={detailIssueId !== null}
        onClose={() => setDetailIssueId(null)}
        onAction={(action) => {
          if (detailIssueId) {
            handleAction(detailIssueId, action);
          }
        }}
      />

      {/* Backfill Progress Dialog */}
      <BackfillProgressDialog
        open={showBackfillDialog}
        progress={backfillProgress}
        onClose={handleCloseBackfillDialog}
      />
    </div>
  );
}

// Loading fallback for Suspense
function IssuesPageLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
    </div>
  );
}

export default function IssuesPage() {
  return (
    <Suspense fallback={<IssuesPageLoading />}>
      <IssuesPageContent />
    </Suspense>
  );
}
