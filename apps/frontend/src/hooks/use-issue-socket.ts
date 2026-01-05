'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback, useRef, useState } from 'react';
import { io } from 'socket.io-client';

import { queryKeys } from './use-api';

import type { Issue } from '@/lib/api';
import type { Socket } from 'socket.io-client';

import { config } from '@/lib/config';

const WS_URL = config.wsUrl;

interface IssueUpdatePayload {
  type: 'new' | 'updated' | 'resolved' | 'merged';
  issueId: string;
  data?: Issue;
}

export interface BackfillProgress {
  status: 'started' | 'progress' | 'completed' | 'error';
  totalLogs: number;
  processedLogs: number;
  issuesCreated: number;
  issuesUpdated: number;
  currentBatch?: number;
  totalBatches?: number;
  error?: string;
}

interface UseIssueSocketOptions {
  enabled?: boolean;
  serverId?: string;
  onNewIssue?: (issue: Issue) => void;
  onIssueUpdate?: (issue: Issue) => void;
  onIssueResolved?: (issue: Issue) => void;
  onBackfillProgress?: (progress: BackfillProgress) => void;
}

export function useIssueSocket(options: UseIssueSocketOptions = {}) {
  const {
    enabled = true,
    serverId,
    onNewIssue,
    onIssueUpdate,
    onIssueResolved,
    onBackfillProgress,
  } = options;
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleNewIssue = useCallback(
    (payload: IssueUpdatePayload) => {
      // Invalidate issues list and stats
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issueStats() });

      if (payload.data && onNewIssue) {
        onNewIssue(payload.data);
      }
    },
    [queryClient, onNewIssue]
  );

  const handleIssueUpdate = useCallback(
    (payload: IssueUpdatePayload) => {
      // Invalidate issues list and the specific issue
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(payload.issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issueStats() });

      if (payload.data && onIssueUpdate) {
        onIssueUpdate(payload.data);
      }
    },
    [queryClient, onIssueUpdate]
  );

  const handleIssueResolved = useCallback(
    (payload: IssueUpdatePayload) => {
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.issue(payload.issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issueStats() });

      if (payload.data && onIssueResolved) {
        onIssueResolved(payload.data);
      }
    },
    [queryClient, onIssueResolved]
  );

  const handleStatsUpdate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.issueStats() });
  }, [queryClient]);

  const handleBackfillProgress = useCallback(
    (progress: BackfillProgress) => {
      if (onBackfillProgress) {
        onBackfillProgress(progress);
      }

      // When backfill completes, invalidate queries
      if (progress.status === 'completed') {
        queryClient.invalidateQueries({ queryKey: ['issues'] });
        queryClient.invalidateQueries({ queryKey: queryKeys.issueStats() });
      }
    },
    [queryClient, onBackfillProgress]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Connect to issues namespace
    const socket = io(`${WS_URL}/issues`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[IssueSocket] Connected to issues namespace');
      setIsConnected(true);
      // Subscribe to updates
      socket.emit('subscribe', { serverId: serverId ?? undefined });
    });

    socket.on('disconnect', () => {
      console.log('[IssueSocket] Disconnected from issues namespace');
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('[IssueSocket] Connection error:', error.message);
    });

    // Listen for issue events
    socket.on('issue:new', handleNewIssue);
    socket.on('issue:updated', handleIssueUpdate);
    socket.on('issue:resolved', handleIssueResolved);
    socket.on('stats:updated', handleStatsUpdate);
    socket.on('backfill:progress', handleBackfillProgress);

    return () => {
      socket.emit('unsubscribe', { serverId: serverId ?? undefined });
      socket.off('issue:new', handleNewIssue);
      socket.off('issue:updated', handleIssueUpdate);
      socket.off('issue:resolved', handleIssueResolved);
      socket.off('stats:updated', handleStatsUpdate);
      socket.off('backfill:progress', handleBackfillProgress);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    enabled,
    serverId,
    handleNewIssue,
    handleIssueUpdate,
    handleIssueResolved,
    handleStatsUpdate,
    handleBackfillProgress,
  ]);

  return {
    connected: isConnected,
  };
}
