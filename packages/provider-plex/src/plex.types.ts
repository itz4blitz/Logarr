/**
 * Plex Media Server API Types
 * Based on official Plex API documentation and observed responses
 */

// =============================================================================
// Server Info Types (GET /)
// =============================================================================

export interface PlexServerInfo {
  readonly MediaContainer: {
    readonly size: number;
    readonly allowCameraUpload: boolean;
    readonly allowChannelAccess: boolean;
    readonly allowMediaDeletion: boolean;
    readonly allowSharing: boolean;
    readonly allowSync: boolean;
    readonly backgroundProcessing: boolean;
    readonly certificate: boolean;
    readonly companionProxy: boolean;
    readonly friendlyName: string;
    readonly machineIdentifier: string;
    readonly platform: string;
    readonly platformVersion: string;
    readonly version: string;
  };
}

// =============================================================================
// Session Types (GET /status/sessions)
// =============================================================================

export interface PlexPlayer {
  readonly address: string;
  readonly device: string;
  readonly machineIdentifier: string;
  readonly model?: string;
  readonly platform: string;
  readonly platformVersion?: string;
  readonly product?: string;
  readonly state: 'playing' | 'paused' | 'buffering' | 'stopped';
  readonly title: string;
  readonly local: boolean;
  readonly remotePublicAddress?: string;
}

export interface PlexSessionInfo {
  readonly id: string;
  readonly bandwidth: number;
  readonly location: 'lan' | 'wan';
}

export interface PlexTranscodeSession {
  readonly key: string;
  readonly throttled: boolean;
  readonly complete: boolean;
  readonly progress: number;
  readonly size: number;
  readonly speed: number;
  readonly videoDecision: 'transcode' | 'copy' | 'directplay';
  readonly audioDecision: 'transcode' | 'copy' | 'directplay';
  readonly protocol: string;
  readonly container: string;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly width: number;
  readonly height: number;
}

export interface PlexSessionUser {
  readonly id: number;
  readonly title: string;
  readonly thumb?: string;
}

export interface PlexSession {
  readonly sessionKey: string;
  readonly ratingKey: string;
  readonly key: string;
  readonly type: 'movie' | 'episode' | 'track' | 'photo';
  readonly title: string;
  readonly grandparentTitle?: string;
  readonly parentTitle?: string;
  readonly duration: number;
  readonly viewOffset: number;
  readonly thumb?: string;
  readonly parentThumb?: string;
  readonly grandparentThumb?: string;
  readonly art?: string;
  readonly User: PlexSessionUser;
  readonly Player: PlexPlayer;
  readonly Session: PlexSessionInfo;
  readonly TranscodeSession?: PlexTranscodeSession;
}

export interface PlexSessionsResponse {
  readonly MediaContainer: {
    readonly size: number;
    readonly Metadata?: readonly PlexSession[];
  };
}

// =============================================================================
// History Types (GET /status/sessions/history/all)
// =============================================================================

export interface PlexHistoryEntry {
  readonly historyKey: number;
  readonly key: string;
  readonly ratingKey: string;
  readonly title: string;
  readonly grandparentTitle?: string;
  readonly parentTitle?: string;
  readonly type: 'movie' | 'episode' | 'track';
  readonly viewedAt: number;
  readonly accountID: number;
  readonly deviceID: number;
  readonly librarySectionID?: number;
  readonly thumb?: string;
  readonly parentThumb?: string;
  readonly grandparentThumb?: string;
}

export interface PlexHistoryResponse {
  readonly MediaContainer: {
    readonly size: number;
    readonly Metadata?: readonly PlexHistoryEntry[];
  };
}

// =============================================================================
// User/Account Types (GET /accounts)
// =============================================================================

export interface PlexServer {
  readonly id: number;
  readonly serverId: string;
  readonly machineIdentifier: string;
  readonly name: string;
  readonly lastSeenAt: number;
  readonly numLibraries: number;
  readonly owned: boolean;
}

export interface PlexUser {
  readonly id: number;
  readonly title: string;
  readonly username?: string;
  readonly email?: string;
  readonly thumb?: string;
  readonly home: boolean;
  readonly admin: boolean;
  readonly guest: boolean;
  readonly restricted: boolean;
  readonly Server?: readonly PlexServer[];
}

export interface PlexAccountsResponse {
  readonly MediaContainer: {
    readonly size: number;
    readonly User?: readonly PlexUser[];
  };
}

// =============================================================================
// WebSocket Notification Types
// =============================================================================

export type PlexNotificationType =
  | 'playing'
  | 'progress'
  | 'status'
  | 'activity'
  | 'backgroundProcessingQueue'
  | 'timeline'
  | 'reachability';

export interface PlexPlaySessionNotification {
  readonly sessionKey: string;
  readonly clientIdentifier: string;
  readonly guid: string;
  readonly ratingKey: string;
  readonly key: string;
  readonly viewOffset: number;
  readonly playQueueItemID: number;
  readonly state: 'playing' | 'paused' | 'buffering' | 'stopped';
}

export interface PlexActivityNotification {
  readonly Activity: {
    readonly uuid: string;
    readonly type: string;
    readonly cancellable: boolean;
    readonly userID: number;
    readonly title: string;
    readonly subtitle: string;
    readonly progress: number;
  };
}

export interface PlexStatusNotification {
  readonly title: string;
  readonly description?: string;
  readonly notificationName: string;
}

export interface PlexTimelineEntry {
  readonly identifier: string;
  readonly itemID: number;
  readonly sectionID: number;
  readonly state: number;
  readonly title: string;
  readonly type: number;
  readonly updatedAt: number;
}

export interface PlexTimelineNotification {
  readonly TimelineEntry: readonly PlexTimelineEntry[];
}

export interface PlexWebSocketMessage {
  readonly NotificationContainer: {
    readonly type: PlexNotificationType;
    readonly size: number;
    readonly PlaySessionStateNotification?: readonly PlexPlaySessionNotification[];
    readonly ActivityNotification?: readonly PlexActivityNotification[];
    readonly StatusNotification?: readonly PlexStatusNotification[];
    readonly TimelineEntry?: readonly PlexTimelineEntry[];
  };
}

// =============================================================================
// Event Emitter Types
// =============================================================================

export interface PlexWebSocketEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  playing: (notification: PlexPlaySessionNotification) => void;
  activity: (notification: PlexActivityNotification) => void;
  status: (notification: PlexStatusNotification) => void;
  timeline: (entries: readonly PlexTimelineEntry[]) => void;
}
