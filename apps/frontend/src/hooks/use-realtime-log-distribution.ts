'use client';

import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

import type { LogDistribution, LogEntry } from '@/lib/api';
import type { Socket } from 'socket.io-client';

import { config } from '@/lib/config';

const SOCKET_URL = config.wsUrl;

interface UseRealtimeLogDistributionOptions {
  initialData: LogDistribution | undefined;
  enabled?: boolean;
}

/**
 * Enhances log distribution data with real-time WebSocket updates.
 * Listens to incoming logs and increments counts in real-time.
 */
export function useRealtimeLogDistribution({
  initialData,
  enabled = true,
}: UseRealtimeLogDistributionOptions) {
  // Track incremental counts since last poll
  const [deltas, setDeltas] = useState({
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
    total: 0,
  });

  // Track source deltas for top sources
  const sourceDeltas = useRef<Map<string, { count: number; errorCount: number }>>(new Map());

  const socketRef = useRef<Socket | null>(null);
  const lastInitialDataRef = useRef<LogDistribution | undefined>(undefined);

  // Reset deltas when initialData changes (new poll arrived)
  useEffect(() => {
    if (initialData && initialData !== lastInitialDataRef.current) {
      // Check if the totals actually changed (indicating a fresh poll)
      if (lastInitialDataRef.current?.total !== initialData.total) {
        setDeltas({ error: 0, warn: 0, info: 0, debug: 0, total: 0 });
        sourceDeltas.current.clear();
      }
      lastInitialDataRef.current = initialData;
    }
  }, [initialData]);

  // Connect to WebSocket
  useEffect(() => {
    if (!enabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(`${SOCKET_URL}/logs`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[RealtimeLogDistribution] Connected to WebSocket');
      // Subscribe to all logs (no filters - we want everything for counts)
      socket.emit('subscribe', {});
    });

    socket.on('disconnect', () => {
      console.log('[RealtimeLogDistribution] Disconnected from WebSocket');
    });

    socket.on('log', (log: LogEntry) => {
      console.log(
        '[RealtimeLogDistribution] Received log:',
        log.level,
        log.message?.substring(0, 50)
      );

      const rawLevel = log.level?.toLowerCase();
      // Normalize level - handle 'trace' and 'fatal' by mapping to closest equivalent
      let level: 'error' | 'warn' | 'info' | 'debug';
      if (rawLevel === 'error' || rawLevel === 'fatal') {
        level = 'error';
      } else if (rawLevel === 'warn' || rawLevel === 'warning') {
        level = 'warn';
      } else if (rawLevel === 'info') {
        level = 'info';
      } else {
        // debug, trace, or unknown
        level = 'debug';
      }

      setDeltas((prev) => ({
        ...prev,
        [level]: prev[level] + 1,
        total: prev.total + 1,
      }));

      // Track source deltas
      if (log.source) {
        const existing = sourceDeltas.current.get(log.source) || { count: 0, errorCount: 0 };
        existing.count += 1;
        if (level === 'error') {
          existing.errorCount += 1;
        }
        sourceDeltas.current.set(log.source, existing);
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[RealtimeLogDistribution] Connection error:', error);
    });

    return () => {
      socket.emit('unsubscribe');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled]);

  // Compute enhanced data with real-time deltas
  const realtimeData: LogDistribution | undefined = initialData
    ? {
        error: initialData.error + deltas.error,
        warn: initialData.warn + deltas.warn,
        info: initialData.info + deltas.info,
        debug: initialData.debug + deltas.debug,
        total: initialData.total + deltas.total,
        topSources: initialData.topSources.map((source) => {
          const delta = sourceDeltas.current.get(source.source);
          if (delta) {
            return {
              ...source,
              count: source.count + delta.count,
              errorCount: source.errorCount + delta.errorCount,
            };
          }
          return source;
        }),
      }
    : undefined;

  return {
    data: realtimeData,
    deltas,
    isRealtime: socketRef.current?.connected ?? false,
  };
}
