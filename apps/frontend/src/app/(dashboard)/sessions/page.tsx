'use client';

import {
  Activity,
  Clock,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SortAsc,
  Filter,
  Users,
  Play,
  Pause,
  Zap,
} from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

import type { Session, Server } from '@/lib/api';

import { SessionCard, SessionCardSkeleton } from '@/components/session-card';
import { SessionDetailModal } from '@/components/session-detail-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSessions, useActiveSessions, useServers } from '@/hooks/use-api';
import { useSessionSocket } from '@/hooks/use-session-socket';

// ============================================================================
// Constants
// ============================================================================

// SessionCard has min-h-[132px] but also has a bottom section with mt-2 + pt-2 + content
// The actual rendered height is roughly 132 + 8 (mt-2) + 8 (pt-2) + 12 (text height) = ~160px
const CARD_HEIGHT = 160;
const CARD_GAP = 8; // gap-2 = 0.5rem = 8px
const TOOLBAR_HEIGHT = 48;
const PAGINATION_HEIGHT = 48;

const SORT_KEY = 'logarr-sessions-sort';
const FILTER_KEY = 'logarr-sessions-filter';

type SortOption = 'recent' | 'user' | 'progress' | 'duration';
type FilterOption = 'all' | 'playing' | 'paused' | 'transcoding';

// ============================================================================
// Helper Functions
// ============================================================================

function getProgress(session: Session): number {
  const np = session.nowPlaying;
  if (!np?.positionTicks || !np?.runTimeTicks) return 0;
  const pos = parseFloat(np.positionTicks);
  const total = parseFloat(np.runTimeTicks);
  if (total === 0) return 0;
  return (pos / total) * 100;
}

function getSessionDuration(session: Session): number {
  const start = new Date(session.startedAt).getTime();
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  return end - start;
}

// ============================================================================
// Session Grid Component
// ============================================================================

interface SessionGridProps {
  sessions: Session[] | undefined;
  serverMap: Record<string, Server>;
  isLoading: boolean;
  emptyIcon: React.ElementType;
  emptyTitle: string;
  emptyDescription: string;
  sortBy: SortOption;
  filterBy: FilterOption;
  onSessionClick: (session: Session) => void;
}

function SessionGrid({
  sessions,
  serverMap,
  isLoading,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  sortBy,
  filterBy,
  onSessionClick,
}: SessionGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(4);
  const [page, setPage] = useState(0);
  const [isReady, setIsReady] = useState(false);

  // Measure container and calculate how many cards fit
  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        // Get the actual available height from the container
        const rect = containerRef.current.getBoundingClientRect();
        // Subtract pagination height and a small buffer for safety
        const availableHeight = rect.height - PAGINATION_HEIGHT - 4;
        const width = rect.width;

        // 2 columns on lg (1024px), 1 column otherwise
        const columns = width >= 1024 ? 2 : 1;
        // Calculate rows that fit, accounting for gap between rows
        const effectiveCardHeight = CARD_HEIGHT + CARD_GAP;
        // Use floor to ensure we don't show partial cards
        const rows = Math.max(1, Math.floor(availableHeight / effectiveCardHeight));
        const newPageSize = rows * columns;

        setPageSize(newPageSize);
        setIsReady(true);
      }
    };

    // Use RAF to ensure layout is complete before measuring
    const rafId = requestAnimationFrame(() => {
      measure();
    });

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(measure);
    });
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, []);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    if (!sessions) return [];

    return sessions.filter((session) => {
      if (filterBy === 'all') return true;

      const np = session.nowPlaying;
      const isPlaying = session.isActive && np && !np.isPaused;
      const isPaused = session.isActive && np?.isPaused;
      const isTranscoding = np?.isTranscoding;

      switch (filterBy) {
        case 'playing':
          return isPlaying;
        case 'paused':
          return isPaused;
        case 'transcoding':
          return isTranscoding;
        default:
          return true;
      }
    });
  }, [sessions, filterBy]);

  // Sort sessions
  const sortedSessions = useMemo(() => {
    const sorted = [...filteredSessions];

    switch (sortBy) {
      case 'user':
        return sorted.sort((a, b) => (a.userName || '').localeCompare(b.userName || ''));
      case 'progress':
        return sorted.sort((a, b) => getProgress(b) - getProgress(a));
      case 'duration':
        return sorted.sort((a, b) => getSessionDuration(b) - getSessionDuration(a));
      case 'recent':
      default:
        return sorted.sort((a, b) => {
          if (!a.startedAt && !b.startedAt) return 0;
          if (!a.startedAt) return 1;
          if (!b.startedAt) return -1;
          return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        });
    }
  }, [filteredSessions, sortBy]);

  const totalItems = sortedSessions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reset page if out of bounds
  useEffect(() => {
    if (page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [sortBy, filterBy]);

  const paginatedSessions = useMemo(() => {
    const start = page * pageSize;
    return sortedSessions.slice(start, start + pageSize);
  }, [sortedSessions, page, pageSize]);

  // Always render container for measurement, handle states inside
  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      {/* Loading state */}
      {(isLoading || !isReady) && (
        <div className="grid grid-cols-1 gap-2 p-1 lg:grid-cols-2">
          {Array.from({ length: Math.max(4, pageSize) }).map((_, i) => (
            <SessionCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty state - no sessions */}
      {!isLoading && isReady && (!sessions || sessions.length === 0) && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <EmptyIcon className="text-muted-foreground/50 mx-auto h-12 w-12" />
            <h3 className="text-muted-foreground mt-4 text-lg font-semibold">{emptyTitle}</h3>
            <p className="text-muted-foreground/70 mt-2 max-w-[250px] text-sm">
              {emptyDescription}
            </p>
          </div>
        </div>
      )}

      {/* Empty state - all filtered out */}
      {!isLoading && isReady && sessions && sessions.length > 0 && sortedSessions.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <Filter className="text-muted-foreground/50 mx-auto h-12 w-12" />
            <h3 className="text-muted-foreground mt-4 text-lg font-semibold">
              No matching sessions
            </h3>
            <p className="text-muted-foreground/70 mt-2 max-w-[250px] text-sm">
              Try adjusting your filters to see more results
            </p>
          </div>
        </div>
      )}

      {/* Session cards */}
      {!isLoading && isReady && sortedSessions.length > 0 && (
        <>
          <div className="flex-1 overflow-hidden">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {paginatedSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  server={serverMap[session.serverId]}
                  onClick={() => onSessionClick(session)}
                />
              ))}
            </div>
          </div>

          {/* Pagination bar - always reserve space for consistent layout */}
          <div
            className="bg-muted/30 flex shrink-0 items-center justify-between border-t px-4"
            style={{ height: PAGINATION_HEIGHT }}
          >
            {totalPages > 1 ? (
              <>
                <div className="text-muted-foreground text-sm">
                  <span className="font-medium">{page * pageSize + 1}</span>
                  <span>-</span>
                  <span className="font-medium">{Math.min((page + 1) * pageSize, totalItems)}</span>
                  <span className="hidden sm:inline"> of </span>
                  <span className="sm:hidden">/</span>
                  <span className="font-medium">{totalItems}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(0)}
                    disabled={page === 0}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center gap-1 px-2 text-sm">
                    <span className="font-medium">{page + 1}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{totalPages}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(totalPages - 1)}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">
                Showing all <span className="font-medium">{totalItems}</span> sessions
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Sort/Filter Toolbar
// ============================================================================

interface ToolbarProps {
  sortBy: SortOption;
  filterBy: FilterOption;
  onSortChange: (sort: SortOption) => void;
  onFilterChange: (filter: FilterOption) => void;
  sessionCounts: {
    all: number;
    playing: number;
    paused: number;
    transcoding: number;
  };
}

function Toolbar({ sortBy, filterBy, onSortChange, onFilterChange, sessionCounts }: ToolbarProps) {
  const sortLabels: Record<SortOption, string> = {
    recent: 'Most Recent',
    user: 'User Name',
    progress: 'Progress',
    duration: 'Duration',
  };

  return (
    <div
      className="flex items-center justify-between gap-2 px-1 py-2 sm:gap-4"
      style={{ height: TOOLBAR_HEIGHT }}
    >
      {/* Filter Buttons */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Button
          variant={filterBy === 'all' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1 px-2 sm:gap-1.5 sm:px-3"
          onClick={() => onFilterChange('all')}
        >
          <Users className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">All</span>
          {sessionCounts.all > 0 && (
            <Badge variant="secondary" className="h-5 px-1 text-xs sm:px-1.5">
              {sessionCounts.all}
            </Badge>
          )}
        </Button>
        <Button
          variant={filterBy === 'playing' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1 px-2 sm:gap-1.5 sm:px-3"
          onClick={() => onFilterChange('playing')}
        >
          <Play className="h-3.5 w-3.5 text-green-500" />
          <span className="hidden sm:inline">Playing</span>
          {sessionCounts.playing > 0 && (
            <Badge
              variant="secondary"
              className="h-5 bg-green-500/10 px-1 text-xs text-green-500 sm:px-1.5"
            >
              {sessionCounts.playing}
            </Badge>
          )}
        </Button>
        <Button
          variant={filterBy === 'paused' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1 px-2 sm:gap-1.5 sm:px-3"
          onClick={() => onFilterChange('paused')}
        >
          <Pause className="h-3.5 w-3.5 text-yellow-500" />
          <span className="hidden sm:inline">Paused</span>
          {sessionCounts.paused > 0 && (
            <Badge
              variant="secondary"
              className="h-5 bg-yellow-500/10 px-1 text-xs text-yellow-500 sm:px-1.5"
            >
              {sessionCounts.paused}
            </Badge>
          )}
        </Button>
        <Button
          variant={filterBy === 'transcoding' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1 px-2 sm:gap-1.5 sm:px-3"
          onClick={() => onFilterChange('transcoding')}
        >
          <Zap className="h-3.5 w-3.5 text-orange-500" />
          <span className="hidden sm:inline">Transcoding</span>
          {sessionCounts.transcoding > 0 && (
            <Badge
              variant="secondary"
              className="h-5 bg-orange-500/10 px-1 text-xs text-orange-500 sm:px-1.5"
            >
              {sessionCounts.transcoding}
            </Badge>
          )}
        </Button>
      </div>

      {/* Sort Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2 px-2 sm:px-3">
            <SortAsc className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{sortLabels[sortBy]}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {(Object.keys(sortLabels) as SortOption[]).map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              checked={sortBy === option}
              onCheckedChange={() => onSortChange(option)}
            >
              {sortLabels[option]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function SessionsPage() {
  const { data: allSessions, isLoading: loadingAll } = useSessions();
  const { data: activeSessions, isLoading: loadingActive } = useActiveSessions();
  const { data: servers } = useServers();

  // Connect to WebSocket for real-time session updates
  useSessionSocket({ enabled: true });

  // Modal state
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Sort/filter state with localStorage persistence
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  // Load preferences from localStorage
  useEffect(() => {
    const storedSort = localStorage.getItem(SORT_KEY);
    if (storedSort && ['recent', 'user', 'progress', 'duration'].includes(storedSort)) {
      setSortBy(storedSort as SortOption);
    }
    const storedFilter = localStorage.getItem(FILTER_KEY);
    if (storedFilter && ['all', 'playing', 'paused', 'transcoding'].includes(storedFilter)) {
      setFilterBy(storedFilter as FilterOption);
    }
  }, []);

  const handleSortChange = useCallback((sort: SortOption) => {
    setSortBy(sort);
    localStorage.setItem(SORT_KEY, sort);
  }, []);

  const handleFilterChange = useCallback((filter: FilterOption) => {
    setFilterBy(filter);
    localStorage.setItem(FILTER_KEY, filter);
  }, []);

  const handleSessionClick = useCallback((session: Session) => {
    setSelectedSession(session);
    setModalOpen(true);
  }, []);

  const serverMap = useMemo(
    () =>
      servers?.reduce(
        (acc, server) => {
          acc[server.id] = server;
          return acc;
        },
        {} as Record<string, Server>
      ) || {},
    [servers]
  );

  const isLoading = loadingAll || loadingActive;

  // Sort sessions by startedAt (most recent first) to prevent random reordering
  const sortedActiveSessions = useMemo(
    () =>
      activeSessions
        ?.slice()
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [activeSessions]
  );

  const sortedAllSessions = useMemo(
    () =>
      allSessions
        ?.slice()
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [allSessions]
  );

  // Compute session counts for filters
  const activeSessionCounts = useMemo(() => {
    const sessions = sortedActiveSessions || [];
    return {
      all: sessions.length,
      playing: sessions.filter((s) => s.isActive && s.nowPlaying && !s.nowPlaying.isPaused).length,
      paused: sessions.filter((s) => s.isActive && s.nowPlaying?.isPaused).length,
      transcoding: sessions.filter((s) => s.nowPlaying?.isTranscoding).length,
    };
  }, [sortedActiveSessions]);

  const historySessionCounts = useMemo(() => {
    const sessions = sortedAllSessions || [];
    return {
      all: sessions.length,
      playing: sessions.filter((s) => s.isActive && s.nowPlaying && !s.nowPlaying.isPaused).length,
      paused: sessions.filter((s) => s.isActive && s.nowPlaying?.isPaused).length,
      transcoding: sessions.filter((s) => s.nowPlaying?.isTranscoding).length,
    };
  }, [sortedAllSessions]);

  // Get server for selected session
  const selectedServer = selectedSession ? serverMap[selectedSession.serverId] : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs defaultValue="active" className="flex h-full min-h-0 flex-col">
        <TabsList className="w-fit shrink-0">
          <TabsTrigger value="active" className="gap-2">
            Active
            {(sortedActiveSessions?.length ?? 0) > 0 && (
              <Badge
                variant="secondary"
                className="h-5 border-0 bg-green-500/10 px-1.5 text-xs text-green-500"
              >
                {sortedActiveSessions?.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            History
            {(sortedAllSessions?.length ?? 0) > 0 && (
              <Badge variant="outline" className="h-5 px-1.5 text-xs">
                {sortedAllSessions?.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
          <Toolbar
            sortBy={sortBy}
            filterBy={filterBy}
            onSortChange={handleSortChange}
            onFilterChange={handleFilterChange}
            sessionCounts={activeSessionCounts}
          />
          <div className="min-h-0 flex-1">
            <SessionGrid
              sessions={sortedActiveSessions}
              serverMap={serverMap}
              isLoading={isLoading}
              emptyIcon={Activity}
              emptyTitle="No active sessions"
              emptyDescription="Sessions will appear here when users start playing media"
              sortBy={sortBy}
              filterBy={filterBy}
              onSessionClick={handleSessionClick}
            />
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
          <Toolbar
            sortBy={sortBy}
            filterBy={filterBy}
            onSortChange={handleSortChange}
            onFilterChange={handleFilterChange}
            sessionCounts={historySessionCounts}
          />
          <div className="min-h-0 flex-1">
            <SessionGrid
              sessions={sortedAllSessions}
              serverMap={serverMap}
              isLoading={isLoading}
              emptyIcon={Clock}
              emptyTitle="No session history"
              emptyDescription="Past playback sessions will appear here"
              sortBy={sortBy}
              filterBy={filterBy}
              onSessionClick={handleSessionClick}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Session Detail Modal */}
      <SessionDetailModal
        session={selectedSession}
        server={selectedServer}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </div>
  );
}
