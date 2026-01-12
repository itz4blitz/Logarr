import { Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * WebSocket Gateway for real-time audit log updates
 * Clients can connect to receive live audit logs as they're created
 */
@WebSocketGateway({
  cors: {
    origin:
      (process.env as { CORS_ORIGIN?: string }).CORS_ORIGIN?.split(',') || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/audit',
})
export class AuditGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AuditGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast a new audit log to all connected clients
   */
  broadcastAuditLog(auditLog: unknown) {
    this.server.emit('auditLog', auditLog);
  }

  /**
   * Broadcast updated statistics to all connected clients
   */
  broadcastStatistics(statistics: unknown) {
    this.server.emit('auditStatistics', statistics);
  }

  @SubscribeMessage('ping')
  handlePing(_client: Socket): void {
    this.server.emit('pong', { timestamp: new Date().toISOString() });
  }
}
