import { io, Socket } from 'socket.io-client';

// WebSocket connection management for real-time audit logs
let auditSocket: Socket | null = null;

export function connectToAuditWebSocket() {
  if (auditSocket?.connected) {
    return auditSocket;
  }

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4002';
  const socket = io(`${wsUrl}/audit`, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('Connected to audit WebSocket');
    // Store socket reference globally for connection status checks
    (window as unknown as { __auditSocket: Socket }).__auditSocket = socket;
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from audit WebSocket');
  });

  socket.on('connect_error', (error) => {
    console.error('Audit WebSocket connection error:', error);
  });

  auditSocket = socket;
  return socket;
}

export function disconnectFromAuditWebSocket() {
  if (auditSocket) {
    auditSocket.disconnect();
    auditSocket = null;
  }
}

export function getAuditSocket() {
  return auditSocket;
}

export function onAuditLog(callback: (log: unknown) => void) {
  const socket = connectToAuditWebSocket();
  socket.on('auditLog', callback);

  // Return cleanup function
  return () => {
    socket.off('auditLog', callback);
  };
}

export function onAuditStatistics(callback: (stats: unknown) => void) {
  const socket = connectToAuditWebSocket();
  socket.on('auditStatistics', callback);

  // Return cleanup function
  return () => {
    socket.off('auditStatistics', callback);
  };
}
