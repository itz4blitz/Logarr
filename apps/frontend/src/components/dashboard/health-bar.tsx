'use client';

import { CheckCircle, AlertTriangle, XCircle, Server, Activity, Radio } from 'lucide-react';

import type { DashboardHealth } from '@/lib/api';

import { cn } from '@/lib/utils';

interface HealthBarProps {
  health: DashboardHealth;
  loading?: boolean;
}

export function HealthBar({ health, loading }: HealthBarProps) {
  if (loading) {
    return (
      <div className="bg-card flex shrink-0 flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-center gap-3">
          <div className="bg-accent h-5 w-5 animate-pulse rounded-full" />
          <div className="bg-accent h-4 w-36 animate-pulse rounded-md" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-6">
          <div className="bg-accent h-4 w-24 animate-pulse rounded-md" />
          <div className="bg-accent h-4 w-24 animate-pulse rounded-md" />
        </div>
      </div>
    );
  }

  const statusConfig = {
    healthy: {
      icon: CheckCircle,
      color: 'text-emerald-400',
      glow: 'shadow-emerald-500/20',
      dot: 'bg-emerald-400',
      bg: 'bg-emerald-500/8 border-emerald-500/20',
      label: 'All Systems Operational',
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-amber-400',
      glow: 'shadow-amber-500/20',
      dot: 'bg-amber-400',
      bg: 'bg-emerald-500/8 border-emerald-500/20',
      label: 'Some Issues Detected',
    },
    critical: {
      icon: XCircle,
      color: 'text-rose-400',
      glow: 'shadow-rose-500/20',
      dot: 'bg-rose-400',
      bg: 'bg-rose-500/8 border-rose-500/20',
      label: 'Critical Issues',
    },
  };

  const config = statusConfig[health.status];
  const StatusIcon = config.icon;

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-2 rounded-xl border px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-5',
        config.bg
      )}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <StatusIcon className={cn('h-5 w-5', config.color)} />
          <div className={cn('absolute inset-0 opacity-60 blur-md', config.color)} />
        </div>
        <span className={cn('text-sm font-semibold tracking-tight', config.color)}>
          {config.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:flex sm:flex-wrap sm:items-center sm:gap-6">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-emerald-500" />
          <span className="text-zinc-300">
            <span className="font-semibold text-emerald-400 tabular-nums">
              {health.sources.online}
            </span>
            <span className="text-zinc-500"> of </span>
            <span className="text-zinc-300 tabular-nums">{health.sources.total}</span>
            <span className="ml-1">Online</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Radio
            className={cn(
              'h-4 w-4',
              health.activeStreams > 0 ? 'text-emerald-500' : 'text-zinc-600'
            )}
          />
          <span className="text-zinc-400">
            <span
              className={cn(
                'font-semibold tabular-nums',
                health.activeStreams > 0 ? 'text-emerald-400' : 'text-zinc-500'
              )}
            >
              {health.activeStreams}
            </span>
            <span className="ml-1">Streaming</span>
          </span>
        </div>

        {health.issues.critical > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            <span className="font-semibold text-rose-400 tabular-nums">
              {health.issues.critical}
            </span>
            <span className="text-rose-400/70">Critical</span>
          </div>
        )}

        {health.issues.high > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-semibold text-amber-400 tabular-nums">{health.issues.high}</span>
            <span className="text-amber-400/70">High</span>
          </div>
        )}
      </div>
    </div>
  );
}
