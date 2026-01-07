'use client';

import { Zap, AlertTriangle, Activity, Server } from 'lucide-react';

import {
  HealthBar,
  ActivityChart,
  LogDistributionChart,
  MetricCard,
  NowPlayingCard,
  SourcesCard,
  TopIssuesCard,
} from '@/components/dashboard';
import { useDashboardStats, useActiveSessions, useServers } from '@/hooks/use-api';
import { useRealtimeLogDistribution } from '@/hooks/use-realtime-log-distribution';
import { useSessionSocket } from '@/hooks/use-session-socket';

export default function DashboardPage() {
  const { data, isLoading } = useDashboardStats();
  const { data: activeSessions, isLoading: loadingSessions } = useActiveSessions();
  const { data: servers, isLoading: loadingServers } = useServers();

  // Connect to WebSocket for real-time session updates
  useSessionSocket({ enabled: true });

  // Real-time log distribution updates
  const { data: realtimeLogDistribution } = useRealtimeLogDistribution({
    initialData: data?.logDistribution,
    enabled: !isLoading,
  });

  const loading = isLoading || !data;

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:h-full lg:overflow-hidden">
      {/* Health Status Bar */}
      <HealthBar
        health={
          data?.health || {
            status: 'healthy',
            sources: { online: 0, total: 0 },
            issues: { critical: 0, high: 0, open: 0 },
            activeStreams: 0,
          }
        }
        loading={loading}
      />

      {/* Key Metrics Row */}
      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Errors Today"
          value={realtimeLogDistribution?.error.toLocaleString() || '0'}
          icon={Zap}
          href="/logs?levels=error"
          trend={data?.metrics.errorRate.trend}
          loading={loading}
          valueClassName={
            (realtimeLogDistribution?.error || 0) > 100
              ? 'text-rose-500'
              : (realtimeLogDistribution?.error || 0) > 20
                ? 'text-amber-500'
                : undefined
          }
        />
        <MetricCard
          title="Open Issues"
          value={data?.metrics.issueCount.open || 0}
          icon={AlertTriangle}
          href="/issues"
          trend={data?.metrics.issueCount.trend}
          loading={loading}
        />
        <MetricCard
          title="Log Volume"
          value={realtimeLogDistribution?.total.toLocaleString() || '0'}
          icon={Activity}
          href="/logs"
          trend={data?.metrics.logVolume.trend}
          loading={loading}
        />
        <MetricCard
          title="Sessions"
          value={data?.metrics.sessionCount.today || 0}
          icon={Server}
          href="/sessions"
          trend={data?.metrics.sessionCount.trend}
          loading={loading}
        />
      </div>

      {/* Main Content Grid - fills remaining height on desktop, scrollable on mobile */}
      <div className="grid min-h-0 flex-1 auto-rows-[minmax(250px,1fr)] grid-cols-1 gap-4 lg:auto-rows-auto lg:grid-cols-3 lg:grid-rows-[1fr_1fr]">
        {/* Activity Chart - spans 2 columns */}
        <div className="min-h-0 lg:col-span-2">
          <ActivityChart data={data?.activityChart || []} loading={loading} />
        </div>

        {/* Source Status */}
        <div className="min-h-0">
          <SourcesCard sources={data?.sources || []} loading={loading} />
        </div>

        {/* Log Distribution */}
        <div className="min-h-0">
          <LogDistributionChart
            data={
              realtimeLogDistribution || {
                error: 0,
                warn: 0,
                info: 0,
                debug: 0,
                total: 0,
                topSources: [],
              }
            }
            loading={loading}
          />
        </div>

        {/* Now Playing */}
        <div className="min-h-0">
          <NowPlayingCard
            sessions={activeSessions || []}
            servers={servers || []}
            loading={loadingSessions || loadingServers}
          />
        </div>

        {/* Top Issues */}
        <div className="min-h-0">
          <TopIssuesCard issues={data?.topIssues || []} loading={loading} />
        </div>
      </div>
    </div>
  );
}
