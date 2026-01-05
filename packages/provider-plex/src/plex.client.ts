import { EventEmitter } from 'events';

import type {
  PlexServerInfo,
  PlexSession,
  PlexSessionsResponse,
  PlexHistoryEntry,
  PlexHistoryResponse,
  PlexUser,
  PlexAccountsResponse,
  PlexWebSocketMessage,
  PlexWebSocketEvents,
} from './plex.types.js';

/**
 * HTTP and WebSocket client for Plex Media Server API
 */
export class PlexClient extends EventEmitter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly headers: Record<string, string>;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private shouldReconnect = false;

  constructor(baseUrl: string, token: string) {
    super();
    // Remove trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.headers = {
      'X-Plex-Token': token,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  // ===========================================================================
  // HTTP API Methods
  // ===========================================================================

  /**
   * Make an authenticated GET request to the Plex API
   */
  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    // Add token to query params
    url.searchParams.set('X-Plex-Token', this.token);

    if (params !== undefined) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: 'GET',
        headers: this.headers,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to connect to Plex server at ${this.baseUrl}: ${errorMsg}. Check that the URL is accessible from this machine/container.`
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Plex API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Test connection by fetching server info
   */
  async connect(): Promise<void> {
    await this.getServerInfo();
  }

  /**
   * Get server information
   * GET /
   */
  async getServerInfo(): Promise<PlexServerInfo> {
    return this.get<PlexServerInfo>('/');
  }

  /**
   * Get active playback sessions
   * GET /status/sessions
   */
  async getSessions(): Promise<readonly PlexSession[]> {
    const response = await this.get<PlexSessionsResponse>('/status/sessions');
    return response.MediaContainer.Metadata ?? [];
  }

  /**
   * Get watch history for all users
   * GET /status/sessions/history/all
   */
  async getHistory(options?: {
    limit?: number;
    accountId?: number;
    librarySectionID?: number;
  }): Promise<readonly PlexHistoryEntry[]> {
    const params: Record<string, string | number> = {};

    if (options?.limit !== undefined) {
      params['X-Plex-Container-Size'] = options.limit;
    }
    if (options?.accountId !== undefined) {
      params['accountID'] = options.accountId;
    }
    if (options?.librarySectionID !== undefined) {
      params['librarySectionID'] = options.librarySectionID;
    }

    const response = await this.get<PlexHistoryResponse>('/status/sessions/history/all', params);
    return response.MediaContainer.Metadata ?? [];
  }

  /**
   * Get all user accounts with access to the server
   * GET /accounts
   */
  async getAccounts(): Promise<readonly PlexUser[]> {
    const response = await this.get<PlexAccountsResponse>('/accounts');
    return response.MediaContainer.User ?? [];
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
    return `${wsProtocol}://${host}/:/websockets/notifications?X-Plex-Token=${this.token}`;
  }

  /**
   * Connect to Plex WebSocket for real-time notifications
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
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    // Plex doesn't require explicit keepalive, but we'll ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Plex WebSocket doesn't have a ping message, connection is kept alive by messages
      }
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
      const message = JSON.parse(data) as PlexWebSocketMessage;
      const container = message.NotificationContainer;

      switch (container.type) {
        case 'playing':
          if (container.PlaySessionStateNotification) {
            for (const notification of container.PlaySessionStateNotification) {
              // Log for debugging - Plex typically sends these every ~10 seconds
              console.log(
                `[Plex WS] Playing notification: state=${notification.state}, offset=${notification.viewOffset}ms`
              );
              this.emit('playing', notification);
            }
          }
          break;

        case 'activity':
          if (container.ActivityNotification) {
            for (const notification of container.ActivityNotification) {
              this.emit('activity', notification);
            }
          }
          break;

        case 'status':
          if (container.StatusNotification) {
            for (const notification of container.StatusNotification) {
              this.emit('status', notification);
            }
          }
          break;

        case 'timeline':
          if (container.TimelineEntry) {
            this.emit('timeline', container.TimelineEntry);
          }
          break;

        case 'backgroundProcessingQueue':
        case 'progress':
        case 'reachability':
          // These are informational, we can add handlers later if needed
          break;

        default:
          // Unknown notification type - ignore
          break;
      }
    } catch {
      // Invalid JSON - ignore
    }
  }

  // Type-safe event emitter overrides
  override on<K extends keyof PlexWebSocketEvents>(
    event: K,
    listener: PlexWebSocketEvents[K]
  ): this {
    return super.on(event, listener);
  }

  override emit<K extends keyof PlexWebSocketEvents>(
    event: K,
    ...args: Parameters<PlexWebSocketEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }
}
