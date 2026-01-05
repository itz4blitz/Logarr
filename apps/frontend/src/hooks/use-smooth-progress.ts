'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

// Ticks are in 100-nanosecond units (10,000,000 ticks = 1 second)
const TICKS_PER_SECOND = 10_000_000;
const TICKS_PER_MS = 10_000;
const UPDATE_INTERVAL_MS = 100; // Update every 100ms for smooth animation

interface UseSmoothProgressOptions {
  /** Current position in ticks from the server */
  positionTicks: string | null;
  /** Total runtime in ticks */
  runTimeTicks: string | null;
  /** Whether playback is paused */
  isPaused: boolean;
  /** Whether the session is actively playing */
  isPlaying: boolean;
}

interface UseSmoothProgressResult {
  /** Interpolated position in ticks (as string for consistency) */
  smoothPositionTicks: string | null;
  /** Progress percentage 0-100 */
  smoothProgress: number;
  /** Last server update timestamp */
  lastServerUpdate: number;
}

/**
 * Hook for smooth client-side progress interpolation.
 *
 * When the server sends a position update (e.g., every 10s for Plex),
 * this hook interpolates the position at a faster rate (100ms) to create
 * a smooth progress bar animation, like apps such as Tautulli do.
 *
 * When paused, the position freezes.
 * When a new server update arrives, the position snaps to the accurate value.
 */
export function useSmoothProgress({
  positionTicks,
  runTimeTicks,
  isPaused,
  isPlaying,
}: UseSmoothProgressOptions): UseSmoothProgressResult {
  // Parse server values
  const serverPosition = positionTicks ? parseInt(positionTicks) : 0;
  const duration = runTimeTicks ? parseInt(runTimeTicks) : 0;

  // State for displayed position
  const [displayPosition, setDisplayPosition] = useState(serverPosition);
  const [lastServerUpdate, setLastServerUpdate] = useState(0);

  // Sync display position when server position changes
  // Using key pattern to avoid lint issues with effect dependencies
  const serverPositionKey = serverPosition.toString();

  useEffect(() => {
    const now = Date.now();
    setDisplayPosition(serverPosition);
    setLastServerUpdate(now);
  }, [serverPositionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Interpolation callback
  const interpolate = useCallback(() => {
    setDisplayPosition((prev) => {
      const newPos = prev + UPDATE_INTERVAL_MS * TICKS_PER_MS;
      return Math.min(newPos, duration);
    });
  }, [duration]);

  // Interpolation timer
  useEffect(() => {
    // Only interpolate if playing and not paused
    if (!isPlaying || isPaused || duration === 0) {
      return;
    }

    const intervalId = setInterval(interpolate, UPDATE_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [isPlaying, isPaused, duration, interpolate]);

  // Calculate progress percentage
  const smoothProgress = useMemo(() => {
    if (duration <= 0) return 0;
    return Math.min(100, Math.round((displayPosition / duration) * 100));
  }, [displayPosition, duration]);

  return {
    smoothPositionTicks: displayPosition.toString(),
    smoothProgress,
    lastServerUpdate,
  };
}

/**
 * Format ticks to duration string (HH:MM:SS or MM:SS)
 */
export function formatTicksDuration(ticks: string | null): string {
  if (!ticks) return '--:--';
  const totalSeconds = Math.floor(parseInt(ticks) / TICKS_PER_SECOND);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
