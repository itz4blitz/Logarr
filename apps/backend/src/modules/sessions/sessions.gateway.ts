import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface SessionSubscription {
  serverId?: string;
}

export interface SessionUpdatePayload {
  type: 'sessions' | 'playbackStart' | 'playbackStop' | 'playbackProgress';
  serverId: string;
  data: unknown;
}

// CORS_ORIGIN is validated at startup via validateEnv() in main.ts
// If missing, app will fail fast before this gateway loads
@WebSocketGateway({
  namespace: 'sessions',
  cors: {
    origin: process.env['CORS_ORIGIN']!,
    credentials: true,
  },
})
export class SessionsGateway {
  @WebSocketServer()
  server: Server;

  private subscriptions = new Map<string, SessionSubscription>();

  @SubscribeMessage('subscribe')
  handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() data: SessionSubscription) {
    this.subscriptions.set(client.id, data);

    // Join appropriate rooms
    if (data.serverId) {
      client.join(`server:${data.serverId}`);
    } else {
      client.join('all-sessions');
    }

    return { subscribed: true };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket) {
    const subscription = this.subscriptions.get(client.id);

    if (subscription?.serverId) {
      client.leave(`server:${subscription.serverId}`);
    } else {
      client.leave('all-sessions');
    }

    this.subscriptions.delete(client.id);
    return { unsubscribed: true };
  }

  handleDisconnect(client: Socket) {
    this.subscriptions.delete(client.id);
  }

  /**
   * Broadcast session update to subscribers
   */
  broadcastSessionUpdate(payload: SessionUpdatePayload) {
    // Send to server-specific room
    this.server.to(`server:${payload.serverId}`).emit('sessionUpdate', payload);

    // Send to all-sessions room
    this.server.to('all-sessions').emit('sessionUpdate', payload);
  }

  /**
   * Broadcast full sessions list to all subscribers
   */
  broadcastSessions(serverId: string, sessions: unknown[]) {
    this.broadcastSessionUpdate({
      type: 'sessions',
      serverId,
      data: sessions,
    });
  }

  /**
   * Broadcast playback start event
   */
  broadcastPlaybackStart(serverId: string, data: unknown) {
    this.broadcastSessionUpdate({
      type: 'playbackStart',
      serverId,
      data,
    });
  }

  /**
   * Broadcast playback stop event
   */
  broadcastPlaybackStop(serverId: string, data: unknown) {
    this.broadcastSessionUpdate({
      type: 'playbackStop',
      serverId,
      data,
    });
  }

  /**
   * Broadcast playback progress event
   */
  broadcastPlaybackProgress(serverId: string, data: unknown) {
    this.broadcastSessionUpdate({
      type: 'playbackProgress',
      serverId,
      data,
    });
  }
}
