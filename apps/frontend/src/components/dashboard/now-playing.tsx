'use client';

import { PlayCircle, ArrowRight, Film, Music, Tv } from 'lucide-react';
import Link from 'next/link';

import type { DashboardNowPlaying } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

interface NowPlayingProps {
  sessions: DashboardNowPlaying[];
  loading?: boolean;
}

function getMediaIcon(type: string | null) {
  switch (type?.toLowerCase()) {
    case 'movie':
      return Film;
    case 'audio':
    case 'musicalbum':
      return Music;
    case 'series':
    case 'episode':
      return Tv;
    default:
      return PlayCircle;
  }
}

export function NowPlaying({ sessions, loading }: NowPlayingProps) {
  if (loading) {
    return (
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Now Playing</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-muted/30 rounded-lg p-3">
                <Skeleton className="mb-2 h-4 w-3/4" />
                <Skeleton className="mb-2 h-3 w-1/2" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Now Playing</CardTitle>
          <Link href="/sessions">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              View All
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <PlayCircle className="text-muted-foreground mb-2 h-8 w-8" />
            <p className="text-muted-foreground text-sm">No active playback</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.slice(0, 5).map((session) => {
              const MediaIcon = getMediaIcon(session.nowPlayingItemType);
              return (
                <div key={session.id} className="bg-muted/30 space-y-2 rounded-lg p-3">
                  <div className="flex items-start gap-2.5">
                    <div className="bg-primary/10 flex h-8 w-8 shrink-0 items-center justify-center rounded">
                      <MediaIcon className="text-primary h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {session.nowPlayingItemName || 'Unknown Media'}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {session.userName || 'Unknown'} • {session.deviceName || 'Unknown Device'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Progress value={session.progress} className="h-1" />
                    <div className="text-muted-foreground flex items-center justify-between text-[10px]">
                      <span>{session.serverName}</span>
                      <span>{session.progress}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {sessions.length > 5 && (
              <Link href="/sessions" className="block">
                <Button variant="ghost" size="sm" className="w-full text-xs">
                  View all {sessions.length} sessions
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
