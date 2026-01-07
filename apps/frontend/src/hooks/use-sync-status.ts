'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

import type { Socket } from 'socket.io-client';

// Lazy load config to avoid SSR issues
function getSocketUrl(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { config } = require('@/lib/config');
    return config.wsUrl;
  } catch (e) {
    console.error('[SyncStatus] Failed to load config:', e);
    return '';
  }
}

/** Minimum interval between UI state updates (ms) */
const UI_UPDATE_THROTTLE_MS = 250;

/** Progress interpolation interval (ms) */
const INTERPOLATION_INTERVAL_MS = 50;

/** Progress interpolation step size (percentage points per interval) */
const INTERPOLATION_STEP = 2;

/**
 * Progress information for file ingestion sync
 */
export interface SyncProgress {
  serverId: string;
  serverName: string;
  status: 'discovering' | 'processing' | 'watching' | 'error';
  totalFiles: number;
  /** Files that have started processing (tailer created) */
  processedFiles: number;
  /** Files that have completed their initial read */
  filesCompleted: number;
  skippedFiles: number;
  activeFiles: number;
  queuedFiles: number;
  currentFiles: string[];
  error?: string;
  /** Progress percentage (0-100) - based on filesCompleted */
  progress: number;
  /** Whether this is the initial sync (never completed before) */
  isInitialSync: boolean;
}

/**
 * Global sync status across all servers
 */
export interface GlobalSyncStatus {
  /** Whether any server is currently syncing */
  isSyncing: boolean;
  /** Number of servers currently syncing */
  syncingCount: number;
  /** Total servers being tracked */
  totalServers: number;
  /** Overall progress (0-100) - raw value from backend */
  overallProgress: number;
  /** Smoothly interpolated progress for UI (never goes backwards during sync) */
  displayProgress: number;
  /** Individual server progress */
  servers: Map<string, SyncProgress>;
  /** Whether this is the first-ever sync (fresh install) */
  isInitialSync: boolean;
}

interface UseSyncStatusOptions {
  enabled?: boolean;
  onProgress?: (progress: SyncProgress) => void;
}

/**
 * Hook to track sync status across all servers via WebSocket
 */
export function useSyncStatus(options: UseSyncStatusOptions = {}) {
  console.log('[SyncStatus] Hook called, enabled:', options.enabled ?? true);

  const { enabled = true, onProgress } = options;
  const [connected, setConnected] = useState(false);
  const [syncStatus, setSyncStatus] = useState<GlobalSyncStatus>({
    isSyncing: false,
    syncingCount: 0,
    totalServers: 0,
    overallProgress: 100,
    displayProgress: 100,
    servers: new Map(),
    isInitialSync: false,
  });
  const socketRef = useRef<Socket | null>(null);
  /** Track last UI update time for throttling */
  const lastUpdateRef = useRef<number>(0);
  /** Pending progress updates to batch */
  const pendingUpdatesRef = useRef<Map<string, SyncProgress>>(new Map());
  /** RAF handle for cleanup */
  const rafRef = useRef<number | null>(null);
  /** Current display progress (for interpolation) */
  const displayProgressRef = useRef<number>(100);
  /** Target progress to interpolate toward */
  const targetProgressRef = useRef<number>(100);
  /** Minimum displayed progress per server (anti-regression) */
  const minDisplayedProgressRef = useRef<Map<string, number>>(new Map());
  /** Interval handle for progress interpolation */
  const interpolationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Flush pending updates to state using requestAnimationFrame
   * This batches multiple rapid updates into a single React render
   */
  const flushUpdates = useCallback(() => {
    const pending = pendingUpdatesRef.current;
    if (pending.size === 0) return;

    setSyncStatus((prev) => {
      const newServers = new Map(prev.servers);
      const minProgress = minDisplayedProgressRef.current;

      // Apply all pending updates with anti-regression
      for (const [serverId, rawProgress] of pending) {
        // Check if this is a new sync cycle (progress went from 100 to something lower)
        const prevProgress = newServers.get(serverId);
        const isNewSyncCycle = prevProgress?.progress === 100 && rawProgress.progress < 100;

        let adjustedProgress = rawProgress;

        if (isNewSyncCycle) {
          // Reset anti-regression for new sync cycle
          minProgress.set(serverId, rawProgress.progress);
        } else {
          // Apply anti-regression: never show lower progress than we've shown before
          const currentMin = minProgress.get(serverId) ?? 0;
          if (rawProgress.progress < currentMin) {
            // Use the minimum we've shown, not the actual value
            adjustedProgress = { ...rawProgress, progress: currentMin };
          } else {
            // Update minimum to current progress
            minProgress.set(serverId, rawProgress.progress);
          }
        }

        newServers.set(serverId, adjustedProgress);
      }

      // Clear pending updates
      pending.clear();

      // Calculate new global status
      const syncingServers = Array.from(newServers.values()).filter(
        (s) => s.status === 'discovering' || s.status === 'processing'
      );

      const isInitialSync = Array.from(newServers.values()).some((s) => s.isInitialSync);

      // Calculate weighted progress based on filesCompleted (not processedFiles)
      // This prevents bouncing - progress only increases as files FINISH
      let overallProgress = 100;
      if (syncingServers.length > 0) {
        const totalFiles = syncingServers.reduce((sum, s) => sum + s.totalFiles, 0);
        // Use filesCompleted if available, fall back to processedFiles for backwards compat
        const completedFiles = syncingServers.reduce(
          (sum, s) => sum + (s.filesCompleted ?? s.processedFiles),
          0
        );
        overallProgress = totalFiles > 0 ? Math.round((completedFiles / totalFiles) * 100) : 0;
      }

      // Update target for interpolation
      targetProgressRef.current = overallProgress;

      // When sync completes (100%), immediately show 100%
      if (overallProgress === 100) {
        displayProgressRef.current = 100;
        // Clear anti-regression minimums when complete
        minProgress.clear();
      }

      return {
        isSyncing: syncingServers.length > 0,
        syncingCount: syncingServers.length,
        totalServers: newServers.size,
        overallProgress,
        displayProgress: displayProgressRef.current,
        servers: newServers,
        isInitialSync,
      };
    });

    lastUpdateRef.current = Date.now();
    rafRef.current = null;
  }, []);

  /**
   * Queue a progress update with throttling and batching
   * Uses requestAnimationFrame to sync with browser rendering
   */
  const queueProgressUpdate = useCallback(
    (progress: SyncProgress) => {
      pendingUpdatesRef.current.set(progress.serverId, progress);

      const now = Date.now();
      const timeSinceLastUpdate = now - lastUpdateRef.current;

      // Important updates (status changes, completion) flush immediately
      const isImportant =
        progress.status === 'watching' ||
        progress.status === 'error' ||
        progress.progress === 100 ||
        progress.progress === 0;

      if (isImportant) {
        // Cancel any pending RAF and flush immediately
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        flushUpdates();
        return;
      }

      // Throttle regular updates
      if (timeSinceLastUpdate < UI_UPDATE_THROTTLE_MS) {
        // Schedule update for next frame if not already scheduled
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(flushUpdates);
        }
        return;
      }

      // Enough time has passed, update on next frame
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(flushUpdates);
      }
    },
    [flushUpdates]
  );

  useEffect(() => {
    if (!enabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socketUrl = getSocketUrl();
    if (!socketUrl) {
      console.error('[SyncStatus] No socket URL configured');
      return;
    }

    console.log('[SyncStatus] Connecting to:', `${socketUrl}/logs`);

    const socket = io(`${socketUrl}/logs`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[SyncStatus] ✅ WebSocket connected! Socket ID:', socket.id);
      setConnected(true);
      // Request current sync status in case we missed earlier events
      socket.emit('get-sync-status');
    });

    socket.on('disconnect', (reason) => {
      console.log('[SyncStatus] ❌ WebSocket disconnected:', reason);
      setConnected(false);
    });

    // Listen for file ingestion progress updates
    socket.on('file-ingestion:progress', (progress: SyncProgress) => {
      console.log(
        '[SyncStatus] 📊 Received progress:',
        progress.serverName,
        progress.status,
        progress.progress + '%',
        'isInitialSync:',
        progress.isInitialSync
      );

      // Queue update with throttling and batching to prevent UI lockup
      queueProgressUpdate(progress);
      onProgress?.(progress);
    });

    socket.on('connect_error', (error) => {
      console.error('Sync status socket connection error:', error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      // Clean up any pending RAF
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, onProgress, queueProgressUpdate]);

  // Progress interpolation effect - smoothly animate toward target
  useEffect(() => {
    // Start interpolation when syncing
    if (syncStatus.isSyncing && interpolationIntervalRef.current === null) {
      interpolationIntervalRef.current = setInterval(() => {
        const current = displayProgressRef.current;
        const target = targetProgressRef.current;

        // Don't interpolate if at target
        if (current === target) return;

        // Smoothly move toward target
        let newProgress: number;
        if (current < target) {
          // Moving forward - smooth interpolation
          newProgress = Math.min(current + INTERPOLATION_STEP, target);
        } else {
          // Target went backwards (shouldn't happen with anti-regression)
          // Jump to target immediately to avoid confusion
          newProgress = target;
        }

        displayProgressRef.current = newProgress;

        // Update state to trigger re-render
        setSyncStatus((prev) => ({
          ...prev,
          displayProgress: newProgress,
        }));
      }, INTERPOLATION_INTERVAL_MS);
    }

    // Stop interpolation when not syncing
    if (!syncStatus.isSyncing && interpolationIntervalRef.current !== null) {
      clearInterval(interpolationIntervalRef.current);
      interpolationIntervalRef.current = null;
      // Reset display progress to 100 when done
      displayProgressRef.current = 100;
      targetProgressRef.current = 100;
    }

    return () => {
      if (interpolationIntervalRef.current !== null) {
        clearInterval(interpolationIntervalRef.current);
        interpolationIntervalRef.current = null;
      }
    };
  }, [syncStatus.isSyncing]);

  // Get progress for a specific server
  const getServerProgress = useCallback(
    (serverId: string): SyncProgress | undefined => {
      return syncStatus.servers.get(serverId);
    },
    [syncStatus.servers]
  );

  return {
    connected,
    ...syncStatus,
    getServerProgress,
  };
}
