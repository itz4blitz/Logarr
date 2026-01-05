'use client';

import { AlertTriangle, ChevronRight, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useFitToViewport, useFitToViewportPagination } from '@/hooks/use-fit-to-viewport';
import { cn } from '@/lib/utils';

interface Issue {
  id: string;
  title: string;
  severity: string;
  occurrenceCount: number;
  impactScore?: number;
}

interface TopIssuesCardProps {
  issues: Issue[];
  loading?: boolean;
}

const ISSUE_ROW_HEIGHT = 36; // Height of each issue row
const HEADER_HEIGHT = 28; // Title row (~14px) + mb-3 (12px) + small buffer
const PAGINATION_HEIGHT = 40; // Pagination controls (pt-3 + mt-2 + ~24px button)
const ROW_GAP = 0; // No gap - rows are flush

const SORT_KEY = 'logarr-issues-sort';
type SortOption = 'count' | 'severity';

const severityOrder: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function TopIssuesCard({ issues, loading }: TopIssuesCardProps) {
  const [sortBy, setSortBy] = useState<SortOption>('severity');

  // Load preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SORT_KEY);
    if (stored && ['count', 'severity'].includes(stored)) {
      setSortBy(stored as SortOption);
    }
  }, []);

  const handleSortChange = (option: SortOption) => {
    setSortBy(option);
    localStorage.setItem(SORT_KEY, option);
  };

  const sortedIssues = useMemo(() => {
    const sorted = [...issues];
    switch (sortBy) {
      case 'count':
        // Primary: count desc, Secondary: severity
        return sorted.sort((a, b) => {
          const countDiff = b.occurrenceCount - a.occurrenceCount;
          if (countDiff !== 0) return countDiff;
          return (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
        });
      case 'severity':
      default:
        // Primary: severity, Secondary: count desc
        return sorted.sort((a, b) => {
          const sevDiff = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
          if (sevDiff !== 0) return sevDiff;
          return b.occurrenceCount - a.occurrenceCount;
        });
    }
  }, [issues, sortBy]);

  const { containerRef, pageSize } = useFitToViewport<HTMLDivElement>({
    rowHeight: ISSUE_ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT,
    paginationHeight: PAGINATION_HEIGHT,
    gap: ROW_GAP,
    minRows: 2,
  });

  const {
    paginatedData: paginatedIssues,
    currentPage,
    totalPages,
    nextPage,
    prevPage,
    hasNextPage,
    hasPrevPage,
  } = useFitToViewportPagination(sortedIssues || [], pageSize);

  if (loading) {
    return (
      <div ref={containerRef} className="bg-card flex h-full flex-col rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-24 bg-white/5" />
          <Skeleton className="h-3 w-16 bg-white/5" />
        </div>
        <div className="flex-1">
          {Array.from({ length: pageSize }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-lg px-2"
              style={{ height: 36 }}
            >
              <Skeleton className="h-5 w-12 shrink-0 rounded bg-white/5" />
              <Skeleton className="h-3.5 flex-1 bg-white/5" />
              <Skeleton className="h-3 w-8 shrink-0 bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-card flex h-full flex-col rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">Top Issues</h3>
        <div className="flex items-center gap-3">
          {/* Sort toggle */}
          <div className="flex items-center rounded-md border border-white/10 p-0.5">
            <button
              onClick={() => handleSortChange('severity')}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                sortBy === 'severity'
                  ? 'bg-white/10 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-400'
              )}
            >
              Severity
            </button>
            <button
              onClick={() => handleSortChange('count')}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                sortBy === 'count'
                  ? 'bg-white/10 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-400'
              )}
            >
              Count
            </button>
          </div>
          <Link
            href="/issues"
            className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
          >
            View All <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
          <AlertTriangle className="mb-2 h-8 w-8 text-zinc-700" />
          <p className="text-sm text-zinc-600">No open issues</p>
        </div>
      ) : (
        <>
          <div className="flex-1">
            {paginatedIssues.map((issue) => (
              <Link key={issue.id} href={`/issues?id=${issue.id}`}>
                <div
                  className="group flex items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-white/4"
                  style={{ height: 36 }}
                >
                  <div
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
                      issue.severity === 'critical' && 'bg-rose-500/20 text-rose-400',
                      issue.severity === 'high' && 'bg-amber-500/20 text-amber-400',
                      issue.severity === 'medium' && 'bg-blue-500/20 text-blue-400',
                      issue.severity === 'low' && 'bg-zinc-500/20 text-zinc-400'
                    )}
                  >
                    {issue.severity}
                  </div>
                  <span className="flex-1 truncate text-sm text-zinc-400 transition-colors group-hover:text-zinc-300">
                    {issue.title}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-zinc-600 tabular-nums">
                    {issue.occurrenceCount.toLocaleString()}×
                  </span>
                </div>
              </Link>
            ))}
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
      )}
    </div>
  );
}
