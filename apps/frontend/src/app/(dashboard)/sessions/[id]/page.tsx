'use client';

import { formatDistanceToNow, format, formatDuration, intervalToDuration } from 'date-fns';
import {
  ArrowLeft,
  Activity,
  Play,
  Clock,
  User,
  Smartphone,
  Monitor,
  Tv,
  Globe,
  Server,
} from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession, useSessionLogs, useServer } from '@/hooks/use-api';
import { cn } from '@/lib/utils';

function getDeviceIcon(deviceName?: string | null, clientName?: string | null) {
  const name = (deviceName || clientName || '').toLowerCase();
  if (name.includes('tv') || name.includes('android tv') || name.includes('fire')) {
    return Tv;
  }
  if (
    name.includes('mobile') ||
    name.includes('phone') ||
    name.includes('ios') ||
    name.includes('android')
  ) {
    return Smartphone;
  }
  return Monitor;
}

function LogLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    error: 'bg-red-500/10 text-red-500 border-red-500/20',
    warn: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    debug: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  };
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium uppercase', colors[level] || colors.info)}
    >
      {level}
    </Badge>
  );
}

interface SessionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { id } = use(params);
  const { data: session, isLoading: loadingSession } = useSession(id);
  const { data: sessionLogs, isLoading: loadingLogs } = useSessionLogs(id);
  const { data: server } = useServer(session?.serverId || '');

  if (loadingSession) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-[200px]" />
          <Skeleton className="h-[200px] md:col-span-2" />
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Activity className="text-muted-foreground mx-auto h-12 w-12" />
          <h3 className="mt-4 text-lg font-semibold">Session not found</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            This session may have been deleted or doesn't exist
          </p>
          <Link href="/sessions">
            <Button className="mt-4">Back to Sessions</Button>
          </Link>
        </div>
      </div>
    );
  }

  const DeviceIcon = getDeviceIcon(session.deviceName, session.clientName);
  const duration = session.startedAt
    ? intervalToDuration({
        start: new Date(session.startedAt),
        end: session.endedAt ? new Date(session.endedAt) : new Date(),
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sessions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {session.nowPlayingItemName || 'Unknown Media'}
          </h1>
          <p className="text-muted-foreground">Session Details</p>
        </div>
        <Badge
          variant={session.isActive ? 'default' : 'secondary'}
          className={cn(
            'px-3 py-1 text-base',
            session.isActive && 'bg-green-500/10 text-green-500'
          )}
        >
          {session.isActive ? (
            <>
              <Play className="mr-1 h-4 w-4" />
              Active
            </>
          ) : (
            <>
              <Clock className="mr-1 h-4 w-4" />
              Ended
            </>
          )}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="text-muted-foreground h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">User</p>
                  <p className="text-muted-foreground text-sm">{session.userName || 'Unknown'}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <DeviceIcon className="text-muted-foreground h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">Device</p>
                  <p className="text-muted-foreground text-sm">
                    {session.deviceName || session.clientName || 'Unknown'}
                  </p>
                </div>
              </div>

              {session.clientName && session.clientVersion && (
                <div className="flex items-center gap-3">
                  <Monitor className="text-muted-foreground h-5 w-5" />
                  <div>
                    <p className="text-sm font-medium">Client</p>
                    <p className="text-muted-foreground text-sm">
                      {session.clientName} v{session.clientVersion}
                    </p>
                  </div>
                </div>
              )}

              {session.ipAddress && (
                <div className="flex items-center gap-3">
                  <Globe className="text-muted-foreground h-5 w-5" />
                  <div>
                    <p className="text-sm font-medium">IP Address</p>
                    <p className="text-muted-foreground font-mono text-sm">{session.ipAddress}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Server className="text-muted-foreground h-5 w-5" />
                <div>
                  <p className="text-sm font-medium">Server</p>
                  <p className="text-muted-foreground text-sm">{server?.name || 'Unknown'}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-sm">Started</p>
                <p className="font-medium">{format(new Date(session.startedAt), 'PPpp')}</p>
                <p className="text-muted-foreground text-sm">
                  {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                </p>
              </div>

              {session.endedAt ? (
                <div>
                  <p className="text-muted-foreground text-sm">Ended</p>
                  <p className="font-medium">{format(new Date(session.endedAt), 'PPpp')}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(session.endedAt), { addSuffix: true })}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-muted-foreground text-sm">Last Activity</p>
                  <p className="font-medium">{format(new Date(session.lastActivity), 'PPpp')}</p>
                  <p className="text-muted-foreground text-sm">
                    {formatDistanceToNow(new Date(session.lastActivity), { addSuffix: true })}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <div className="flex items-center gap-4">
              <Clock className="text-muted-foreground h-5 w-5" />
              <div>
                <p className="text-muted-foreground text-sm">Duration</p>
                <p className="text-lg font-medium">
                  {duration
                    ? formatDuration(duration, {
                        format: ['hours', 'minutes', 'seconds'],
                      }) || 'Just started'
                    : 'Unknown'}
                </p>
              </div>
            </div>

            {session.nowPlayingItemType && (
              <div className="pt-2">
                <Badge variant="outline">{session.nowPlayingItemType}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session Logs</CardTitle>
          <CardDescription>Log entries associated with this playback session</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : sessionLogs && sessionLogs.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {sessionLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <LogLevelBadge level={log.level} />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm">{log.message}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {log.source && <span className="mr-2">{log.source}</span>}
                        {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed py-8">
              <div className="text-center">
                <Activity className="text-muted-foreground mx-auto h-8 w-8" />
                <p className="text-muted-foreground mt-2 text-sm">
                  No logs associated with this session
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
