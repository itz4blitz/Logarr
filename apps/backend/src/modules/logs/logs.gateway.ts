import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface LogSubscription {
  serverId?: string;
  levels?: string[];
  logSources?: ('api' | 'file')[];
}

interface BroadcastLog {
  id: string;
  serverId: string;
  timestamp: Date;
  level: string;
  message: string;
  source?: string;
  logSource?: 'api' | 'file';
}

// CORS_ORIGIN is validated at startup via validateEnv() in main.ts
// If missing, app will fail fast before this gateway loads
@WebSocketGateway({
  namespace: 'logs',
  cors: {
    origin: process.env['CORS_ORIGIN']!,
    credentials: true,
  },
})
export class LogsGateway {
  @WebSocketServer()
  server: Server;

  private subscriptions = new Map<string, LogSubscription>();

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: LogSubscription) {
    // Store full subscription for per-client filtering
    this.subscriptions.set(client.id, data);
    return { subscribed: true, filters: data };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket) {
    this.subscriptions.delete(client.id);
    return { unsubscribed: true };
  }

  handleDisconnect(client: Socket) {
    this.subscriptions.delete(client.id);
  }

  /**
   * Check if a log matches a client's subscription filters
   */
  private matchesSubscription(log: BroadcastLog, subscription: LogSubscription): boolean {
    // Filter by serverId
    if (subscription.serverId && log.serverId !== subscription.serverId) {
      return false;
    }

    // Filter by levels
    if (subscription.levels && subscription.levels.length > 0) {
      if (!subscription.levels.includes(log.level)) {
        return false;
      }
    }

    // Filter by logSources
    if (subscription.logSources && subscription.logSources.length > 0) {
      if (!log.logSource || !subscription.logSources.includes(log.logSource)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Broadcast a new log entry to subscribers
   * Filters logs per-client based on their subscription
   */
  broadcastLog(log: BroadcastLog) {
    // Iterate through all subscriptions and send to matching clients
    for (const [clientId, subscription] of this.subscriptions.entries()) {
      if (this.matchesSubscription(log, subscription)) {
        this.server.to(clientId).emit('log', log);
      }
    }
  }

  /**
   * Broadcast file backfill progress
   */
  broadcastFileBackfillProgress(
    progress: {
      status: 'started' | 'progress' | 'completed' | 'error';
      totalFiles: number;
      processedFiles: number;
      totalLines: number;
      processedLines: number;
      entriesIngested: number;
      currentFile?: string;
      error?: string;
    },
    serverId?: string
  ) {
    // Send to server-specific room
    if (serverId) {
      this.server.to(`server:${serverId}`).emit('file-backfill:progress', progress);
    }

    // Send to all-logs room
    this.server.to('all-logs').emit('file-backfill:progress', progress);
  }
}
