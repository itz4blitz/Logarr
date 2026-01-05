import {
  Play,
  Square,
  Pause,
  LogIn,
  LogOut,
  Wifi,
  WifiOff,
  User,
  Tv,
  Film,
  Music,
  Library,
  Download,
  Upload,
  Settings,
  AlertCircle,
  Info,
  type LucideIcon,
} from 'lucide-react';

export interface ActivityTypeInfo {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

const activityTypes: Record<string, ActivityTypeInfo> = {
  // Playback Events
  VideoPlayback: {
    label: 'Started Watching',
    icon: Play,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  VideoPlaybackStopped: {
    label: 'Finished Watching',
    icon: Square,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  AudioPlayback: {
    label: 'Started Listening',
    icon: Music,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  AudioPlaybackStopped: {
    label: 'Finished Listening',
    icon: Square,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
  },
  PlaybackStart: {
    label: 'Playback Started',
    icon: Play,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  PlaybackStop: {
    label: 'Playback Stopped',
    icon: Square,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
  PlaybackProgress: {
    label: 'Watching',
    icon: Pause,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },

  // Session Events
  SessionStarted: {
    label: 'Connected',
    icon: Wifi,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  SessionEnded: {
    label: 'Disconnected',
    icon: WifiOff,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },

  // User Events
  UserLoggedIn: {
    label: 'Logged In',
    icon: LogIn,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  UserLoggedOut: {
    label: 'Logged Out',
    icon: LogOut,
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
  UserCreated: {
    label: 'User Created',
    icon: User,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  UserDeleted: {
    label: 'User Deleted',
    icon: User,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  UserPasswordChanged: {
    label: 'Password Changed',
    icon: User,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  AuthenticationFailed: {
    label: 'Login Failed',
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  AuthenticationSucceeded: {
    label: 'Login Success',
    icon: LogIn,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },

  // Library Events
  LibraryScanComplete: {
    label: 'Library Scan',
    icon: Library,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  ItemAdded: {
    label: 'Item Added',
    icon: Download,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  ItemRemoved: {
    label: 'Item Removed',
    icon: Upload,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },

  // System Events
  TaskCompleted: {
    label: 'Task Complete',
    icon: Settings,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  PluginInstalled: {
    label: 'Plugin Installed',
    icon: Download,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  PluginUninstalled: {
    label: 'Plugin Removed',
    icon: Upload,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
  },
};

export function getActivityTypeInfo(type: string | undefined | null): ActivityTypeInfo {
  if (!type) {
    return {
      label: 'Activity',
      icon: Info,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
    };
  }

  return (
    activityTypes[type] || {
      label: type.replace(/([A-Z])/g, ' $1').trim(),
      icon: Info,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
    }
  );
}

export function getMediaTypeIcon(itemType: string | undefined | null): LucideIcon {
  switch (itemType?.toLowerCase()) {
    case 'movie':
      return Film;
    case 'episode':
    case 'series':
    case 'season':
      return Tv;
    case 'audio':
    case 'musicalbum':
    case 'musicartist':
      return Music;
    default:
      return Film;
  }
}
