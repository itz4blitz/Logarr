/**
 * Emby Media Server HTTP and WebSocket client
 * Handles API communication and real-time session updates
 */

import { EventEmitter } from 'events';

import { httpRequest, HttpError } from '@logarr/core';

import type {
  EmbySystemInfo,
  EmbySession,
  EmbyUser,
  EmbyActivityLogEntry,
  EmbyQueryResult,
  EmbyLogFile,
  EmbyWebSocketMessage,
  EmbyWebSocketEvents,
  EmbySessionsData,
  EmbyPlaybackProgressData,
  EmbyPlaybackEventData,
} from './emby.types.js';

/**
 * HTTP and WebSocket client for Emby Media Server API
 */
export class EmbyClient extends EventEmitter {
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
    // Remove trailing slashes
    let url = baseUrl;
    while (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    this.baseUrl = url;
    this.apiKey = apiKey;
    this.deviceId = `logarr-${Date.now()}`;
    this.headers = {
      'X-Emby-Token': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  // ===========================================================================
  // HTTP API Methods
  // ===========================================================================

  /**
   * Make an authenticated GET request to the Emby API
   * Uses httpRequest from @logarr/core for timeout and retry handling
   */
  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params !== undefined) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
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
        throw new Error(`Emby API error: ${error.message}\n${error.suggestion}`);
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
   * GET /System/Info
   */
  async getSystemInfo(): Promise<EmbySystemInfo> {
    return this.get<EmbySystemInfo>('/System/Info');
  }

  /**
   * Get active playback sessions
   * GET /Sessions
   */
  async getSessions(): Promise<readonly EmbySession[]> {
    return this.get<EmbySession[]>('/Sessions');
  }

  /**
   * Get all users
   * GET /Users
   */
  async getUsers(): Promise<readonly EmbyUser[]> {
    return this.get<EmbyUser[]>('/Users');
  }

  /**
   * Get activity log entries
   * GET /System/ActivityLog/Entries
   */
  async getActivityLog(options?: {
    startIndex?: number;
    limit?: number;
    minDate?: Date;
  }): Promise<EmbyQueryResult<EmbyActivityLogEntry>> {
    const params: Record<string, string | number> = {};

    if (options?.startIndex !== undefined) {
      params['StartIndex'] = options.startIndex;
    }
    if (options?.limit !== undefined) {
      params['Limit'] = options.limit;
    }
    if (options?.minDate !== undefined) {
      params['MinDate'] = options.minDate.toISOString();
    }

    return this.get<EmbyQueryResult<EmbyActivityLogEntry>>(
      '/System/ActivityLog/Entries',
      params
    );
  }

  /**
   * Get list of log files
   * GET /System/Logs
   */
  async getLogFiles(): Promise<readonly EmbyLogFile[]> {
    return this.get<EmbyLogFile[]>('/System/Logs');
  }

  /**
   * Get log file content
   * GET /System/Logs/Log?Name=xxx
   */
  async getLogFileContent(logFileName: string): Promise<string> {
    const url = new URL(`${this.baseUrl}/System/Logs/Log`);
    url.searchParams.set('Name', logFileName);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Emby-Token': this.apiKey,
        Accept: 'text/plain',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get log file: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  // ===========================================================================
  // WebSocket Methods
  // ===========================================================================

  /**
   * Get the WebSocket URL for real-time notifications
   */
  private getWebSocketUrl(): string {
    const wsProtocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.baseUrl.replace(/^https?:\/\//, '');
    return `${wsProtocol}://${host}/embywebsocket?api_key=${this.apiKey}&deviceId=${this.deviceId}`;
  }

  /**
   * Connect to Emby WebSocket for real-time session updates
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
   * Subscribe to session updates from Emby
   */
  private subscribeToSessionUpdates(): void {
    // Emby uses SessionsStart with interval in milliseconds
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
      const message = JSON.parse(data) as EmbyWebSocketMessage;

      switch (message.MessageType) {
        case 'ForceKeepAlive':
          // Server requests a keepalive - respond immediately
          this.sendWebSocketMessage('KeepAlive');
          break;

        case 'Sessions':
          // Full session list update
          if (message.Data !== undefined && message.Data !== null) {
            this.emit('sessions', message.Data as EmbySessionsData);
          }
          break;

        case 'PlaybackStart':
          if (message.Data !== undefined && message.Data !== null) {
            this.emit('playbackStart', message.Data as EmbyPlaybackEventData);
          }
          break;

        case 'PlaybackStopped':
          if (message.Data !== undefined && message.Data !== null) {
            this.emit('playbackStop', message.Data as EmbyPlaybackEventData);
          }
          break;

        case 'PlaybackProgress':
          if (message.Data !== undefined && message.Data !== null) {
            this.emit('playbackProgress', message.Data as EmbyPlaybackProgressData);
          }
          break;

        case 'KeepAlive':
          // Server acknowledged our keepalive
          break;

        case 'SessionEnded':
        case 'LibraryChanged':
        case 'ServerRestarting':
        case 'ServerShuttingDown':
        case 'RefreshProgress':
        case 'ScheduledTaskEnded':
          // Informational messages - can be handled if needed
          break;

        default:
          // Unknown message type - ignore
          break;
      }
    } catch {
      // Invalid JSON - ignore
    }
  }

  // Type-safe event emitter overrides
  override on<K extends keyof EmbyWebSocketEvents>(
    event: K,
    listener: EmbyWebSocketEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof EmbyWebSocketEvents>(
    event: K,
    ...args: Parameters<EmbyWebSocketEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
