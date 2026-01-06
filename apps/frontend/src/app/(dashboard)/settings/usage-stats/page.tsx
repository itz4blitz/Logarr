'use client';

import { formatDistanceToNow } from 'date-fns';
import { Clock, Server, Coins, Copy } from 'lucide-react';
import { useState } from 'react';
import Markdown from 'react-markdown';
import { toast } from 'sonner';

import type { AiProviderType } from '@/lib/api';

import { ProviderIcon, providerMeta } from '@/components/provider-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAiUsageStats, useAiAnalysisHistory } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

export default function UsageStatsPage() {
  const { data: stats, isLoading: statsLoading } = useAiUsageStats();
  const { data: historyData, isLoading: historyLoading } = useAiAnalysisHistory({ limit: 20 });
  const [selectedAnalysis, setSelectedAnalysis] = useState<{
    id: string;
    provider: string;
    prompt: string;
    response: string;
    tokensUsed: number | null;
    createdAt: string;
    serverId: string | null;
  } | null>(null);

  if (statsLoading || historyLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-muted-foreground py-12 text-center">
        No usage data yet. Start using AI features to see stats here.
      </div>
    );
  }

  // Calculate provider breakdown
  const providerEntries = Object.entries(stats.analysesByProvider);
  const totalFromProviders = providerEntries.reduce((sum, [, data]) => sum + data.count, 0);
  const last30DaysCount = stats.dailyUsage.reduce((sum, d) => sum + d.count, 0);
  const last30DaysTokens = stats.dailyUsage.reduce((sum, d) => sum + d.tokens, 0);

  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toLocaleString();
  };

  // For chart: show last 14 days with proper spacing
  const chartDays = stats.dailyUsage.slice(-14);
  const maxCount = Math.max(...chartDays.map((d) => d.count), 1);

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Left: Stats + Chart + Providers */}
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-muted/30 border-border/50 rounded-lg border p-3">
              <div className="text-xl font-bold">{formatNumber(stats.totalAnalyses)}</div>
              <div className="text-muted-foreground text-[11px]">Total Analyses</div>
            </div>
            <div className="bg-muted/30 border-border/50 rounded-lg border p-3">
              <div className="text-xl font-bold">{formatNumber(stats.totalTokens)}</div>
              <div className="text-muted-foreground text-[11px]">Total Tokens</div>
            </div>
            <div className="bg-muted/30 border-border/50 rounded-lg border p-3">
              <div className="text-xl font-bold">{formatNumber(last30DaysCount)}</div>
              <div className="text-muted-foreground text-[11px]">Last 30 Days</div>
            </div>
            <div className="bg-muted/30 border-border/50 rounded-lg border p-3">
              <div className="text-xl font-bold">{formatNumber(last30DaysTokens)}</div>
              <div className="text-muted-foreground text-[11px]">Tokens (30d)</div>
            </div>
          </div>

          {/* Chart */}
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium">Daily Activity</h3>
                <span className="text-muted-foreground text-xs">Last 14 days</span>
              </div>
              <div className="h-24">
                {chartDays.length === 0 ? (
                  <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                    No activity yet
                  </div>
                ) : (
                  <div className="flex h-full items-end gap-1">
                    {chartDays.map((day, index) => {
                      const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
                      const isToday = index === chartDays.length - 1;
                      return (
                        <Tooltip key={day.date}>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                'flex-1 cursor-pointer rounded-t-lg transition-all hover:opacity-80',
                                isToday
                                  ? 'bg-primary'
                                  : day.count > 0
                                    ? 'bg-primary/50'
                                    : 'bg-muted/30'
                              )}
                              style={{ height: `${Math.max(height, day.count > 0 ? 10 : 3)}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <div className="font-medium">
                              {new Date(day.date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                            <div>
                              {day.count} analyses · {day.tokens.toLocaleString()} tokens
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
              </div>
              {chartDays.length > 0 && (
                <div className="text-muted-foreground mt-1 flex justify-between text-[10px]">
                  <span>
                    {new Date(chartDays[0]?.date || '').toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <span>Today</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Provider Breakdown */}
          {providerEntries.length > 0 && (
            <Card className="border-border/50">
              <CardContent className="p-4">
                <h3 className="mb-3 text-sm font-medium">Usage by Provider</h3>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                  {providerEntries.map(([provider, data]) => {
                    const percentage =
                      totalFromProviders > 0
                        ? Math.round((data.count / totalFromProviders) * 100)
                        : 0;
                    const meta = providerMeta[provider as AiProviderType];

                    return (
                      <div
                        key={provider}
                        className="bg-muted/20 flex items-center gap-3 rounded-lg p-2"
                      >
                        {meta && (
                          <div className={cn('rounded-lg p-2', meta.bgColor)}>
                            <ProviderIcon providerId={provider as AiProviderType} size="sm" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium capitalize">{provider}</div>
                          <div className="text-muted-foreground text-xs">
                            {data.count} ({percentage}%)
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Analysis History */}
        <Card className="border-border/50">
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-medium">Analysis History</h3>
            {!historyData || historyData.data.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center text-sm">No analyses yet</div>
            ) : (
              <div className="max-h-[500px] space-y-1 overflow-y-auto">
                {historyData.data.map((item) => {
                  const meta = providerMeta[item.provider as AiProviderType];
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedAnalysis(item)}
                      className="hover:bg-muted/40 group w-full rounded-lg p-3 text-left transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {meta && (
                          <div className={cn('shrink-0 rounded p-1.5', meta.bgColor)}>
                            <ProviderIcon providerId={item.provider as AiProviderType} size="sm" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="group-hover:text-foreground line-clamp-2 text-sm transition-colors">
                            {item.prompt}
                          </div>
                          <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                            <span>
                              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </span>
                            {item.tokensUsed && (
                              <>
                                <span>·</span>
                                <span>{item.tokensUsed.toLocaleString()} tokens</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analysis Detail Modal */}
      <Dialog open={!!selectedAnalysis} onOpenChange={(open) => !open && setSelectedAnalysis(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-5xl gap-0 overflow-hidden p-0">
          {selectedAnalysis && (
            <>
              {/* Header */}
              <div className="border-border/50 flex items-center justify-between border-b p-5">
                <div className="flex items-center gap-4">
                  {providerMeta[selectedAnalysis.provider as AiProviderType] && (
                    <div
                      className={cn(
                        'rounded-xl p-3',
                        providerMeta[selectedAnalysis.provider as AiProviderType].bgColor
                      )}
                    >
                      <ProviderIcon
                        providerId={selectedAnalysis.provider as AiProviderType}
                        size="md"
                      />
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-semibold capitalize">
                      {selectedAnalysis.provider} Analysis
                    </h2>
                    <div className="text-muted-foreground mt-1 flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(selectedAnalysis.createdAt).toLocaleString()}
                      </span>
                      {selectedAnalysis.tokensUsed && (
                        <span className="flex items-center gap-1.5">
                          <Coins className="h-3.5 w-3.5" />
                          {selectedAnalysis.tokensUsed.toLocaleString()} tokens
                        </span>
                      )}
                      {selectedAnalysis.serverId && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedAnalysis.serverId || '');
                            toast.success('Server ID copied');
                          }}
                          className="hover:text-foreground flex items-center gap-1.5 transition-colors"
                        >
                          <Server className="h-3.5 w-3.5" />
                          <code className="bg-muted/50 rounded px-1.5 py-0.5 text-xs">
                            {selectedAnalysis.serverId}
                          </code>
                          <Copy className="h-3 w-3 opacity-50" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 space-y-6 overflow-y-auto p-5">
                {/* Prompt */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Prompt
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedAnalysis.prompt);
                        toast.success('Prompt copied');
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <div className="bg-muted/20 border-border/30 rounded-lg border p-4 font-mono text-sm whitespace-pre-wrap">
                    {selectedAnalysis.prompt}
                  </div>
                </div>

                {/* Response */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                      Response
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(selectedAnalysis.response);
                        toast.success('Response copied');
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <div className="bg-muted/20 border-border/30 prose prose-sm dark:prose-invert max-w-none rounded-lg border p-4">
                    <Markdown>{selectedAnalysis.response}</Markdown>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
