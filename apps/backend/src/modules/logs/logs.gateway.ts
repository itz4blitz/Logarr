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

interface FileIngestionProgress {
  serverId: string;
  serverName: string;
  status: 'discovering' | 'processing' | 'watching' | 'error';
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  activeFiles: number;
  queuedFiles: number;
  currentFiles: string[];
  error?: string;
  progress: number;
  isInitialSync: boolean;
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
  /** Current sync progress per server - clients can request this on connect */
  private currentProgress = new Map<string, FileIngestionProgress>();

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

  /**
   * Handle request for current sync status (sent on client connect)
   */
  @SubscribeMessage('get-sync-status')
  handleGetSyncStatus(@ConnectedSocket() client: Socket) {
    // Send current progress for all servers to the requesting client
    for (const progress of this.currentProgress.values()) {
      client.emit('file-ingestion:progress', progress);
    }
    return { received: true, serverCount: this.currentProgress.size };
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

  /**
   * Broadcast file ingestion progress for a server
   */
  broadcastFileIngestionProgress(progress: FileIngestionProgress) {
    // Store current progress so late-connecting clients can request it
    this.currentProgress.set(progress.serverId, progress);

    // Log for debugging (only status changes or every 10%)
    const shouldLog =
      progress.status === 'discovering' ||
      progress.status === 'watching' ||
      progress.status === 'error' ||
      progress.progress % 10 === 0;
    if (shouldLog) {
      console.log(
        `[SyncBroadcast] ${progress.serverName}: ${progress.status} ${progress.progress}% (${progress.processedFiles}/${progress.totalFiles}) isInitial=${progress.isInitialSync}`
      );
    }

    // Broadcast to all connected clients
    this.server.emit('file-ingestion:progress', progress);
  }
}
