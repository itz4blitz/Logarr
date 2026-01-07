'use client';

import { formatDistanceToNow, intervalToDuration } from 'date-fns';
import {
  Play,
  Pause,
  Smartphone,
  Monitor,
  Tv,
  Wifi,
  Film,
  Tv2,
  Music,
  Image as ImageIcon,
  Zap,
  Radio,
} from 'lucide-react';
import Image from 'next/image';

import { useSmoothProgress, formatTicksDuration } from '@/hooks/use-smooth-progress';

import type { Session, Server } from '@/lib/api';

import { ProviderIcon } from '@/components/provider-icon';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

function DeviceIcon({
  deviceName,
  clientName,
  className,
}: {
  deviceName?: string | null;
  clientName?: string | null;
  className?: string;
}) {
  const name = (deviceName || clientName || '').toLowerCase();
  if (name.includes('tv') || name.includes('android tv') || name.includes('fire')) {
    return <Tv className={className} />;
  }
  if (
    name.includes('mobile') ||
    name.includes('phone') ||
    name.includes('ios') ||
    name.includes('android')
  ) {
    return <Smartphone className={className} />;
  }
  return <Monitor className={className} />;
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

function formatSessionDuration(startedAt: string, endedAt?: string | null): string {
  const duration = intervalToDuration({
    start: new Date(startedAt),
    end: endedAt ? new Date(endedAt) : new Date(),
  });

  const parts = [];
  if (duration.hours) parts.push(`${duration.hours}h`);
  if (duration.minutes) parts.push(`${duration.minutes}m`);
  if (parts.length === 0) parts.push('< 1m');
  return parts.join(' ');
}

// Construct media image URL based on provider
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
    return `${baseUrl}/Items/${itemId}/Images/Primary?maxHeight=200&quality=90`;
  }

  // For Plex without a direct URL, we can't construct one without the token
  // The provider should have included thumbnailUrl in nowPlaying
  return null;
}

// Construct Jellyfin user avatar URL
function getUserAvatarUrl(server: Server | undefined, userId: string | null): string | null {
  if (!server || !userId) return null;
  const baseUrl = server.url.replace(/\/$/, '');
  return `${baseUrl}/Users/${userId}/Images/Primary?maxHeight=64&quality=90`;
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

function getTranscodeReasonsLabel(reasons?: string[] | null): string {
  if (!reasons || reasons.length === 0) return '';
  return reasons
    .map((r) => {
      switch (r) {
        case 'ContainerNotSupported':
          return 'Container not supported';
        case 'VideoCodecNotSupported':
          return 'Video codec not supported';
        case 'AudioCodecNotSupported':
          return 'Audio codec not supported';
        case 'SubtitleCodecNotSupported':
          return 'Subtitle codec not supported';
        case 'AudioIsExternal':
          return 'External audio';
        case 'SecondaryAudioNotSupported':
          return 'Secondary audio not supported';
        case 'VideoProfileNotSupported':
          return 'Video profile not supported';
        case 'VideoLevelNotSupported':
          return 'Video level not supported';
        case 'VideoBitDepthNotSupported':
          return 'Video bit depth not supported';
        case 'VideoResolutionNotSupported':
          return 'Resolution not supported';
        case 'RefFramesNotSupported':
          return 'Reference frames not supported';
        case 'AnamorphicVideoNotSupported':
          return 'Anamorphic video not supported';
        case 'AudioBitrateNotSupported':
          return 'Audio bitrate not supported';
        case 'AudioChannelsNotSupported':
          return 'Audio channels not supported';
        case 'AudioSampleRateNotSupported':
          return 'Audio sample rate not supported';
        default:
          return r.replace(/([A-Z])/g, ' $1').trim();
      }
    })
    .join(', ');
}

interface SessionCardProps {
  session: Session;
  server?: Server;
  compact?: boolean;
  /** Mini mode for dashboard - even smaller than compact */
  mini?: boolean;
  /** Click handler for opening detail modal */
  onClick?: () => void;
}

export function SessionCard({
  session,
  server,
  compact = false,
  mini = false,
  onClick,
}: SessionCardProps) {
  const nowPlaying = session.nowPlaying;
  const mediaImageUrl = getMediaImageUrl(server, session.nowPlayingItemId, session.nowPlaying);
  const userAvatarUrl = getUserAvatarUrl(server, session.userId);

  const isPlaying = session.isActive && nowPlaying && !nowPlaying.isPaused;
  const isPaused = session.isActive && nowPlaying?.isPaused;
  // Live stream = no known runtime (live TV, channels, etc.)
  const isLiveStream = nowPlaying && !nowPlaying.runTimeTicks;

  // Use smooth progress interpolation for real-time feel
  // This increments progress every 100ms when playing, snaps to server value on update
  const { smoothPositionTicks, smoothProgress } = useSmoothProgress({
    positionTicks: nowPlaying?.positionTicks ?? null,
    runTimeTicks: nowPlaying?.runTimeTicks ?? null,
    isPaused: !!nowPlaying?.isPaused,
    isPlaying: !!isPlaying && !isLiveStream,
  });

  // Use smooth progress for the progress bar, fall back to static for non-playing
  const progress = smoothProgress;

  // Build stream info for tooltip
  const streamInfo = nowPlaying
    ? [
        nowPlaying.videoCodec && `Video: ${nowPlaying.videoCodec.toUpperCase()}`,
        nowPlaying.audioCodec && `Audio: ${nowPlaying.audioCodec.toUpperCase()}`,
        nowPlaying.container && `Container: ${nowPlaying.container.toUpperCase()}`,
      ]
        .filter(Boolean)
        .join(' • ')
    : '';

  const transcodeReasons = getTranscodeReasonsLabel(nowPlaying?.transcodeReasons);

  // Mini mode - ultra compact for dashboard
  if (mini) {
    return (
      <TooltipProvider delayDuration={300}>
        <div
          className={cn(
            'group bg-card/50 hover:bg-card hover:border-border/50 relative flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-1.5 transition-all duration-200',
            onClick && 'cursor-pointer'
          )}
          onClick={onClick}
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={
            onClick
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') onClick();
                }
              : undefined
          }
        >
          {/* Tiny thumbnail */}
          <div className="bg-muted relative h-10 w-10 shrink-0 overflow-hidden rounded">
            {mediaImageUrl ? (
              <Image
                src={mediaImageUrl}
                alt={session.nowPlayingItemName || 'Media'}
                className="h-full w-full object-cover"
                fill
                sizes="40px"
                unoptimized
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : (
              <div className="from-muted to-muted/50 flex h-full w-full items-center justify-center bg-linear-to-br">
                <MediaTypeIcon
                  itemType={session.nowPlayingItemType}
                  className="text-muted-foreground/40 h-4 w-4"
                />
              </div>
            )}
          </div>

          {/* Title + progress */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-foreground group-hover:text-primary truncate text-xs font-medium">
                {session.nowPlayingItemName || 'Unknown Media'}
              </h3>
              {isPlaying && !isLiveStream && (
                <div className="flex h-2.5 shrink-0 items-end gap-0.5">
                  <div
                    className="w-0.5 animate-pulse rounded-full bg-green-500"
                    style={{ height: '60%', animationDelay: '0ms' }}
                  />
                  <div
                    className="w-0.5 animate-pulse rounded-full bg-green-500"
                    style={{ height: '100%', animationDelay: '150ms' }}
                  />
                  <div
                    className="w-0.5 animate-pulse rounded-full bg-green-500"
                    style={{ height: '40%', animationDelay: '300ms' }}
                  />
                </div>
              )}
              {isPlaying && isLiveStream && (
                <div className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                  <div className="h-1 w-1 rounded-full bg-green-500" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div
                      className="h-2.5 w-2.5 animate-ping rounded-full border border-green-500/60"
                      style={{ animationDuration: '1.5s' }}
                    />
                  </div>
                </div>
              )}
            </div>
            {/* Progress bar */}
            {nowPlaying && nowPlaying.runTimeTicks && (
              <div className="mt-1 flex items-center gap-2">
                <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      isPlaying ? 'bg-green-500' : 'bg-muted-foreground/50'
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-muted-foreground text-[9px] tabular-nums">
                  {formatTicksDuration(smoothPositionTicks)}
                </span>
              </div>
            )}
            {nowPlaying && !nowPlaying.runTimeTicks && isPlaying && (
              <div className="mt-1 flex items-center gap-2">
                <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-green-500">
                  <div
                    className="absolute inset-y-0 w-1/2"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent 0%, rgb(134 239 172) 40%, rgb(134 239 172) 60%, transparent 100%)',
                      animation: 'shimmer 2s ease-in-out infinite',
                    }}
                  />
                </div>
                <span className="text-muted-foreground text-[9px]">Live</span>
              </div>
            )}
          </div>

          {/* User avatar + icons */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-5 w-5 cursor-help">
                  <AvatarImage src={userAvatarUrl || undefined} alt={session.userName || 'User'} />
                  <AvatarFallback className="bg-muted text-muted-foreground text-[8px]">
                    {(session.userName || 'U').charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="font-semibold">{session.userName || 'Unknown User'}</p>
                <p className="text-muted-foreground text-xs">
                  {session.deviceName || session.clientName}
                </p>
              </TooltipContent>
            </Tooltip>
            {nowPlaying?.isTranscoding && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Zap className="h-3 w-3 text-orange-500" />
                </TooltipTrigger>
                <TooltipContent>Transcoding</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help">
                  <ProviderIcon providerId={server?.providerId || 'unknown'} size="sm" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{server?.name || 'Unknown Server'}</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          'group bg-card/50 hover:bg-card relative flex h-[160px] flex-col rounded-lg p-3 transition-all duration-200',
          'border border-white/10 hover:border-white/20',
          onClick && 'cursor-pointer'
        )}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={
          onClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') onClick();
              }
            : undefined
        }
      >
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Media Poster - clean without overlays */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'bg-muted relative shrink-0 cursor-pointer overflow-hidden rounded-md shadow-lg',
                  compact ? 'h-[60px] w-[60px]' : 'h-[80px] w-[80px]'
                )}
              >
                {mediaImageUrl ? (
                  <Image
                    src={mediaImageUrl}
                    alt={session.nowPlayingItemName || 'Media'}
                    className="h-full w-full object-contain"
                    fill
                    sizes={compact ? '60px' : '80px'}
                    unoptimized
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="from-muted to-muted/50 flex h-full w-full items-center justify-center bg-linear-to-br">
                    <MediaTypeIcon
                      itemType={session.nowPlayingItemType}
                      className={cn('text-muted-foreground/40', compact ? 'h-6 w-6' : 'h-8 w-8')}
                    />
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[280px]">
              <div className="space-y-1">
                <p className="font-semibold">{session.nowPlayingItemName || 'Unknown Media'}</p>
                {nowPlaying?.seriesName && (
                  <p className="text-muted-foreground text-xs">{nowPlaying.seriesName}</p>
                )}
                <p className="text-muted-foreground text-xs">{session.nowPlayingItemType}</p>
                {streamInfo && (
                  <p className="text-muted-foreground border-border/50 mt-1 border-t pt-1 text-xs">
                    {streamInfo}
                  </p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>

          {/* Content */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Title row with provider icon */}
            <div className="mb-1 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3
                    className={cn(
                      'text-foreground group-hover:text-primary truncate font-semibold transition-colors',
                      compact ? 'text-xs' : 'text-sm'
                    )}
                  >
                    {session.nowPlayingItemName || 'Unknown Media'}
                  </h3>
                  {/* Playing indicator animation - moved next to title */}
                  {isPlaying &&
                    (isLiveStream ? (
                      // Streaming indicator for live content - animated broadcast signal
                      <div className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div
                            className="h-3 w-3 animate-ping rounded-full border border-green-500/60"
                            style={{ animationDuration: '1.5s' }}
                          />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div
                            className="h-3.5 w-3.5 animate-ping rounded-full border border-green-500/30"
                            style={{ animationDuration: '1.5s', animationDelay: '0.3s' }}
                          />
                        </div>
                      </div>
                    ) : (
                      // Audio bars for on-demand content with known duration
                      <div className="flex h-3 shrink-0 items-end gap-0.5">
                        <div
                          className="w-0.5 animate-pulse rounded-full bg-green-500"
                          style={{ height: '60%', animationDelay: '0ms' }}
                        />
                        <div
                          className="w-0.5 animate-pulse rounded-full bg-green-500"
                          style={{ height: '100%', animationDelay: '150ms' }}
                        />
                        <div
                          className="w-0.5 animate-pulse rounded-full bg-green-500"
                          style={{ height: '40%', animationDelay: '300ms' }}
                        />
                      </div>
                    ))}
                </div>
                {!compact && (
                  <p className="text-muted-foreground truncate text-xs">
                    {session.nowPlayingItemType || 'Media'}
                  </p>
                )}
              </div>

              {/* Status indicator */}
              {session.isActive && !compact && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'flex shrink-0 cursor-help items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                        isPlaying && 'bg-green-500/10 text-green-500',
                        isPaused && 'bg-yellow-500/10 text-yellow-500'
                      )}
                    >
                      {isPaused ? (
                        <>
                          <Pause className="h-2.5 w-2.5" />
                          <span>Paused</span>
                        </>
                      ) : isLiveStream ? (
                        <>
                          <Radio className="h-2.5 w-2.5" />
                          <span>Streaming</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-2.5 w-2.5" />
                          <span>Playing</span>
                        </>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {isPaused
                        ? 'Playback is paused'
                        : isLiveStream
                          ? 'Currently streaming'
                          : 'Currently playing'}
                    </p>
                    {nowPlaying && (
                      <p className="text-muted-foreground text-xs">{progress}% complete</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Progress bar or streaming indicator */}
            {session.isActive &&
              nowPlaying &&
              (nowPlaying.runTimeTicks ? (
                // Regular progress bar when we know the duration
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn('cursor-help', compact ? 'mb-1' : 'mb-2')}>
                      <div className="bg-muted h-1 overflow-hidden rounded-full">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isPlaying ? 'bg-green-500' : 'bg-muted-foreground/50'
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      {!compact && (
                        <div className="text-muted-foreground mt-0.5 flex justify-between text-[10px]">
                          <span>{formatTicksDuration(smoothPositionTicks)}</span>
                          <span>{formatDuration(nowPlaying.runTimeTicks)}</span>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{progress}% complete</p>
                    <p className="text-muted-foreground text-xs">
                      {formatTicksDuration(smoothPositionTicks)} of{' '}
                      {formatDuration(nowPlaying.runTimeTicks)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : isPlaying ? (
                // Streaming indicator when we don't know the duration (live/stream)
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cn('cursor-help', compact ? 'mb-1' : 'mb-2')}>
                      <div className="relative h-1 overflow-hidden rounded-full bg-green-500">
                        {/* Fat shimmer bubble - light green-300 */}
                        <div
                          className="absolute inset-y-0 w-1/2"
                          style={{
                            background:
                              'linear-gradient(90deg, transparent 0%, rgb(134 239 172) 40%, rgb(134 239 172) 60%, transparent 100%)',
                            animation: 'shimmer 2s ease-in-out infinite',
                          }}
                        />
                      </div>
                      <style>{`
                        @keyframes shimmer {
                          0% { transform: translateX(-100%); }
                          100% { transform: translateX(200%); }
                        }
                      `}</style>
                      {!compact && (
                        <div className="text-muted-foreground mt-0.5 flex justify-between text-[10px]">
                          <span>{formatTicksDuration(smoothPositionTicks)}</span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                            Streaming
                          </span>
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Live stream in progress</p>
                    <p className="text-muted-foreground text-xs">
                      {formatTicksDuration(smoothPositionTicks)} elapsed
                    </p>
                  </TooltipContent>
                </Tooltip>
              ) : null)}
          </div>
        </div>

        {/* User row - spans full width below the poster/content area */}
        <div className="mt-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className={cn('cursor-help', compact ? 'h-5 w-5' : 'h-6 w-6')}>
                <AvatarImage src={userAvatarUrl || undefined} alt={session.userName || 'User'} />
                <AvatarFallback
                  className={cn(
                    'bg-muted text-muted-foreground',
                    compact ? 'text-[8px]' : 'text-[9px]'
                  )}
                >
                  {(session.userName || 'U').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-semibold">{session.userName || 'Unknown User'}</p>
                {session.ipAddress && (
                  <p className="text-muted-foreground text-xs">IP: {session.ipAddress}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
          <div className="min-w-0 flex-1">
            <p
              className={cn('text-muted-foreground truncate', compact ? 'text-[10px]' : 'text-xs')}
            >
              {session.userName || 'Unknown'} •{' '}
              {session.deviceName || session.clientName || 'Unknown'}
            </p>
          </div>

          {/* Playback info icons - with tooltips */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help">
                  <ProviderIcon providerId={server?.providerId || 'unknown'} size="sm" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-semibold">{server?.name || 'Unknown Server'}</p>
                <p className="text-muted-foreground text-xs">{server?.url || 'No URL'}</p>
              </TooltipContent>
            </Tooltip>

            {nowPlaying && !compact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      'flex cursor-help items-center gap-0.5 text-[10px]',
                      nowPlaying.isTranscoding ? 'text-orange-500' : 'text-green-500'
                    )}
                  >
                    {nowPlaying.isTranscoding ? (
                      <Zap className="h-3 w-3" />
                    ) : (
                      <Wifi className="h-3 w-3" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px]">
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {nowPlaying.isTranscoding
                        ? 'Transcoding'
                        : getPlayMethodLabel(nowPlaying.playMethod)}
                    </p>
                    {streamInfo && <p className="text-muted-foreground text-xs">{streamInfo}</p>}
                    {nowPlaying.isTranscoding && transcodeReasons && (
                      <p className="border-border/50 mt-1 border-t pt-1 text-xs text-orange-400">
                        Reason: {transcodeReasons}
                      </p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {!compact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <DeviceIcon
                      deviceName={session.deviceName}
                      clientName={session.clientName}
                      className="text-muted-foreground h-3.5 w-3.5"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1">
                    <p className="font-semibold">{session.deviceName || 'Unknown Device'}</p>
                    <p className="text-muted-foreground text-xs">
                      {session.clientName} {session.clientVersion && `v${session.clientVersion}`}
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Subtle bottom info - only show in non-compact mode */}
        {!compact && (
          <div className="text-muted-foreground/70 border-border/30 flex shrink-0 items-center justify-between border-t pt-2 text-[10px]">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  {formatDistanceToNow(new Date(session.startedAt), { addSuffix: true })}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Session started: {new Date(session.startedAt).toLocaleString()}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help">
                  {formatSessionDuration(session.startedAt, session.endedAt)}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Total session duration</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export function SessionCardSkeleton({
  compact = false,
  mini = false,
}: {
  compact?: boolean;
  mini?: boolean;
}) {
  if (mini) {
    return (
      <div className="bg-card/50 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
        <Skeleton className="h-10 w-10 shrink-0 rounded" />
        <div className="flex flex-1 flex-col gap-1">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-1 w-full" />
        </div>
        <Skeleton className="h-5 w-5 rounded-full" />
      </div>
    );
  }

  return (
    <div className="bg-card/50 flex h-[160px] flex-col rounded-lg border border-white/10 p-3">
      {/* Top section: poster + content side by side */}
      <div className="flex min-h-0 flex-1 gap-3">
        <Skeleton
          className={cn('shrink-0 rounded-md', compact ? 'h-[60px] w-[60px]' : 'h-[80px] w-[80px]')}
        />
        <div className="flex flex-1 flex-col">
          <Skeleton className="mb-1 h-4 w-3/4" />
          {!compact && <Skeleton className="mb-2 h-3 w-1/2" />}
          <Skeleton className="h-1 w-full" />
        </div>
      </div>
      {/* User row - spans full width */}
      <div className="mt-auto flex items-center gap-2">
        <Skeleton className={cn('rounded-full', compact ? 'h-5 w-5' : 'h-6 w-6')} />
        <Skeleton className="h-3 flex-1" />
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-4 rounded" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      {/* Bottom info */}
      {!compact && (
        <div className="flex shrink-0 items-center justify-between border-t pt-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-12" />
        </div>
      )}
    </div>
  );
}
