'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

import { queryKeys } from './use-api';

import type { Socket } from 'socket.io-client';
import type { Session } from '@/lib/api';

import { config } from '@/lib/config';

const SOCKET_URL = config.wsUrl;

interface SessionSubscription {
  serverId?: string;
}

interface PlaybackProgressData {
  sessionKey?: string;
  ratingKey?: string;
  viewOffset?: number;
  state?: string;
  positionTicks?: number;
}

interface SessionUpdatePayload {
  type: 'sessions' | 'playbackStart' | 'playbackStop' | 'playbackProgress';
  serverId: string;
  data: unknown;
}

interface UseSessionSocketOptions {
  enabled?: boolean;
  serverId?: string;
}

export function useSessionSocket(options: UseSessionSocketOptions = {}) {
  const { enabled = true, serverId } = options;
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const subscriptionRef = useRef<SessionSubscription>({});
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    console.log('[SessionSocket] Connecting to', `${SOCKET_URL}/sessions`);

    const socket = io(`${SOCKET_URL}/sessions`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[SessionSocket] Connected');
      setConnected(true);
      // Subscribe to sessions
      const subscription: SessionSubscription = { serverId };
      socket.emit('subscribe', subscription);
      subscriptionRef.current = subscription;
    });

    socket.on('disconnect', () => {
      console.log('[SessionSocket] Disconnected');
      setConnected(false);
    });

    socket.on('sessionUpdate', (payload: SessionUpdatePayload) => {
      // For progress updates, update the cache directly for instant UI response
      if (payload.type === 'playbackProgress') {
        const progressData = payload.data as PlaybackProgressData;

        // Update active sessions cache directly
        queryClient.setQueryData<Session[]>(queryKeys.activeSessions, (oldData) => {
          if (!oldData) return oldData;
          return oldData.map((session) => {
            // Match by sessionKey (Plex) or by serverId + ratingKey
            const isMatch =
              (progressData.sessionKey && session.externalId === progressData.sessionKey) ||
              (session.serverId === payload.serverId &&
                session.nowPlaying?.itemId === progressData.ratingKey);

            if (isMatch && session.nowPlaying && progressData.positionTicks !== undefined) {
              return {
                ...session,
                nowPlaying: {
                  ...session.nowPlaying,
                  positionTicks: String(progressData.positionTicks),
                  isPaused: progressData.state === 'paused',
                },
              };
            }
            return session;
          });
        });

        // Also invalidate to ensure eventual consistency
        queryClient.invalidateQueries({ queryKey: queryKeys.activeSessions });
      } else {
        // For other updates (sessions, start, stop), invalidate to refetch
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
        queryClient.invalidateQueries({ queryKey: queryKeys.activeSessions });
      }
    });

    socket.on('connect_error', (error) => {
      console.error('[SessionSocket] Connection error:', error);
    });

    return () => {
      socket.emit('unsubscribe');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, serverId, queryClient]);

  // Re-subscribe when filters change
  useEffect(() => {
    const socket = socketRef.current;
    if (socket === null || !connected) return;

    const newSubscription: SessionSubscription = { serverId };
    if (newSubscription.serverId !== subscriptionRef.current.serverId) {
      socket.emit('unsubscribe');
      socket.emit('subscribe', newSubscription);
      subscriptionRef.current = newSubscription;
    }
  }, [connected, serverId]);

  return { connected };
}
