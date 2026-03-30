import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { createCorsOriginValidator } from '../../config/cors';

import { IssuesService } from './issues.service';

interface IssueUpdatePayload {
  type: 'new' | 'updated' | 'resolved' | 'merged';
  issueId: string;
  data?: unknown;
}

interface IssueBroadcast {
  id: string;
  serverId?: string;
  [key: string]: unknown;
}

interface BackfillProgressPayload {
  status: 'started' | 'progress' | 'completed' | 'error';
  totalLogs: number;
  processedLogs: number;
  issuesCreated: number;
  issuesUpdated: number;
  currentBatch?: number;
  totalBatches?: number;
  error?: string;
}

// CORS_ORIGIN is validated at startup via validateEnv() in main.ts
// If missing, app will fail fast before this gateway loads
@WebSocketGateway({
  namespace: 'issues',
  cors: {
    origin: createCorsOriginValidator(process.env['CORS_ORIGIN'] ?? 'http://localhost:3000'),
    credentials: true,
  },
})
export class IssuesGateway {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(IssuesGateway.name);

  constructor(private readonly issuesService: IssuesService) {}

  /**
   * Subscribe to issue updates for a specific server or all servers
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() data: { serverId?: string },
    @ConnectedSocket() client: Socket
  ): Promise<{ subscribed: true; room: string }> {
    // Join a room for the specific server or 'all' for all issues
    const room = data.serverId ?? 'all';
    await client.join(`issues:${room}`);
    return { subscribed: true, room };
  }

  /**
   * Unsubscribe from issue updates
   */
  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @MessageBody() data: { serverId?: string },
    @ConnectedSocket() client: Socket
  ): Promise<{ unsubscribed: true; room: string }> {
    const room = data.serverId ?? 'all';
    await client.leave(`issues:${room}`);
    return { unsubscribed: true, room };
  }

  /**
   * Broadcast a new issue to subscribers
   */
  broadcastNewIssue(issue: IssueBroadcast): void {
    const payload: IssueUpdatePayload = {
      type: 'new',
      issueId: issue.id,
      data: issue,
    };

    // Broadcast to both server-specific room and 'all' room
    this.server.to('issues:all').emit('issue:new', payload);
    if (issue.serverId !== undefined && issue.serverId.length > 0) {
      this.server.to(`issues:${issue.serverId}`).emit('issue:new', payload);
    }
  }

  /**
   * Broadcast an issue update to subscribers
   */
  broadcastIssueUpdate(issue: IssueBroadcast): void {
    const payload: IssueUpdatePayload = {
      type: 'updated',
      issueId: issue.id,
      data: issue,
    };

    this.server.to('issues:all').emit('issue:updated', payload);
    if (issue.serverId !== undefined && issue.serverId.length > 0) {
      this.server.to(`issues:${issue.serverId}`).emit('issue:updated', payload);
    }
  }

  /**
   * Broadcast when an issue is resolved
   */
  broadcastIssueResolved(issue: IssueBroadcast): void {
    const payload: IssueUpdatePayload = {
      type: 'resolved',
      issueId: issue.id,
      data: issue,
    };

    this.server.to('issues:all').emit('issue:resolved', payload);
    if (issue.serverId !== undefined && issue.serverId.length > 0) {
      this.server.to(`issues:${issue.serverId}`).emit('issue:resolved', payload);
    }
  }

  /**
   * Broadcast stats update
   */
  broadcastStatsUpdate(stats: unknown, serverId?: string): void {
    this.server.to('issues:all').emit('stats:updated', stats);
    if (serverId !== undefined && serverId.length > 0) {
      this.server.to(`issues:${serverId}`).emit('stats:updated', stats);
    }
  }

  /**
   * Broadcast backfill progress
   */
  broadcastBackfillProgress(progress: BackfillProgressPayload, serverId?: string): void {
    this.logger.log(
      `Broadcasting backfill progress: ${progress.status} - ${progress.processedLogs}/${progress.totalLogs}`
    );
    this.server.to('issues:all').emit('backfill:progress', progress);
    if (serverId !== undefined && serverId.length > 0) {
      this.server.to(`issues:${serverId}`).emit('backfill:progress', progress);
    }
  }
}
