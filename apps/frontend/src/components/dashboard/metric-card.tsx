'use client';

import Link from 'next/link';
import { useId } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface SparklineProps {
  data: number[];
  className?: string;
  positive?: boolean;
}

function Sparkline({ data, className, positive = true }: SparklineProps) {
  const gradientId = useId();

  if (!data.length || data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const width = 100;
  const height = 100;
  const points = data.map((value, index) => ({
    x: (index / (data.length - 1)) * width,
    y: height - ((value - min) / range) * height,
  }));

  // Create smooth bezier curve path
  const pathData = points.reduce((acc, point, i, arr) => {
    if (i === 0) return `M ${point.x} ${point.y}`;

    const prev = arr[i - 1];
    const cpx = (prev.x + point.x) / 2;
    return `${acc} C ${cpx} ${prev.y}, ${cpx} ${point.y}, ${point.x} ${point.y}`;
  }, '');

  // Gradient fill path
  const fillPath = `${pathData} L ${width} ${height} L 0 ${height} Z`;

  const strokeColor = positive ? '#10b981' : '#f43f5e';
  const fillColorStart = positive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)';
  const fillColorEnd = positive ? 'rgba(16, 185, 129, 0)' : 'rgba(244, 63, 94, 0)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-8 w-16', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillColorStart} />
          <stop offset="100%" stopColor={fillColorEnd} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradientId})`} />
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  href?: string;
  trend?: number[];
  loading?: boolean;
  valueClassName?: string;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  href,
  trend,
  loading,
  valueClassName,
}: MetricCardProps) {
  const content = (
    <div
      className={cn(
        'group bg-card relative rounded-xl border p-4 transition-all duration-300',
        href &&
          'hover:bg-muted/80 hover:border-border cursor-pointer hover:shadow-lg hover:shadow-black/20'
      )}
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-3 w-20 bg-white/5" />
          <Skeleton className="h-8 w-16 bg-white/5" />
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-widest text-zinc-500 uppercase">
              {title}
            </span>
            <div className="rounded-lg bg-white/5 p-1.5 transition-colors group-hover:bg-white/8">
              <Icon className="h-3.5 w-3.5 text-zinc-500 transition-colors group-hover:text-zinc-400" />
            </div>
          </div>

          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div
                className={cn(
                  'text-2xl leading-none font-bold tracking-tight text-zinc-100 tabular-nums',
                  valueClassName
                )}
              >
                {value}
              </div>
              {subtitle && (
                <span className="mt-1.5 block text-[11px] font-medium text-zinc-500">
                  {subtitle}
                </span>
              )}
            </div>

            {trend && trend.length > 1 && (
              <Sparkline
                data={trend}
                className="shrink-0 opacity-80 transition-opacity group-hover:opacity-100"
                positive={!valueClassName?.includes('red')}
              />
            )}
          </div>
        </>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
