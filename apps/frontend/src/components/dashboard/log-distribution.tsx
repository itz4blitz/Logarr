'use client';

import { ChevronRight, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

import type { LogDistribution } from '@/lib/api';

import { Skeleton } from '@/components/ui/skeleton';
import { useFitToViewport, useFitToViewportPagination } from '@/hooks/use-fit-to-viewport';
import { cn } from '@/lib/utils';

interface LogDistributionChartProps {
  data: LogDistribution;
  loading?: boolean;
}

const SOURCE_ROW_HEIGHT = 36; // Height of each source row
const HEADER_HEIGHT = 100; // Distribution bar + legend section
const PAGINATION_HEIGHT = 44; // Pagination controls height
const ROW_GAP = 4; // Gap between rows

export function LogDistributionChart({ data, loading }: LogDistributionChartProps) {
  const { containerRef, pageSize } = useFitToViewport<HTMLDivElement>({
    rowHeight: SOURCE_ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    paginationHeight: PAGINATION_HEIGHT,
    gap: ROW_GAP,
    minRows: 2,
  });

  const {
    paginatedData: paginatedSources,
    currentPage,
    totalPages,
    nextPage,
    prevPage,
    hasNextPage,
    hasPrevPage,
  } = useFitToViewportPagination(data.topSources || [], pageSize);

  if (loading) {
    return (
      <div ref={containerRef} className="bg-card flex h-full flex-col rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        {/* Distribution bar skeleton */}
        <Skeleton className="mb-3 h-2.5 w-full rounded-full" />
        {/* Legend skeleton */}
        <div className="border-border mb-3 flex gap-4 border-b pb-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
        {/* Top Sources header */}
        <div className="mb-2 flex items-center justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
        {/* Source rows skeleton */}
        <div className="flex-1 space-y-1">
          {Array.from({ length: pageSize }).map((_, i) => (
            <div key={i} className="-mx-2 flex items-center gap-2 rounded px-2 py-1.5">
              <div className="min-w-0 flex-1 space-y-1">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-1 w-full rounded-full" />
              </div>
              <Skeleton className="h-3 w-8 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const total = data.total || 1;
  const levels = [
    {
      name: 'Error',
      value: data.error,
      color: 'bg-rose-500',
      shadow: 'shadow-rose-500/30',
      percent: (data.error / total) * 100,
    },
    {
      name: 'Warn',
      value: data.warn,
      color: 'bg-amber-500',
      shadow: 'shadow-amber-500/30',
      percent: (data.warn / total) * 100,
    },
    {
      name: 'Info',
      value: data.info,
      color: 'bg-emerald-500',
      shadow: 'shadow-emerald-500/30',
      percent: (data.info / total) * 100,
    },
    {
      name: 'Debug',
      value: data.debug,
      color: 'bg-zinc-600',
      shadow: '',
      percent: (data.debug / total) * 100,
    },
  ];

  // Find max count for progress bar scaling
  const maxSourceCount = Math.max(...(data.topSources?.map((s) => s.count) || [1]), 1);

  return (
    <div ref={containerRef} className="bg-card flex h-full flex-col rounded-xl border p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">Log Distribution</h3>
        <span className="text-xs font-medium text-zinc-500 tabular-nums">
          {data.total.toLocaleString()} total
        </span>
      </div>

      {/* Stacked bar - clickable segments */}
      <div className="relative mb-3 flex h-2.5 overflow-hidden rounded-full bg-zinc-800/80">
        {levels.map(
          (level, index) =>
            level.percent > 0 && (
              <Link
                key={level.name}
                href={`/logs?level=${level.name.toLowerCase()}&live=false`}
                className={cn(
                  'h-full transition-all duration-500 hover:brightness-110',
                  level.color,
                  index === 0 && 'rounded-l-full',
                  index === levels.length - 1 && 'rounded-r-full'
                )}
                style={{ width: `${level.percent}%` }}
                title={`${level.name}: ${level.value.toLocaleString()} (${level.percent.toFixed(1)}%)`}
              />
            )
        )}
      </div>

      {/* Compact legend */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-white/5 pb-3 text-xs">
        {levels.map((level) => (
          <Link
            key={level.name}
            href={`/logs?level=${level.name.toLowerCase()}&live=false`}
            className="flex items-center gap-1.5 transition-colors hover:text-zinc-200"
          >
            <div className={cn('h-2 w-2 rounded-full', level.color)} />
            <span className="text-zinc-500">{level.name}</span>
            <span className="font-medium text-zinc-400 tabular-nums">
              {level.percent.toFixed(0)}%
            </span>
          </Link>
        ))}
      </div>

      {/* Top Sources List */}
      {data.topSources && data.topSources.length > 0 ? (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
              Top Sources
            </span>
            <Link
              href="/logs"
              className="flex items-center gap-0.5 text-xs text-zinc-600 transition-colors hover:text-zinc-400"
            >
              View Logs <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex-1 space-y-1">
            {paginatedSources.map((source) => {
              const percentage = (source.count / maxSourceCount) * 100;
              const hasErrors = source.errorCount > 0;
              return (
                <Link
                  key={source.source}
                  href={`/logs?source=${encodeURIComponent(source.source)}&live=false`}
                  className="group block"
                >
                  <div className="-mx-2 flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-white/5">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate text-xs text-zinc-400 transition-colors group-hover:text-zinc-300">
                          {source.source}
                        </span>
                        {hasErrors && (
                          <span className="shrink-0 text-[10px] text-rose-400 tabular-nums">
                            {source.errorCount} err
                          </span>
                        )}
                      </div>
                      {/* Mini progress bar */}
                      <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            hasErrors
                              ? 'bg-linear-to-r from-amber-500 to-rose-500'
                              : 'bg-emerald-500/60'
                          )}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-zinc-600 tabular-nums">
                      {source.count.toLocaleString()}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-3">
              <button
                onClick={prevPage}
                disabled={!hasPrevPage}
                className={cn(
                  'rounded p-1 transition-colors',
                  !hasPrevPage
                    ? 'cursor-not-allowed text-zinc-700'
                    : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-zinc-600 tabular-nums">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                onClick={nextPage}
                disabled={!hasNextPage}
                className={cn(
                  'rounded p-1 transition-colors',
                  !hasNextPage
                    ? 'cursor-not-allowed text-zinc-700'
                    : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-zinc-600">No source data available</p>
        </div>
      )}
    </div>
  );
}
