import { EventEmitter } from 'events';

import { httpRequest, HttpError } from '@logarr/core';

import type {
  JellyfinActivityLogEntry,
  JellyfinQueryResult,
  JellyfinSession,
  JellyfinSystemInfo,
  JellyfinUser,
  JellyfinWebSocketMessage,
  JellyfinSessionsData,
  JellyfinPlaybackProgressData,
  JellyfinPlaybackEventData,
} from './jellyfin.types.js';

export interface JellyfinWebSocketEvents {
  sessions: (sessions: JellyfinSessionsData) => void;
  playbackStart: (data: JellyfinPlaybackEventData) => void;
  playbackStop: (data: JellyfinPlaybackEventData) => void;
  playbackProgress: (data: JellyfinPlaybackProgressData) => void;
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
}

/**
 * HTTP client for Jellyfin API with WebSocket support
 */
export class JellyfinClient extends EventEmitter {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly headers: Record<string, string>;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private deviceId: string;
  private isConnecting = false;
  private shouldReconnect = false;

  constructor(baseUrl: string, apiKey: string) {
    super();
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.deviceId = `logarr-${Date.now()}`;
    this.headers = {
      'X-Emby-Token': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Make an authenticated GET request to the Jellyfin API
   * Uses httpRequest from @logarr/core for timeout and retry handling
   */
  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params !== undefined) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    try {
      return await httpRequest<T>(url.toString(), {
        method: 'GET',
        headers: this.headers,
        timeout: 10000,
        retries: 2,
      });
    } catch (error) {
      if (error instanceof HttpError) {
        throw new Error(`Jellyfin API error: ${error.message}\n${error.suggestion}`);
      }
      throw error;
    }
  }

  /**
   * Test connection by fetching system info
   */
  async connect(): Promise<void> {
    await this.getSystemInfo();
  }

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<JellyfinSystemInfo> {
    return this.get<JellyfinSystemInfo>('/System/Info');
  }

  /**
   * Get all active sessions
   */
  async getSessions(): Promise<readonly JellyfinSession[]> {
    return this.get<JellyfinSession[]>('/Sessions');
  }

  /**
   * Get all users
   */
  async getUsers(): Promise<readonly JellyfinUser[]> {
    return this.get<JellyfinUser[]>('/Users');
  }

  /**
   * Get activity log entries
   */
  async getActivityLog(
    startIndex: number = 0,
    limit: number = 100,
    minDate?: Date
  ): Promise<JellyfinQueryResult<JellyfinActivityLogEntry>> {
    const params: Record<string, string> = {
      startIndex: startIndex.toString(),
      limit: limit.toString(),
    };

    if (minDate !== undefined) {
      params['minDate'] = minDate.toISOString();
    }

    return this.get<JellyfinQueryResult<JellyfinActivityLogEntry>>(
      '/System/ActivityLog/Entries',
      params
    );
  }

  /**
   * Get the WebSocket URL for real-time updates
   */
  private getWebSocketUrl(): string {
    const wsProtocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.baseUrl.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${host}/socket?api_key=${this.apiKey}&deviceId=${this.deviceId}`;
  }

  /**
   * Connect to Jellyfin WebSocket for real-time session updates
   */
  connectWebSocket(): void {
    if (this.ws || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      const wsUrl = this.getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.emit('connected');
        this.startHeartbeat();
        // Subscribe to session updates
        this.subscribeToSessionUpdates();
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.cleanup();
        this.emit('disconnected');

        // Auto-reconnect after 5 seconds
        if (this.shouldReconnect) {
          this.reconnectTimeout = setTimeout(() => {
            this.connectWebSocket();
          }, 5000);
        }
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
        this.emit('error', new Error('WebSocket error'));
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };
    } catch (error) {
      this.isConnecting = false;
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnectWebSocket(): void {
    this.shouldReconnect = false;
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isWebSocketConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to session updates from Jellyfin
   */
  private subscribeToSessionUpdates(): void {
    this.sendWebSocketMessage('SessionsStart', '0,1500');
  }

  /**
   * Send a message through WebSocket
   */
  private sendWebSocketMessage(messageType: string, data?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = {
      MessageType: messageType,
      Data: data,
    };

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Send KeepAlive every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendWebSocketMessage('KeepAlive');
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Cleanup timers
   */
  private cleanup(): void {
    this.stopHeartbeat();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as JellyfinWebSocketMessage;

      switch (message.MessageType) {
        case 'ForceKeepAlive':
          // Server requests a keepalive - respond immediately
          this.sendWebSocketMessage('KeepAlive');
          break;

        case 'Sessions':
          // Full session list update
          if (message.Data !== undefined && message.Data !== null) {
            this.emit('sessions', message.Data as JellyfinSessionsData);
          }
          break;

        case 'PlaybackStart':
          if (message.Data !== undefined && message.Data !== null) {
            this.emit('playbackStart', message.Data as JellyfinPlaybackEventData);
          }
          break;

        case 'PlaybackStopped':
          if (message.Data !== undefined && message.Data !== null) {
            this.emit('playbackStop', message.Data as JellyfinPlaybackEventData);
          }
          break;

        case 'PlaybackProgress':
          if (message.Data !== undefined && message.Data !== null) {
            this.emit('playbackProgress', message.Data as JellyfinPlaybackProgressData);
          }
          break;

        case 'KeepAlive':
          // Server acknowledged our keepalive
          break;

        default:
          // Unknown message type - ignore
          break;
      }
    } catch {
      // Invalid JSON - ignore
    }
  }
}
