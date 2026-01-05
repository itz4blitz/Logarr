'use client';

import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle, Server, Zap } from 'lucide-react';

import type { DashboardRecentEvent } from '@/lib/api';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface EventFeedProps {
  events: DashboardRecentEvent[];
  loading?: boolean;
}

function getEventConfig(type: DashboardRecentEvent['type'], severity?: string) {
  switch (type) {
    case 'issue_new':
      return {
        icon: AlertCircle,
        color:
          severity === 'critical'
            ? 'text-red-500'
            : severity === 'high'
              ? 'text-orange-500'
              : 'text-yellow-500',
        bg:
          severity === 'critical'
            ? 'bg-red-500/10'
            : severity === 'high'
              ? 'bg-orange-500/10'
              : 'bg-yellow-500/10',
      };
    case 'issue_resolved':
      return {
        icon: CheckCircle,
        color: 'text-green-500',
        bg: 'bg-green-500/10',
      };
    case 'server_status':
      return {
        icon: Server,
        color: 'text-blue-500',
        bg: 'bg-blue-500/10',
      };
    case 'error_spike':
      return {
        icon: Zap,
        color: 'text-red-500',
        bg: 'bg-red-500/10',
      };
    default:
      return {
        icon: AlertCircle,
        color: 'text-muted-foreground',
        bg: 'bg-muted',
      };
  }
}

export function EventFeed({ events, loading }: EventFeedProps) {
  if (loading) {
    return (
      <Card className="flex min-h-0 flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Events</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-6 w-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-12" />
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
        <CardTitle className="text-sm font-medium">Recent Events</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-muted-foreground text-sm">No recent events</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => {
              const config = getEventConfig(event.type, event.severity);
              const EventIcon = config.icon;
              return (
                <div
                  key={event.id}
                  className="hover:bg-muted/30 flex items-center gap-2.5 rounded-lg p-2 transition-colors"
                >
                  <div
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                      config.bg
                    )}
                  >
                    <EventIcon className={cn('h-3.5 w-3.5', config.color)} />
                  </div>
                  <span className="flex-1 truncate text-sm">{event.title}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
