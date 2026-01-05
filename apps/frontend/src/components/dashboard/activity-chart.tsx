'use client';

import { format, parseISO } from 'date-fns';
import { useMemo, useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

import type { ActivityHour } from '@/lib/api';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TIME_FORMAT_KEY = 'logarr-time-format';

interface ActivityChartProps {
  data: ActivityHour[];
  loading?: boolean;
}

export function ActivityChart({ data, loading }: ActivityChartProps) {
  const [use24Hour, setUse24Hour] = useState(true);

  // Load preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(TIME_FORMAT_KEY);
    if (stored !== null) {
      setUse24Hour(stored === '24');
    }
  }, []);

  // Save preference to localStorage
  const toggleTimeFormat = () => {
    const newValue = !use24Hour;
    setUse24Hour(newValue);
    localStorage.setItem(TIME_FORMAT_KEY, newValue ? '24' : '12');
  };

  const chartData = useMemo(() => {
    return data.map((item) => ({
      ...item,
      hourLabel: format(parseISO(item.hour), use24Hour ? 'HH:mm' : 'h a'),
      total: item.error + item.warn + item.info + item.debug,
    }));
  }, [data, use24Hour]);

  if (loading) {
    return (
      <div className="bg-card flex h-full flex-col rounded-xl border p-4">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <Skeleton className="h-4 w-32 bg-white/5" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-12 bg-white/5" />
            <Skeleton className="h-3 w-12 bg-white/5" />
            <Skeleton className="h-3 w-12 bg-white/5" />
          </div>
        </div>
        <Skeleton className="min-h-[180px] w-full flex-1 rounded-lg bg-white/5" />
      </div>
    );
  }

  return (
    <div className="bg-card flex h-full flex-col rounded-xl border p-4">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">24-Hour Activity</h3>
        <div className="flex items-center gap-4 text-xs">
          {/* Time format toggle */}
          <div className="flex items-center rounded-md border border-white/10 p-0.5">
            <button
              onClick={toggleTimeFormat}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                use24Hour ? 'bg-white/10 text-zinc-200' : 'text-zinc-500 hover:text-zinc-400'
              )}
            >
              24h
            </button>
            <button
              onClick={toggleTimeFormat}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                !use24Hour ? 'bg-white/10 text-zinc-200' : 'text-zinc-500 hover:text-zinc-400'
              )}
            >
              12h
            </button>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
              <span className="font-medium text-zinc-500">Error</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
              <span className="font-medium text-zinc-500">Warn</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span className="font-medium text-zinc-500">Info</span>
            </div>
          </div>
        </div>
      </div>
      <div className="min-h-[180px] flex-1">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradientInfo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradientWarn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradientError" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="hourLabel"
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                dy={8}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={45}
                domain={[0, 'auto']}
                tickCount={4}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(9, 9, 11, 0.95)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(8px)',
                }}
                labelStyle={{ color: '#fafafa', fontWeight: 600, marginBottom: 6 }}
                itemStyle={{ color: '#a1a1aa', padding: '2px 0', fontSize: '11px' }}
                labelFormatter={(label) => label}
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="info"
                stroke="#10b981"
                strokeWidth={1.5}
                fill="url(#gradientInfo)"
                name="Info"
              />
              <Area
                type="monotone"
                dataKey="warn"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill="url(#gradientWarn)"
                name="Warning"
              />
              <Area
                type="monotone"
                dataKey="error"
                stroke="#f43f5e"
                strokeWidth={1.5}
                fill="url(#gradientError)"
                name="Error"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            No activity data available
          </div>
        )}
      </div>
    </div>
  );
}
