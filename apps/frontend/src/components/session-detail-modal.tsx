'use client';

import { formatDistanceToNow, format, intervalToDuration } from 'date-fns';
import {
  Play,
  Pause,
  Radio,
  Clock,
  User,
  Smartphone,
  Monitor,
  Tv,
  Globe,
  Server as ServerIcon,
  Zap,
  Wifi,
  Film,
  Tv2,
  Music,
  Image as ImageIcon,
  Copy,
  Check,
  ExternalLink,
  Activity,
  Info,
  Settings,
  FileText,
  AlertTriangle,
  History,
  ChevronRight,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import type { Session, Server, LogEntry, Issue } from '@/lib/api';

import { ProviderIcon, getProviderMeta } from '@/components/provider-icon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSessionLogs, useIssues, useActiveSessions, useSessions } from '@/hooks/use-api';
import { useSessionSocket } from '@/hooks/use-session-socket';
import { cn } from '@/lib/utils';

// ============================================================================
// Utility Functions
// ============================================================================

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

function MediaTypeIcon({ itemType, className }: { itemType?: string | null; className?: string }) {
  const type = (itemType || '').toLowerCase();
  if (type.includes('episode') || type.includes('series')) return <Tv2 className={className} />;
  if (type.includes('movie')) return <Film className={className} />;
  if (type.includes('audio') || type.includes('music')) return <Music className={className} />;
  return <ImageIcon className={className} />;
}

function formatDuration(ticks: string | null): string {
  if (!ticks) return '--:--';
  const seconds = Math.floor(parseInt(ticks) / 10000000);
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getProgress(positionTicks: string | null, runTimeTicks: string | null): number {
  if (!positionTicks || !runTimeTicks) return 0;
  const pos = parseInt(positionTicks);
  const total = parseInt(runTimeTicks);
  if (total === 0) return 0;
  return Math.round((pos / total) * 100);
}

function getMediaImageUrl(
  server: Server | undefined,
  itemId: string | null,
  nowPlaying?: { thumbnailUrl?: string | null } | null
): string | null {
  // If provider gave us a direct thumbnail URL, use it (Plex)
  if (nowPlaying?.thumbnailUrl) {
    return nowPlaying.thumbnailUrl;
  }

  if (!server || !itemId) return null;
  const baseUrl = server.url.replace(/\/$/, '');

  // Jellyfin/Emby use item-based image URLs
  if (server.providerId === 'jellyfin' || server.providerId === 'emby') {
    return `${baseUrl}/Items/${itemId}/Images/Primary?maxHeight=400&quality=90`;
  }

  // For Plex without a direct URL, we can't construct one without the token
  // The provider should have included thumbnailUrl in nowPlaying
  return null;
}

function getUserAvatarUrl(server: Server | undefined, userId: string | null): string | null {
  if (!server || !userId) return null;
  const baseUrl = server.url.replace(/\/$/, '');
  return `${baseUrl}/Users/${userId}/Images/Primary?maxHeight=64&quality=90`;
}

function getUserProfileUrl(server: Server | undefined, userId: string | null): string | null {
  if (!server || !userId) return null;
  const baseUrl = server.url.replace(/\/$/, '');
  return `${baseUrl}/web/index.html#!/dashboard/users/profile?userId=${userId}`;
}

function getPlayMethodLabel(playMethod?: string | null): string {
  if (!playMethod) return 'Unknown';
  switch (playMethod.toLowerCase()) {
    case 'directplay':
      return 'Direct Play';
    case 'directstream':
      return 'Direct Stream';
    case 'transcode':
      return 'Transcoding';
    default:
      return playMethod;
  }
}

function getTranscodeReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    ContainerNotSupported: 'Container not supported',
    VideoCodecNotSupported: 'Video codec not supported',
    AudioCodecNotSupported: 'Audio codec not supported',
    SubtitleCodecNotSupported: 'Subtitle codec not supported',
    AudioIsExternal: 'External audio',
    SecondaryAudioNotSupported: 'Secondary audio not supported',
    VideoProfileNotSupported: 'Video profile not supported',
    VideoLevelNotSupported: 'Video level not supported',
    VideoBitDepthNotSupported: 'Video bit depth not supported',
    VideoResolutionNotSupported: 'Resolution not supported',
    RefFramesNotSupported: 'Reference frames not supported',
    AnamorphicVideoNotSupported: 'Anamorphic video not supported',
    AudioBitrateNotSupported: 'Audio bitrate not supported',
    AudioChannelsNotSupported: 'Audio channels not supported',
    AudioSampleRateNotSupported: 'Audio sample rate not supported',
  };
  return labels[reason] || reason.replace(/([A-Z])/g, ' $1').trim();
}

function getSeverityColor(severity: string) {
  switch (severity) {
    case 'critical':
      return 'bg-red-500/10 text-red-500 border-red-500/30';
    case 'high':
      return 'bg-orange-500/10 text-orange-500 border-orange-500/30';
    case 'medium':
      return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30';
    case 'low':
      return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    default:
      return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';
  }
}

// ============================================================================
// Sub-components
// ============================================================================

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleCopy}>
      {copied ? (
        <>
          <Check className="mr-1 h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3 w-3" />
          {label || 'Copy'}
        </>
      )}
    </Button>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    error: 'bg-red-500/10 text-red-500 border-red-500/20',
    warn: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    debug: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  };
  return (
    <Badge
      variant="outline"
      className={cn('px-1.5 py-0 text-[10px] font-medium uppercase', colors[level] || colors.info)}
    >
      {level}
    </Badge>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={cn('truncate text-sm font-medium', mono && 'font-mono text-xs')}>{value}</p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="bg-muted/30 space-y-1 rounded-lg p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', color || 'text-muted-foreground')} />
        <span className="text-muted-foreground text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ============================================================================
// Tab Content Components
// ============================================================================

function OverviewTab({ session, server }: { session: Session; server?: Server }) {
  const nowPlaying = session.nowPlaying;
  const isTranscoding = nowPlaying?.isTranscoding;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left Column */}
      <div className="space-y-6">
        {/* Playback Info */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Settings className="h-4 w-4" />
            Playback Details
          </h4>
          <div className="bg-muted/30 space-y-3 rounded-lg border border-white/10 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-xs">Play Method</p>
                <div className="mt-1 flex items-center gap-2">
                  {isTranscoding ? (
                    <Zap className="h-4 w-4 text-orange-500" />
                  ) : (
                    <Wifi className="h-4 w-4 text-green-500" />
                  )}
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isTranscoding ? 'text-orange-500' : 'text-green-500'
                    )}
                  >
                    {getPlayMethodLabel(nowPlaying?.playMethod)}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Container</p>
                <p className="mt-1 text-sm font-medium uppercase">
                  {nowPlaying?.container || 'Unknown'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground text-xs">Video Codec</p>
                <p className="mt-1 text-sm font-medium uppercase">
                  {nowPlaying?.videoCodec || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Audio Codec</p>
                <p className="mt-1 text-sm font-medium uppercase">
                  {nowPlaying?.audioCodec || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Transcode Reasons */}
        {isTranscoding &&
          nowPlaying?.transcodeReasons &&
          nowPlaying.transcodeReasons.length > 0 && (
            <div className="space-y-3">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <Zap className="h-4 w-4 text-orange-500" />
                Transcode Reasons
              </h4>
              <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-4">
                <ul className="space-y-2">
                  {nowPlaying.transcodeReasons.map((reason, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                      <span className="text-orange-200">{getTranscodeReasonLabel(reason)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
      </div>

      {/* Right Column */}
      <div className="space-y-6">
        {/* Media Info */}
        {nowPlaying && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <Film className="h-4 w-4" />
              Media Information
            </h4>
            <div className="bg-muted/30 space-y-3 rounded-lg border border-white/10 p-4">
              {nowPlaying.seriesName && (
                <div>
                  <p className="text-muted-foreground text-xs">Series</p>
                  <p className="mt-1 text-sm font-medium">{nowPlaying.seriesName}</p>
                </div>
              )}
              {nowPlaying.seasonName && (
                <div>
                  <p className="text-muted-foreground text-xs">Season</p>
                  <p className="mt-1 text-sm font-medium">{nowPlaying.seasonName}</p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground text-xs">Type</p>
                <p className="mt-1 text-sm font-medium">
                  {session.nowPlayingItemType || 'Unknown'}
                </p>
              </div>
              {nowPlaying.runTimeTicks && (
                <div>
                  <p className="text-muted-foreground text-xs">Runtime</p>
                  <p className="mt-1 text-sm font-medium">
                    {formatDuration(nowPlaying.runTimeTicks)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Session Stats */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4" />
            Session Stats
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Duration"
              value={(() => {
                const duration = intervalToDuration({
                  start: new Date(session.startedAt),
                  end: session.endedAt ? new Date(session.endedAt) : new Date(),
                });
                return (
                  [
                    duration.hours && `${duration.hours}h`,
                    duration.minutes && `${duration.minutes}m`,
                    duration.seconds && `${duration.seconds}s`,
                  ]
                    .filter(Boolean)
                    .join(' ') || '< 1s'
                );
              })()}
              icon={Clock}
            />
            <StatCard
              label="Progress"
              value={
                session.nowPlaying?.runTimeTicks
                  ? `${getProgress(session.nowPlaying.positionTicks, session.nowPlaying.runTimeTicks)}%`
                  : 'Live'
              }
              icon={Activity}
              color={session.isActive ? 'text-green-500' : undefined}
            />
          </div>
        </div>

        {/* Audio State */}
        {nowPlaying && (nowPlaying.isPaused || nowPlaying.isMuted) && (
          <div className="flex gap-2">
            {nowPlaying.isPaused && (
              <Badge
                variant="secondary"
                className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500"
              >
                <Pause className="mr-1 h-3 w-3" />
                Paused
              </Badge>
            )}
            {nowPlaying.isMuted && (
              <Badge
                variant="secondary"
                className="border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
              >
                Muted
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UserDeviceTab({ session, server }: { session: Session; server?: Server }) {
  const DeviceIcon = getDeviceIcon(session.deviceName, session.clientName);
  const userAvatarUrl = getUserAvatarUrl(server, session.userId);
  const userProfileUrl = getUserProfileUrl(server, session.userId);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Left Column - User & Network */}
      <div className="space-y-6">
        {/* User Info */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4" />
            User
          </h4>
          <div className="bg-muted/30 rounded-lg border border-white/10 p-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14">
                <AvatarImage src={userAvatarUrl || undefined} alt={session.userName || 'User'} />
                <AvatarFallback className="text-lg">
                  {(session.userName || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">{session.userName || 'Unknown User'}</p>
                {session.userId && (
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-muted-foreground truncate font-mono text-xs">
                      {session.userId.slice(0, 12)}...
                    </p>
                    <CopyButton text={session.userId} />
                  </div>
                )}
              </div>
            </div>
            {userProfileUrl && (
              <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                <a href={userProfileUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  View User Profile
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Network Info */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <Globe className="h-4 w-4" />
            Network
          </h4>
          <div className="bg-muted/30 rounded-lg border border-white/10 p-4">
            {session.ipAddress ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs">IP Address</p>
                  <p className="mt-1 font-mono text-sm">{session.ipAddress}</p>
                </div>
                <CopyButton text={session.ipAddress} />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No network information available</p>
            )}
          </div>
        </div>
      </div>

      {/* Right Column - Device & Server */}
      <div className="space-y-6">
        {/* Device Info */}
        <div className="space-y-3">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <DeviceIcon className="h-4 w-4" />
            Device
          </h4>
          <div className="bg-muted/30 space-y-4 rounded-lg p-4">
            <InfoRow
              icon={DeviceIcon}
              label="Device Name"
              value={session.deviceName || 'Unknown'}
            />
            {session.clientName && (
              <InfoRow
                icon={Monitor}
                label="Client Application"
                value={
                  <span>
                    {session.clientName}
                    {session.clientVersion && (
                      <span className="text-muted-foreground ml-1">v{session.clientVersion}</span>
                    )}
                  </span>
                }
              />
            )}
            {session.deviceId && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs">Device ID</p>
                  <p className="mt-1 truncate font-mono text-xs">
                    {session.deviceId.slice(0, 20)}...
                  </p>
                </div>
                <CopyButton text={session.deviceId} />
              </div>
            )}
          </div>
        </div>

        {/* Server Info */}
        {server && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <ServerIcon className="h-4 w-4" />
              Server
            </h4>
            <div className="bg-muted/30 rounded-lg border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-lg',
                    getProviderMeta(server.providerId).bgColor
                  )}
                >
                  <ProviderIcon providerId={server.providerId} size="md" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{server.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{server.url}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Session IDs */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Session Identifiers</h4>
          <div className="bg-muted/30 space-y-3 rounded-lg border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-xs">Session ID</p>
                <p className="mt-1 max-w-[180px] truncate font-mono text-xs">{session.id}</p>
              </div>
              <CopyButton text={session.id} />
            </div>
            {session.externalId && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs">External ID</p>
                  <p className="mt-1 max-w-[180px] truncate font-mono text-xs">
                    {session.externalId}
                  </p>
                </div>
                <CopyButton text={session.externalId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UserHistoryTab({ session, userId }: { session: Session; userId: string | null }) {
  const { data: allSessions, isLoading } = useSessions();

  // Filter sessions for this user
  const userSessions = allSessions
    ?.filter((s) => s.userId === userId && s.id !== session.id)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 10);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <User className="text-muted-foreground/50 mb-3 h-10 w-10" />
        <p className="text-muted-foreground font-medium">No user identified</p>
        <p className="text-muted-foreground/70 mt-1 text-sm">
          User history unavailable for anonymous sessions
        </p>
      </div>
    );
  }

  if (!userSessions || userSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <History className="text-muted-foreground/50 mb-3 h-10 w-10" />
        <p className="text-muted-foreground font-medium">No previous sessions</p>
        <p className="text-muted-foreground/70 mt-1 text-sm">
          This is the first recorded session for this user
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Recent sessions from <span className="text-foreground font-medium">{session.userName}</span>
      </p>
      <div className="space-y-2">
        {userSessions.map((s) => (
          <div
            key={s.id}
            className="border-border/50 bg-muted/20 hover:bg-muted/30 flex items-center gap-3 rounded-lg border p-3 transition-colors"
          >
            <div className="shrink-0">
              <MediaTypeIcon
                itemType={s.nowPlayingItemType}
                className="text-muted-foreground h-5 w-5"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {s.nowPlayingItemName || 'Unknown Media'}
              </p>
              <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                <span>{s.deviceName || s.clientName}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(s.startedAt), { addSuffix: true })}</span>
              </div>
            </div>
            <Badge variant={s.isActive ? 'default' : 'secondary'} className="text-xs">
              {s.isActive ? 'Active' : 'Ended'}
            </Badge>
          </div>
        ))}
      </div>
      <Link
        href={`/sessions?search=${encodeURIComponent(session.userName || '')}`}
        className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 pt-2 text-sm transition-colors"
      >
        View all sessions <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function IssuesTab({ userId, userName }: { userId: string | null; userName: string | null }) {
  // Search for issues mentioning this user
  const { data: issues, isLoading } = useIssues({
    search: userId || userName || undefined,
    limit: 20,
    sortBy: 'lastSeen',
    sortOrder: 'desc',
  });

  // Filter to only show error-related issues
  const relevantIssues = issues?.filter(
    (issue) =>
      issue.severity === 'critical' || issue.severity === 'high' || issue.severity === 'medium'
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!userId && !userName) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <User className="text-muted-foreground/50 mb-3 h-10 w-10" />
        <p className="text-muted-foreground font-medium">No user identified</p>
        <p className="text-muted-foreground/70 mt-1 text-sm">
          Cannot search for issues without user context
        </p>
      </div>
    );
  }

  if (!relevantIssues || relevantIssues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-green-500/50" />
        <p className="text-muted-foreground font-medium">No issues found</p>
        <p className="text-muted-foreground/70 mt-1 text-sm">
          No errors or issues associated with this user
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Issues affecting{' '}
        <span className="text-foreground font-medium">{userName || 'this user'}</span>
      </p>
      <div className="space-y-2">
        {relevantIssues.map((issue) => (
          <Link key={issue.id} href={`/issues?id=${issue.id}`} className="block">
            <div className="border-border/50 bg-muted/20 hover:bg-muted/30 flex items-start gap-3 rounded-lg border p-3 transition-colors">
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 text-[10px] font-medium uppercase',
                  getSeverityColor(issue.severity)
                )}
              >
                {issue.severity}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium">{issue.title}</p>
                <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                  <span>{issue.occurrenceCount} occurrences</span>
                  <span>•</span>
                  <span>
                    Last seen {formatDistanceToNow(new Date(issue.lastSeen), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
            </div>
          </Link>
        ))}
      </div>
      <Link
        href={`/issues?search=${encodeURIComponent(userId || userName || '')}`}
        className="text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 pt-2 text-sm transition-colors"
      >
        View all issues <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

function LogsTab({ sessionId }: { sessionId: string }) {
  const { data: logs, isLoading } = useSessionLogs(sessionId);

  // Count errors and warnings
  const errorCount = logs?.filter((l) => l.level === 'error').length || 0;
  const warnCount = logs?.filter((l) => l.level === 'warn').length || 0;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="text-muted-foreground/50 mb-3 h-10 w-10" />
        <p className="text-muted-foreground font-medium">No logs found</p>
        <p className="text-muted-foreground/70 mt-1 text-sm">
          No log entries are associated with this session
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {(errorCount > 0 || warnCount > 0) && (
        <div className="flex items-center gap-3 text-sm">
          {errorCount > 0 && <span className="text-red-500">{errorCount} errors</span>}
          {warnCount > 0 && <span className="text-yellow-500">{warnCount} warnings</span>}
          <span className="text-muted-foreground">{logs.length} total entries</span>
        </div>
      )}

      <div className="space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="border-border/50 bg-muted/20 hover:bg-muted/30 flex items-start gap-3 rounded-lg border p-3 transition-colors"
          >
            <LogLevelBadge level={log.level} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-mono text-xs leading-relaxed">{log.message}</p>
              <div className="text-muted-foreground mt-1.5 flex items-center gap-2 text-[10px]">
                {log.source && <span className="max-w-[200px] truncate">{log.source}</span>}
                <span>•</span>
                <span className="tabular-nums">
                  {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface SessionDetailModalProps {
  session: Session | null;
  server?: Server;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SessionDetailModal({
  session: initialSession,
  server,
  open,
  onOpenChange,
}: SessionDetailModalProps) {
  const [activeTab, setActiveTab] = useState('overview');

  // Connect to WebSocket for real-time updates when modal is open
  useSessionSocket({ enabled: open });

  // Get live session data from the active sessions hook (updated via WebSocket)
  const { data: allSessions } = useActiveSessions();

  // Find the current session from live data, fallback to prop
  const session = initialSession
    ? (allSessions?.find((s) => s.id === initialSession.id) ?? initialSession)
    : null;

  // Reset tab when session changes
  useEffect(() => {
    if (initialSession) {
      setActiveTab('overview');
    }
  }, [initialSession?.id]);

  if (!session) return null;

  const nowPlaying = session.nowPlaying;
  const progress = nowPlaying ? getProgress(nowPlaying.positionTicks, nowPlaying.runTimeTicks) : 0;
  const mediaImageUrl = getMediaImageUrl(server, session.nowPlayingItemId, nowPlaying);
  const isPlaying = session.isActive && nowPlaying && !nowPlaying.isPaused;
  const isPaused = session.isActive && nowPlaying?.isPaused;
  const isLiveStream = nowPlaying && !nowPlaying.runTimeTicks;
  const providerMeta = server ? getProviderMeta(server.providerId) : null;
  const userProfileUrl = getUserProfileUrl(server, session.userId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background flex h-[85vh] w-full max-w-[95vw] flex-col gap-0 overflow-hidden rounded-xl border border-white/20 p-0 shadow-2xl ring-1 ring-white/10 sm:max-w-5xl">
        {/* Header */}
        <div className="relative shrink-0 border-b border-white/10">
          {/* Background gradient */}
          <div
            className={cn(
              'absolute inset-0 opacity-20',
              session.isActive
                ? 'bg-linear-to-br from-green-500 to-emerald-600'
                : 'bg-linear-to-br from-zinc-500 to-zinc-600'
            )}
          />

          <DialogHeader className="relative p-4 pb-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-5">
              {/* Poster */}
              <div className="bg-muted relative mx-auto h-32 w-24 shrink-0 overflow-hidden rounded-lg border border-white/20 shadow-lg ring-1 ring-black/20 sm:mx-0 sm:h-28 sm:w-20">
                {mediaImageUrl ? (
                  <Image
                    src={mediaImageUrl}
                    alt={session.nowPlayingItemName || 'Media'}
                    className="h-full w-full object-cover"
                    fill
                    sizes="80px"
                    unoptimized
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="from-muted to-muted/50 flex h-full w-full items-center justify-center bg-linear-to-br">
                    <MediaTypeIcon
                      itemType={session.nowPlayingItemType}
                      className="text-muted-foreground/40 h-10 w-10"
                    />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1 text-center sm:pr-8 sm:text-left">
                <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="truncate text-lg font-bold sm:pr-4 sm:text-xl">
                      {session.nowPlayingItemName || 'Unknown Media'}
                    </DialogTitle>
                    {nowPlaying?.seriesName && (
                      <p className="text-muted-foreground mt-0.5 truncate text-sm">
                        {nowPlaying.seriesName}
                        {nowPlaying.seasonName && ` • ${nowPlaying.seasonName}`}
                      </p>
                    )}
                  </div>

                  {/* Status badge */}
                  <Badge
                    variant="secondary"
                    className={cn(
                      'shrink-0',
                      isPlaying && 'border-green-500/30 bg-green-500/20 text-green-500',
                      isPaused && 'border-yellow-500/30 bg-yellow-500/20 text-yellow-500',
                      !session.isActive && 'border-zinc-500/30 bg-zinc-500/20 text-zinc-400'
                    )}
                  >
                    {isPlaying ? (
                      <>
                        {isLiveStream ? (
                          <Radio className="mr-1 h-3 w-3" />
                        ) : (
                          <Play className="mr-1 h-3 w-3" />
                        )}
                        {isLiveStream ? 'Streaming' : 'Playing'}
                      </>
                    ) : isPaused ? (
                      <>
                        <Pause className="mr-1 h-3 w-3" />
                        Paused
                      </>
                    ) : (
                      <>
                        <Clock className="mr-1 h-3 w-3" />
                        Ended
                      </>
                    )}
                  </Badge>
                </div>

                {/* Progress bar */}
                {session.isActive && nowPlaying && (
                  <div className="mt-3">
                    {nowPlaying.runTimeTicks ? (
                      <div className="space-y-1">
                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              isPlaying ? 'bg-green-500' : 'bg-muted-foreground/50'
                            )}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
                          <span>{formatDuration(nowPlaying.positionTicks)}</span>
                          <span>{progress}%</span>
                          <span>{formatDuration(nowPlaying.runTimeTicks)}</span>
                        </div>
                      </div>
                    ) : isPlaying ? (
                      <div className="space-y-1">
                        <div className="relative h-1.5 overflow-hidden rounded-full bg-green-500">
                          <div
                            className="absolute inset-y-0 w-1/2"
                            style={{
                              background:
                                'linear-gradient(90deg, transparent 0%, rgb(134 239 172) 40%, rgb(134 239 172) 60%, transparent 100%)',
                              animation: 'shimmer 2s ease-in-out infinite',
                            }}
                          />
                        </div>
                        <div className="text-muted-foreground flex justify-between text-xs">
                          <span className="tabular-nums">
                            {formatDuration(nowPlaying.positionTicks)}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                            Live
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Quick info pills */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1.5 text-xs">
                          <User className="h-3 w-3" />
                          {session.userName || 'Unknown'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>User</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1.5 text-xs">
                          {(() => {
                            const DeviceIcon = getDeviceIcon(
                              session.deviceName,
                              session.clientName
                            );
                            return <DeviceIcon className="h-3 w-3" />;
                          })()}
                          {session.deviceName || session.clientName || 'Unknown'}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Device</TooltipContent>
                    </Tooltip>

                    {server && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="gap-1.5 text-xs">
                            <ProviderIcon providerId={server.providerId} size="sm" />
                            {server.name}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Server</TooltipContent>
                      </Tooltip>
                    )}

                    {nowPlaying?.isTranscoding && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className="gap-1.5 border-orange-500/30 text-xs text-orange-500"
                          >
                            <Zap className="h-3 w-3" />
                            Transcoding
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>Stream is being transcoded</TooltipContent>
                      </Tooltip>
                    )}

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="gap-1.5 text-xs">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Session started</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Tabs Navigation - Pill/Segment Style like Issues page */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="shrink-0 border-b border-white/5 px-4 py-3 sm:px-6">
            <TabsList className="bg-muted/30 h-10 w-full gap-1 rounded-lg p-1">
              <TabsTrigger
                value="overview"
                className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
              >
                <Info className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Overview</span>
              </TabsTrigger>
              <TabsTrigger
                value="user"
                className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
              >
                <User className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">User & Device</span>
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
              >
                <History className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
              <TabsTrigger
                value="issues"
                className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
              >
                <AlertTriangle className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Issues</span>
              </TabsTrigger>
              <TabsTrigger
                value="logs"
                className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=active]:bg-background data-[state=active]:text-foreground h-8 flex-1 rounded-md text-sm font-medium transition-all data-[state=active]:shadow-sm"
              >
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Logs</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {/* Overview Tab */}
            <TabsContent value="overview" className="mt-0 h-full data-[state=inactive]:hidden">
              <ScrollArea className="h-full" alwaysShowScrollbar>
                <div className="p-4 sm:p-6">
                  <OverviewTab session={session} server={server} />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* User & Device Tab */}
            <TabsContent value="user" className="mt-0 h-full data-[state=inactive]:hidden">
              <ScrollArea className="h-full" alwaysShowScrollbar>
                <div className="p-4 sm:p-6">
                  <UserDeviceTab session={session} server={server} />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* User History Tab */}
            <TabsContent value="history" className="mt-0 h-full data-[state=inactive]:hidden">
              <ScrollArea className="h-full" alwaysShowScrollbar>
                <div className="p-4 sm:p-6">
                  <UserHistoryTab session={session} userId={session.userId} />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Issues Tab */}
            <TabsContent value="issues" className="mt-0 h-full data-[state=inactive]:hidden">
              <ScrollArea className="h-full" alwaysShowScrollbar>
                <div className="p-4 sm:p-6">
                  <IssuesTab userId={session.userId} userName={session.userName} />
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Logs Tab */}
            <TabsContent value="logs" className="mt-0 h-full data-[state=inactive]:hidden">
              <ScrollArea className="h-full" alwaysShowScrollbar>
                <div className="p-4 sm:p-6">
                  <LogsTab sessionId={session.id} />
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer */}
        <div className="bg-muted/30 flex shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span>Session ID:</span>
            <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
              {session.id.slice(0, 8)}...
            </code>
            <CopyButton text={session.id} label="Copy ID" />
          </div>

          {userProfileUrl && (
            <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
              <a href={userProfileUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                View User in {providerMeta?.name || 'Server'}
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
