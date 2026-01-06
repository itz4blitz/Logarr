'use client';

import { formatDistanceToNow } from 'date-fns';
import { Server, ChevronRight, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';

import type { DashboardSource } from '@/lib/api';

import { ConnectionStatus } from '@/components/connection-status';
import { ProviderIcon, getProviderMeta } from '@/components/provider-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useFitToViewport, useFitToViewportPagination } from '@/hooks/use-fit-to-viewport';
import { cn } from '@/lib/utils';

interface SourcesCardProps {
  sources: DashboardSource[];
  loading?: boolean;
}

const SOURCE_ROW_HEIGHT = 52; // Height of each source item (h-9 icon = 36px + py-2.5 = 10px + content)
const HEADER_HEIGHT = 56; // Title row (text + sort toggle + margin-bottom)
const PAGINATION_HEIGHT = 44; // Pagination controls height (pt-3 + mt-2 + content)
const CARD_PADDING = 32; // p-4 = 16px top + 16px bottom
const ROW_GAP = 8; // space-y-2 = 8px gap

const SORT_KEY = 'logarr-sources-sort';
type SortOption = 'name' | 'lastSeen';

export function SourcesCard({ sources, loading }: SourcesCardProps) {
  const [sortBy, setSortBy] = useState<SortOption>('name');

  // Load preference from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(SORT_KEY);
    if (stored && ['name', 'lastSeen'].includes(stored)) {
      setSortBy(stored as SortOption);
    }
  }, []);

  const handleSortChange = (option: SortOption) => {
    setSortBy(option);
    localStorage.setItem(SORT_KEY, option);
  };

  const sortedSources = useMemo(() => {
    const sorted = [...sources];
    switch (sortBy) {
      case 'lastSeen':
        // Most recently seen first, then by name
        return sorted.sort((a, b) => {
          if (!a.lastSeen && !b.lastSeen) return a.name.localeCompare(b.name);
          if (!a.lastSeen) return 1;
          if (!b.lastSeen) return -1;
          const timeDiff = new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
          if (timeDiff !== 0) return timeDiff;
          return a.name.localeCompare(b.name);
        });
      case 'name':
      default:
        // Pure alphabetical
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
  }, [sources, sortBy]);

  const { containerRef, pageSize } = useFitToViewport<HTMLDivElement>({
    rowHeight: SOURCE_ROW_HEIGHT,
    headerHeight: HEADER_HEIGHT + CARD_PADDING,
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
  } = useFitToViewportPagination(sortedSources || [], pageSize);

  if (loading) {
    return (
      <div ref={containerRef} className="bg-card flex h-full flex-col rounded-xl border p-4">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="flex-1 space-y-2">
          {Array.from({ length: pageSize }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
              <Skeleton className="h-4 w-4 shrink-0 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-card flex h-full flex-col overflow-hidden rounded-xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-200">Sources</h3>
        <div className="flex items-center gap-3">
          {/* Sort toggle */}
          <div className="flex items-center rounded-md border border-white/10 p-0.5">
            <button
              onClick={() => handleSortChange('name')}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                sortBy === 'name'
                  ? 'bg-white/10 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-400'
              )}
            >
              Name
            </button>
            <button
              onClick={() => handleSortChange('lastSeen')}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                sortBy === 'lastSeen'
                  ? 'bg-white/10 text-zinc-200'
                  : 'text-zinc-500 hover:text-zinc-400'
              )}
            >
              Recent
            </button>
          </div>
          <Link
            href="/sources"
            className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Manage <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
          <Server className="mb-3 h-10 w-10 text-zinc-700" />
          <p className="text-sm text-zinc-500">No sources configured</p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 space-y-2 overflow-hidden">
            {paginatedSources.map((source) => {
              const meta = getProviderMeta(source.providerId);
              return (
                <Link key={source.id} href={`/sources?edit=${source.id}`} className="group block">
                  <div
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all',
                      'hover:bg-white/5'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        meta.bgColor,
                        !source.isConnected && 'opacity-40 grayscale'
                      )}
                    >
                      <ProviderIcon providerId={source.providerId} size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-100">
                          {source.name}
                        </span>
                        <ConnectionStatus
                          apiConnected={source.isConnected}
                          fileIngestionEnabled={source.fileIngestionEnabled}
                          fileIngestionConnected={source.fileIngestionConnected}
                          lastSeen={source.lastSeen}
                          variant="dot"
                        />
                      </div>
                      <span className="text-xs text-zinc-500">
                        {source.version && `v${source.version} • `}
                        {source.lastSeen
                          ? formatDistanceToNow(new Date(source.lastSeen), { addSuffix: true })
                          : 'Never'}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-700 transition-colors group-hover:text-zinc-400" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-2 flex shrink-0 items-center justify-between border-t border-white/5 pt-3">
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
