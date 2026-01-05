/**
 * Emby Media Server API Types
 * Based on Emby API documentation
 * Note: Emby and Jellyfin share similar APIs since Jellyfin is a fork of Emby
 */

// =============================================================================
// Server Info Types (GET /System/Info)
// =============================================================================

export interface EmbySystemInfo {
  readonly ServerName: string;
  readonly Version: string;
  readonly Id: string;
  readonly OperatingSystem: string;
  readonly HasPendingRestart: boolean;
  readonly HasUpdateAvailable: boolean;
  readonly SupportsLibraryMonitor: boolean;
  readonly WebSocketPortNumber: number;
  readonly LocalAddress: string;
  readonly WanAddress?: string;
}

// =============================================================================
// Session Types (GET /Sessions)
// =============================================================================

export interface EmbySession {
  readonly Id: string;
  readonly UserId: string;
  readonly UserName: string;
  readonly Client: string;
  readonly DeviceId: string;
  readonly DeviceName: string;
  readonly ApplicationVersion: string;
  readonly RemoteEndPoint: string;
  readonly LastActivityDate: string;
  readonly LastPlaybackCheckIn?: string;
  readonly NowPlayingItem?: EmbyNowPlayingItem;
  readonly PlayState?: EmbyPlayState;
  readonly TranscodingInfo?: EmbyTranscodingInfo;
  readonly IsActive: boolean;
  readonly SupportsRemoteControl: boolean;
  readonly SupportsMediaControl: boolean;
  readonly PlayableMediaTypes?: readonly string[];
  readonly SupportedCommands?: readonly string[];
}

export interface EmbyNowPlayingItem {
  readonly Id: string;
  readonly Name: string;
  readonly Type: string;
  readonly SeriesName?: string;
  readonly SeasonName?: string;
  readonly IndexNumber?: number;
  readonly ParentIndexNumber?: number;
  readonly RunTimeTicks: number;
  readonly MediaType: string;
  readonly Container?: string;
  readonly VideoType?: string;
  readonly Overview?: string;
  readonly ProductionYear?: number;
  readonly ImageTags?: Record<string, string>;
  readonly PrimaryImageAspectRatio?: number;
}

export interface EmbyPlayState {
  readonly PositionTicks: number;
  readonly CanSeek: boolean;
  readonly IsPaused: boolean;
  readonly IsMuted: boolean;
  readonly VolumeLevel?: number;
  readonly AudioStreamIndex?: number;
  readonly SubtitleStreamIndex?: number;
  readonly MediaSourceId?: string;
  readonly PlayMethod: 'DirectPlay' | 'DirectStream' | 'Transcode';
  readonly RepeatMode?: string;
}

export interface EmbyTranscodingInfo {
  readonly AudioCodec?: string;
  readonly VideoCodec?: string;
  readonly Container?: string;
  readonly IsVideoDirect: boolean;
  readonly IsAudioDirect: boolean;
  readonly Bitrate?: number;
  readonly Framerate?: number;
  readonly CompletionPercentage?: number;
  readonly Width?: number;
  readonly Height?: number;
  readonly AudioChannels?: number;
  readonly TranscodeReasons?: readonly string[];
}

// =============================================================================
// User Types (GET /Users)
// =============================================================================

export interface EmbyUser {
  readonly Id: string;
  readonly Name: string;
  readonly ServerId: string;
  readonly HasPassword: boolean;
  readonly HasConfiguredPassword: boolean;
  readonly HasConfiguredEasyPassword: boolean;
  readonly EnableAutoLogin: boolean;
  readonly LastLoginDate?: string;
  readonly LastActivityDate?: string;
  readonly Policy: EmbyUserPolicy;
  readonly PrimaryImageTag?: string;
}

export interface EmbyUserPolicy {
  readonly IsAdministrator: boolean;
  readonly IsDisabled: boolean;
  readonly EnableRemoteAccess: boolean;
  readonly EnableLiveTvAccess?: boolean;
  readonly EnableLiveTvManagement?: boolean;
  readonly EnableMediaPlayback?: boolean;
  readonly EnableAudioPlaybackTranscoding?: boolean;
  readonly EnableVideoPlaybackTranscoding?: boolean;
  readonly EnablePlaybackRemuxing?: boolean;
  readonly EnableContentDeletion?: boolean;
  readonly EnableContentDownloading?: boolean;
  readonly EnableSubtitleDownloading?: boolean;
  readonly EnableSubtitleManagement?: boolean;
  readonly EnableSyncTranscoding?: boolean;
  readonly EnableMediaConversion?: boolean;
}

// =============================================================================
// Activity Log Types (GET /System/ActivityLog/Entries)
// =============================================================================

export interface EmbyActivityLogEntry {
  readonly Id: number;
  readonly Name: string;
  readonly Type: string;
  readonly Overview?: string;
  readonly ShortOverview?: string;
  readonly UserId?: string;
  readonly ItemId?: string;
  readonly Date: string;
  readonly Severity: 'Info' | 'Warn' | 'Error' | 'Debug';
  readonly UserPrimaryImageTag?: string;
}

export interface EmbyQueryResult<T> {
  readonly Items: readonly T[];
  readonly TotalRecordCount: number;
  readonly StartIndex: number;
}

// =============================================================================
// Log File Types (GET /System/Logs)
// =============================================================================

export interface EmbyLogFile {
  readonly Name: string;
  readonly Size: number;
  readonly DateModified: string;
  readonly DateCreated: string;
}

// =============================================================================
// WebSocket Notification Types
// =============================================================================

export type EmbyWebSocketMessageType =
  | 'ForceKeepAlive'
  | 'KeepAlive'
  | 'Sessions'
  | 'SessionsStart'
  | 'SessionsStop'
  | 'SessionEnded'
  | 'PlaybackStart'
  | 'PlaybackStopped'
  | 'PlaybackProgress'
  | 'UserDataChanged'
  | 'GeneralCommand'
  | 'LibraryChanged'
  | 'ServerRestarting'
  | 'ServerShuttingDown'
  | 'RefreshProgress'
  | 'ScheduledTaskEnded';

export interface EmbyWebSocketMessage<T = unknown> {
  readonly MessageType: EmbyWebSocketMessageType;
  readonly MessageId?: string;
  readonly Data?: T;
}

export type EmbySessionsData = readonly EmbySession[];

export interface EmbyPlaybackProgressData {
  readonly PlaySessionId: string;
  readonly ItemId: string;
  readonly MediaSourceId?: string;
  readonly PositionTicks: number;
  readonly IsPaused: boolean;
  readonly IsMuted: boolean;
  readonly VolumeLevel?: number;
  readonly PlayMethod?: string;
  readonly LiveStreamId?: string;
  readonly SessionId?: string;
}

export interface EmbyPlaybackEventData {
  readonly SessionId: string;
  readonly UserId?: string;
  readonly UserName?: string;
  readonly DeviceId?: string;
  readonly DeviceName?: string;
  readonly Client?: string;
  readonly ItemId?: string;
  readonly ItemName?: string;
  readonly ItemType?: string;
  readonly PlaySessionId?: string;
  readonly PositionTicks?: number;
  readonly NowPlayingItem?: EmbyNowPlayingItem;
  readonly PlayState?: EmbyPlayState;
}

// =============================================================================
// Event Emitter Types
// =============================================================================

export interface EmbyWebSocketEvents {
  sessions: (sessions: EmbySessionsData) => void;
  playbackStart: (data: EmbyPlaybackEventData) => void;
  playbackStop: (data: EmbyPlaybackEventData) => void;
  playbackProgress: (data: EmbyPlaybackProgressData) => void;
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
}
