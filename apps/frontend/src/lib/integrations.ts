/**
 * Integration Registry
 *
 * This file contains the complete registry of all integrations supported by Logarr.
 * Each integration includes metadata, configuration requirements, and status.
 */

export type IntegrationStatus = 'available' | 'coming_soon' | 'beta';

export type IntegrationCategory =
  | 'media_servers'
  | 'arr_stack'
  | 'download_clients'
  | 'network_dns'
  | 'containers'
  | 'monitoring'
  | 'databases'
  | 'media_apps'
  | 'media_requests'
  | 'ai_providers'
  | 'generic';

export type ConnectionType =
  | 'api' // REST API with API key
  | 'api_token' // REST API with bearer token
  | 'api_basic' // REST API with basic auth
  | 'docker' // Docker socket/API
  | 'ssh' // SSH connection
  | 'log_file' // Direct log file access
  | 'syslog' // Syslog protocol
  | 'webhook' // Webhook receiver
  | 'database' // Database connection
  | 'oauth'; // OAuth flow

export interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'number' | 'select' | 'checkbox' | 'path';
  placeholder?: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
  };
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  status: IntegrationStatus;
  connectionType: ConnectionType;
  icon: string; // Either a built-in icon ID or a dashboardicons.com slug
  iconType: 'builtin' | 'dashboard-icons' | 'url';
  color: string; // Brand color (hex)
  bgColor: string; // Tailwind bg class for subtle background
  website?: string;
  docsUrl?: string;
  defaultPort?: number;
  configFields: ConfigField[];
  capabilities: {
    realTimeLogs: boolean;
    activityLog: boolean;
    sessions: boolean;
    webhooks: boolean;
    metrics: boolean;
  };
  tags: string[]; // For search
}

export interface IntegrationCategoryInfo {
  id: IntegrationCategory;
  name: string;
  description: string;
  icon: string;
}

// Category definitions
export const integrationCategories: IntegrationCategoryInfo[] = [
  {
    id: 'media_servers',
    name: 'Media Servers',
    description: 'Stream and manage your media library',
    icon: 'play-circle',
  },
  {
    id: 'arr_stack',
    name: '*Arr Stack',
    description: 'Automated media management suite',
    icon: 'layers',
  },
  {
    id: 'download_clients',
    name: 'Download Clients',
    description: 'Torrent and Usenet downloaders',
    icon: 'download',
  },
  {
    id: 'media_requests',
    name: 'Media Requests',
    description: 'Request management for media',
    icon: 'message-square',
  },
  {
    id: 'media_apps',
    name: 'Media Apps',
    description: 'Photos, books, and audio libraries',
    icon: 'image',
  },
  {
    id: 'network_dns',
    name: 'Reverse Proxies',
    description: 'Reverse proxies and load balancers',
    icon: 'globe',
  },
  {
    id: 'containers',
    name: 'Containers',
    description: 'Docker and container management',
    icon: 'box',
  },
  {
    id: 'monitoring',
    name: 'Monitoring',
    description: 'Uptime and service monitoring',
    icon: 'activity',
  },
  {
    id: 'databases',
    name: 'Databases',
    description: 'Database servers',
    icon: 'database',
  },
  {
    id: 'ai_providers',
    name: 'AI Providers',
    description: 'AI/LLM services for log analysis',
    icon: 'cpu',
  },
  {
    id: 'generic',
    name: 'Generic & Custom',
    description: 'Custom log sources and APIs',
    icon: 'terminal',
  },
];

// Standard config field templates
const standardApiFields: ConfigField[] = [
  {
    name: 'name',
    label: 'Display Name',
    type: 'text',
    placeholder: 'My Server',
    description: 'A friendly name to identify this source',
    required: true,
  },
  {
    name: 'url',
    label: 'Server URL',
    type: 'url',
    placeholder: 'http://localhost:8080',
    description: 'The URL of your server (including port)',
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API Key',
    type: 'password',
    placeholder: 'Enter API key',
    description: 'API key for authentication',
    required: true,
  },
];

const standardLogPathField: ConfigField = {
  name: 'logPath',
  label: 'Log Path',
  type: 'path',
  placeholder: '/config/logs',
  description: 'Path to log files (leave empty for default)',
  required: false,
};

// Full integration registry
export const integrations: Integration[] = [
  // ============================================
  // MEDIA SERVERS
  // ============================================
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    description: 'Free Software Media System - stream your media anywhere',
    category: 'media_servers',
    status: 'available',
    connectionType: 'api',
    icon: 'jellyfin',
    iconType: 'builtin',
    color: '#00A4DC',
    bgColor: 'bg-cyan-500/10',
    website: 'https://jellyfin.org',
    docsUrl: 'https://jellyfin.org/docs/',
    defaultPort: 8096,
    configFields: [
      ...standardApiFields,
      {
        ...standardLogPathField,
        placeholder: '/config/log',
        description: 'Path to Jellyfin log directory',
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: true,
      webhooks: true,
      metrics: true,
    },
    tags: ['media', 'streaming', 'video', 'music', 'photos', 'free', 'open-source'],
  },
  {
    id: 'plex',
    name: 'Plex',
    description: 'Organize, stream, and share your personal media',
    category: 'media_servers',
    status: 'available',
    connectionType: 'api',
    icon: 'plex',
    iconType: 'builtin',
    color: '#E5A00D',
    bgColor: 'bg-yellow-500/10',
    website: 'https://plex.tv',
    docsUrl: 'https://support.plex.tv/',
    defaultPort: 32400,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'apiKey',
        label: 'Plex Token',
        type: 'password',
        placeholder: 'Enter Plex token',
        description: 'Your X-Plex-Token (found in Plex settings or URL)',
        required: true,
      },
      {
        ...standardLogPathField,
        placeholder: '%LOCALAPPDATA%\\Plex Media Server\\Logs',
        description: 'Path to Plex log directory (leave empty for auto-detection)',
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: true,
      webhooks: true,
      metrics: true,
    },
    tags: ['media', 'streaming', 'video', 'music', 'photos'],
  },
  {
    id: 'emby',
    name: 'Emby',
    description: 'Personal media server with live TV and DVR',
    category: 'media_servers',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'emby',
    iconType: 'dashboard-icons',
    color: '#52B54B',
    bgColor: 'bg-green-500/10',
    website: 'https://emby.media',
    defaultPort: 8096,
    configFields: [...standardApiFields, standardLogPathField],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: true,
      webhooks: true,
      metrics: true,
    },
    tags: ['media', 'streaming', 'video', 'music', 'live-tv', 'dvr'],
  },

  // ============================================
  // *ARR STACK
  // ============================================
  {
    id: 'sonarr',
    name: 'Sonarr',
    description: 'Smart PVR for newsgroup and bittorrent users - TV shows',
    category: 'arr_stack',
    status: 'available',
    connectionType: 'api',
    icon: 'sonarr',
    iconType: 'builtin',
    color: '#00CCFF',
    bgColor: 'bg-sky-500/10',
    website: 'https://sonarr.tv',
    docsUrl: 'https://wiki.servarr.com/sonarr',
    defaultPort: 8989,
    configFields: [...standardApiFields, standardLogPathField],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['arr', 'tv', 'shows', 'pvr', 'automation', 'torrent', 'usenet'],
  },
  {
    id: 'radarr',
    name: 'Radarr',
    description: 'Movie collection manager for Usenet and BitTorrent',
    category: 'arr_stack',
    status: 'available',
    connectionType: 'api',
    icon: 'radarr',
    iconType: 'builtin',
    color: '#FFC230',
    bgColor: 'bg-yellow-500/10',
    website: 'https://radarr.video',
    docsUrl: 'https://wiki.servarr.com/radarr',
    defaultPort: 7878,
    configFields: [...standardApiFields, standardLogPathField],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['arr', 'movies', 'films', 'automation', 'torrent', 'usenet'],
  },
  {
    id: 'prowlarr',
    name: 'Prowlarr',
    description: 'Indexer manager/proxy for *Arr apps',
    category: 'arr_stack',
    status: 'available',
    connectionType: 'api',
    icon: 'prowlarr',
    iconType: 'builtin',
    color: '#E66001',
    bgColor: 'bg-orange-500/10',
    website: 'https://prowlarr.com',
    docsUrl: 'https://wiki.servarr.com/prowlarr',
    defaultPort: 9696,
    configFields: [...standardApiFields, standardLogPathField],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['arr', 'indexer', 'torrent', 'usenet', 'automation'],
  },
  {
    id: 'lidarr',
    name: 'Lidarr',
    description: 'Music collection manager for Usenet and BitTorrent',
    category: 'arr_stack',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'lidarr',
    iconType: 'dashboard-icons',
    color: '#00C853',
    bgColor: 'bg-green-500/10',
    website: 'https://lidarr.audio',
    docsUrl: 'https://wiki.servarr.com/lidarr',
    defaultPort: 8686,
    configFields: [...standardApiFields, standardLogPathField],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['arr', 'music', 'audio', 'automation', 'torrent', 'usenet'],
  },
  {
    id: 'readarr',
    name: 'Readarr',
    description: 'Book, audiobook, and comic collection manager',
    category: 'arr_stack',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'readarr',
    iconType: 'dashboard-icons',
    color: '#8E4A21',
    bgColor: 'bg-amber-800/10',
    website: 'https://readarr.com',
    docsUrl: 'https://wiki.servarr.com/readarr',
    defaultPort: 8787,
    configFields: [...standardApiFields, standardLogPathField],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['arr', 'books', 'ebooks', 'audiobooks', 'comics', 'automation'],
  },
  {
    id: 'bazarr',
    name: 'Bazarr',
    description: 'Companion to Sonarr and Radarr for subtitles',
    category: 'arr_stack',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'bazarr',
    iconType: 'dashboard-icons',
    color: '#7B68EE',
    bgColor: 'bg-purple-500/10',
    website: 'https://bazarr.media',
    defaultPort: 6767,
    configFields: [...standardApiFields, standardLogPathField],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: false,
    },
    tags: ['arr', 'subtitles', 'srt', 'automation'],
  },

  // ============================================
  // DOWNLOAD CLIENTS
  // ============================================
  {
    id: 'qbittorrent',
    name: 'qBittorrent',
    description: 'Free and reliable P2P BitTorrent client',
    category: 'download_clients',
    status: 'coming_soon',
    connectionType: 'api_basic',
    icon: 'qbittorrent',
    iconType: 'dashboard-icons',
    color: '#2F67BA',
    bgColor: 'bg-blue-600/10',
    website: 'https://qbittorrent.org',
    defaultPort: 8080,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'admin',
        required: true,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter password',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: false,
      metrics: true,
    },
    tags: ['torrent', 'download', 'p2p', 'bittorrent', 'open-source'],
  },
  {
    id: 'sabnzbd',
    name: 'SABnzbd',
    description: 'Free and easy binary newsreader',
    category: 'download_clients',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'sabnzbd',
    iconType: 'dashboard-icons',
    color: '#F5C518',
    bgColor: 'bg-yellow-500/10',
    website: 'https://sabnzbd.org',
    defaultPort: 8080,
    configFields: [...standardApiFields, standardLogPathField],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: false,
      metrics: true,
    },
    tags: ['usenet', 'nzb', 'download', 'newsgroup'],
  },
  {
    id: 'transmission',
    name: 'Transmission',
    description: 'Fast, easy, and free BitTorrent client',
    category: 'download_clients',
    status: 'coming_soon',
    connectionType: 'api_basic',
    icon: 'transmission',
    iconType: 'dashboard-icons',
    color: '#DA1F26',
    bgColor: 'bg-red-500/10',
    website: 'https://transmissionbt.com',
    defaultPort: 9091,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'admin',
        required: false,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter password',
        required: false,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: false,
      metrics: true,
    },
    tags: ['torrent', 'download', 'p2p', 'bittorrent', 'open-source'],
  },
  {
    id: 'nzbget',
    name: 'NZBGet',
    description: 'Efficient Usenet downloader',
    category: 'download_clients',
    status: 'coming_soon',
    connectionType: 'api_basic',
    icon: 'nzbget',
    iconType: 'dashboard-icons',
    color: '#44AD4D',
    bgColor: 'bg-green-500/10',
    website: 'https://nzbget.net',
    defaultPort: 6789,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'nzbget',
        required: true,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter password',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: false,
      metrics: true,
    },
    tags: ['usenet', 'nzb', 'download', 'newsgroup'],
  },

  // ============================================
  // MEDIA REQUESTS
  // ============================================
  {
    id: 'overseerr',
    name: 'Overseerr',
    description: 'Request management and media discovery for Plex',
    category: 'media_requests',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'overseerr',
    iconType: 'dashboard-icons',
    color: '#7B68EE',
    bgColor: 'bg-purple-500/10',
    website: 'https://overseerr.dev',
    defaultPort: 5055,
    configFields: [standardApiFields[0], standardApiFields[1], standardApiFields[2]],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['requests', 'media', 'plex', 'discovery'],
  },
  {
    id: 'jellyseerr',
    name: 'Jellyseerr',
    description: 'Request management for Jellyfin/Emby',
    category: 'media_requests',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'jellyseerr',
    iconType: 'dashboard-icons',
    color: '#805AD5',
    bgColor: 'bg-purple-600/10',
    website: 'https://github.com/Fallenbagel/jellyseerr',
    defaultPort: 5055,
    configFields: [standardApiFields[0], standardApiFields[1], standardApiFields[2]],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['requests', 'media', 'jellyfin', 'emby', 'discovery'],
  },
  {
    id: 'ombi',
    name: 'Ombi',
    description: 'Media request and user management system',
    category: 'media_requests',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'ombi',
    iconType: 'dashboard-icons',
    color: '#E5A00D',
    bgColor: 'bg-yellow-500/10',
    website: 'https://ombi.io',
    defaultPort: 3579,
    configFields: [standardApiFields[0], standardApiFields[1], standardApiFields[2]],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['requests', 'media', 'plex', 'emby', 'jellyfin'],
  },

  // ============================================
  // MEDIA APPS (Photos, Books, Audio)
  // ============================================
  {
    id: 'immich',
    name: 'Immich',
    description: 'High performance self-hosted photo and video management',
    category: 'media_apps',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'immich',
    iconType: 'dashboard-icons',
    color: '#4250AF',
    bgColor: 'bg-indigo-600/10',
    website: 'https://immich.app',
    defaultPort: 2283,
    configFields: [standardApiFields[0], standardApiFields[1], standardApiFields[2]],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: true,
      webhooks: false,
      metrics: true,
    },
    tags: ['photos', 'videos', 'gallery', 'backup', 'google-photos'],
  },
  {
    id: 'kavita',
    name: 'Kavita',
    description: 'Fast, feature rich, cross platform reading server',
    category: 'media_apps',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'kavita',
    iconType: 'dashboard-icons',
    color: '#4A4453',
    bgColor: 'bg-purple-900/10',
    website: 'https://kavitareader.com',
    defaultPort: 5000,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'admin',
        required: true,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter password',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: true,
      webhooks: false,
      metrics: true,
    },
    tags: ['ebooks', 'comics', 'manga', 'reading', 'library'],
  },
  {
    id: 'audiobookshelf',
    name: 'Audiobookshelf',
    description: 'Self-hosted audiobook and podcast server',
    category: 'media_apps',
    status: 'coming_soon',
    connectionType: 'api_token',
    icon: 'audiobookshelf',
    iconType: 'dashboard-icons',
    color: '#F59E0B',
    bgColor: 'bg-amber-500/10',
    website: 'https://audiobookshelf.org',
    defaultPort: 13378,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'token',
        label: 'API Token',
        type: 'password',
        placeholder: 'Enter API token',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: true,
      webhooks: true,
      metrics: true,
    },
    tags: ['audiobooks', 'podcasts', 'audio', 'library'],
  },

  // ============================================
  // REVERSE PROXIES
  // ============================================
  {
    id: 'traefik',
    name: 'Traefik',
    description: 'Modern HTTP reverse proxy and load balancer',
    category: 'network_dns',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'traefik',
    iconType: 'dashboard-icons',
    color: '#24A1C1',
    bgColor: 'bg-cyan-500/10',
    website: 'https://traefik.io',
    defaultPort: 8080,
    configFields: [
      standardApiFields[0],
      {
        name: 'url',
        label: 'Dashboard URL',
        type: 'url',
        placeholder: 'http://localhost:8080',
        description: 'URL to Traefik dashboard/API',
        required: true,
      },
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'admin',
        required: false,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter password',
        required: false,
      },
      standardLogPathField,
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: false,
      metrics: true,
    },
    tags: ['proxy', 'reverse-proxy', 'load-balancer', 'docker', 'kubernetes'],
  },
  {
    id: 'nginx-proxy-manager',
    name: 'Nginx Proxy Manager',
    description: 'Easy-to-use reverse proxy with SSL',
    category: 'network_dns',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'nginx-proxy-manager',
    iconType: 'dashboard-icons',
    color: '#F15833',
    bgColor: 'bg-orange-500/10',
    website: 'https://nginxproxymanager.com',
    defaultPort: 81,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'email',
        label: 'Email',
        type: 'text',
        placeholder: 'admin@example.com',
        required: true,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter password',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['proxy', 'reverse-proxy', 'nginx', 'ssl', 'letsencrypt'],
  },

  // ============================================
  // CONTAINERS
  // ============================================
  {
    id: 'docker',
    name: 'Docker',
    description: 'Container platform - monitor all container logs',
    category: 'containers',
    status: 'coming_soon',
    connectionType: 'docker',
    icon: 'docker',
    iconType: 'dashboard-icons',
    color: '#2496ED',
    bgColor: 'bg-blue-500/10',
    website: 'https://docker.com',
    configFields: [
      standardApiFields[0],
      {
        name: 'socketPath',
        label: 'Docker Socket Path',
        type: 'path',
        placeholder: '/var/run/docker.sock',
        description: 'Path to Docker socket (or TCP URL)',
        required: true,
        default: '/var/run/docker.sock',
      },
      {
        name: 'containers',
        label: 'Container Filter',
        type: 'text',
        placeholder: 'container1,container2 (leave empty for all)',
        description: 'Comma-separated list of container names to monitor',
        required: false,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: false,
      metrics: true,
    },
    tags: ['container', 'docker', 'logs', 'infrastructure'],
  },
  {
    id: 'portainer',
    name: 'Portainer',
    description: 'Container management made easy',
    category: 'containers',
    status: 'coming_soon',
    connectionType: 'api_token',
    icon: 'portainer',
    iconType: 'dashboard-icons',
    color: '#13BEF9',
    bgColor: 'bg-cyan-400/10',
    website: 'https://portainer.io',
    defaultPort: 9000,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'token',
        label: 'API Token',
        type: 'password',
        placeholder: 'Enter API token',
        description: 'Generate from User settings > Access tokens',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['container', 'docker', 'kubernetes', 'management', 'gui'],
  },

  // ============================================
  // MONITORING
  // ============================================
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Fancy self-hosted monitoring tool',
    category: 'monitoring',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'uptime-kuma',
    iconType: 'dashboard-icons',
    color: '#5CDD8B',
    bgColor: 'bg-green-400/10',
    website: 'https://uptime.kuma.pet',
    defaultPort: 3001,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'admin',
        required: true,
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter password',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: true,
    },
    tags: ['uptime', 'monitoring', 'status', 'ping', 'heartbeat'],
  },

  // ============================================
  // DATABASES
  // ============================================
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Powerful, open source object-relational database',
    category: 'databases',
    status: 'coming_soon',
    connectionType: 'log_file',
    icon: 'postgresql',
    iconType: 'dashboard-icons',
    color: '#336791',
    bgColor: 'bg-blue-700/10',
    website: 'https://postgresql.org',
    defaultPort: 5432,
    configFields: [
      standardApiFields[0],
      {
        name: 'logPath',
        label: 'Log File Path',
        type: 'path',
        placeholder: '/var/log/postgresql/postgresql.log',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['database', 'sql', 'relational', 'open-source'],
  },

  // ============================================
  // AI PROVIDERS
  // ============================================
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models for AI-powered log analysis',
    category: 'ai_providers',
    status: 'available',
    connectionType: 'api',
    icon: 'openai',
    iconType: 'builtin',
    color: '#10A37F',
    bgColor: 'bg-emerald-500/10',
    website: 'https://openai.com',
    configFields: [
      standardApiFields[0],
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'sk-...',
        description: 'Your OpenAI API key',
        required: true,
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        options: [
          { value: 'gpt-4o', label: 'GPT-4o (Recommended)' },
          { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster)' },
          { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Cheapest)' },
        ],
        default: 'gpt-4o',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: false,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['ai', 'llm', 'gpt', 'analysis', 'chat'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models for AI-powered log analysis',
    category: 'ai_providers',
    status: 'available',
    connectionType: 'api',
    icon: 'anthropic',
    iconType: 'builtin',
    color: '#D4A574',
    bgColor: 'bg-orange-500/10',
    website: 'https://anthropic.com',
    configFields: [
      standardApiFields[0],
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'sk-ant-...',
        description: 'Your Anthropic API key',
        required: true,
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        options: [
          { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Recommended)' },
          { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (Most Capable)' },
          { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Fastest)' },
        ],
        default: 'claude-sonnet-4-20250514',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: false,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['ai', 'llm', 'claude', 'analysis', 'chat'],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run large language models locally',
    category: 'ai_providers',
    status: 'available',
    connectionType: 'api',
    icon: 'ollama',
    iconType: 'dashboard-icons',
    color: '#FFFFFF',
    bgColor: 'bg-gray-100/10',
    website: 'https://ollama.ai',
    defaultPort: 11434,
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'llama3.2',
        description: 'Name of the model to use',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: false,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['ai', 'llm', 'local', 'privacy', 'open-source'],
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Gemini models for AI-powered log analysis',
    category: 'ai_providers',
    status: 'available',
    connectionType: 'api',
    icon: 'google',
    iconType: 'builtin',
    color: '#4285F4',
    bgColor: 'bg-blue-500/10',
    website: 'https://aistudio.google.com',
    configFields: [
      standardApiFields[0],
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'password',
        placeholder: 'AIza...',
        description: 'Your Google AI API key',
        required: true,
      },
      {
        name: 'model',
        label: 'Model',
        type: 'select',
        options: [
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Recommended)' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Most Capable)' },
          { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Faster)' },
        ],
        default: 'gemini-2.0-flash',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: false,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['ai', 'llm', 'gemini', 'analysis', 'chat'],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    description: 'Run any LLM locally with LM Studio',
    category: 'ai_providers',
    status: 'available',
    connectionType: 'api',
    icon: 'lmstudio',
    iconType: 'dashboard-icons',
    color: '#6366F1',
    bgColor: 'bg-indigo-500/10',
    website: 'https://lmstudio.ai',
    defaultPort: 1234,
    configFields: [
      standardApiFields[0],
      {
        name: 'url',
        label: 'Server URL',
        type: 'url',
        placeholder: 'http://localhost:1234',
        description: 'LM Studio local server URL',
        required: true,
      },
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'local-model',
        description: 'Name of the loaded model',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: false,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['ai', 'llm', 'local', 'privacy', 'open-source'],
  },

  // ============================================
  // GENERIC & CUSTOM
  // ============================================
  {
    id: 'docker-container',
    name: 'Docker Container',
    description: 'Monitor logs from any Docker container by name',
    category: 'generic',
    status: 'coming_soon',
    connectionType: 'docker',
    icon: 'docker',
    iconType: 'dashboard-icons',
    color: '#2496ED',
    bgColor: 'bg-blue-500/10',
    configFields: [
      standardApiFields[0],
      {
        name: 'containerName',
        label: 'Container Name',
        type: 'text',
        placeholder: 'my-container',
        description: 'Name or ID of the container to monitor',
        required: true,
      },
      {
        name: 'socketPath',
        label: 'Docker Socket Path',
        type: 'path',
        placeholder: '/var/run/docker.sock',
        default: '/var/run/docker.sock',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['docker', 'container', 'logs', 'generic'],
  },
  {
    id: 'log-file',
    name: 'Log File',
    description: 'Monitor any log file on the filesystem',
    category: 'generic',
    status: 'coming_soon',
    connectionType: 'log_file',
    icon: 'file-text',
    iconType: 'dashboard-icons',
    color: '#6B7280',
    bgColor: 'bg-gray-500/10',
    configFields: [
      standardApiFields[0],
      {
        name: 'logPath',
        label: 'Log File Path',
        type: 'path',
        placeholder: '/var/log/myapp.log',
        required: true,
      },
      {
        name: 'pattern',
        label: 'Log Pattern',
        type: 'select',
        options: [
          { value: 'auto', label: 'Auto-detect' },
          { value: 'json', label: 'JSON (one object per line)' },
          { value: 'syslog', label: 'Syslog format' },
          { value: 'apache', label: 'Apache/Nginx access log' },
          { value: 'custom', label: 'Custom regex' },
        ],
        default: 'auto',
        required: true,
      },
      {
        name: 'customPattern',
        label: 'Custom Regex Pattern',
        type: 'text',
        placeholder: '^(?<timestamp>\\S+) (?<level>\\S+) (?<message>.*)$',
        description: "Only used when pattern is 'custom'",
        required: false,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['file', 'logs', 'custom', 'generic'],
  },
  {
    id: 'syslog',
    name: 'Syslog',
    description: 'Receive logs via syslog protocol',
    category: 'generic',
    status: 'coming_soon',
    connectionType: 'syslog',
    icon: 'terminal',
    iconType: 'dashboard-icons',
    color: '#6B7280',
    bgColor: 'bg-gray-500/10',
    configFields: [
      standardApiFields[0],
      {
        name: 'port',
        label: 'Listen Port',
        type: 'number',
        placeholder: '514',
        default: 514,
        required: true,
      },
      {
        name: 'protocol',
        label: 'Protocol',
        type: 'select',
        options: [
          { value: 'udp', label: 'UDP' },
          { value: 'tcp', label: 'TCP' },
        ],
        default: 'udp',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: false,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['syslog', 'rfc5424', 'logs', 'generic'],
  },
  {
    id: 'webhook',
    name: 'Webhook Receiver',
    description: 'Receive logs via HTTP webhooks',
    category: 'generic',
    status: 'coming_soon',
    connectionType: 'webhook',
    icon: 'webhook',
    iconType: 'dashboard-icons',
    color: '#8B5CF6',
    bgColor: 'bg-violet-500/10',
    configFields: [
      standardApiFields[0],
      {
        name: 'secret',
        label: 'Webhook Secret',
        type: 'password',
        placeholder: 'Enter secret for validation',
        description: 'Optional secret for webhook signature validation',
        required: false,
      },
    ],
    capabilities: {
      realTimeLogs: true,
      activityLog: true,
      sessions: false,
      webhooks: true,
      metrics: false,
    },
    tags: ['webhook', 'http', 'api', 'generic'],
  },
  {
    id: 'custom-api',
    name: 'Custom API',
    description: 'Connect to any REST API endpoint',
    category: 'generic',
    status: 'coming_soon',
    connectionType: 'api',
    icon: 'code',
    iconType: 'dashboard-icons',
    color: '#6B7280',
    bgColor: 'bg-gray-500/10',
    configFields: [
      standardApiFields[0],
      standardApiFields[1],
      {
        name: 'authType',
        label: 'Authentication Type',
        type: 'select',
        options: [
          { value: 'none', label: 'None' },
          { value: 'api_key', label: 'API Key (Header)' },
          { value: 'bearer', label: 'Bearer Token' },
          { value: 'basic', label: 'Basic Auth' },
        ],
        default: 'api_key',
        required: true,
      },
      {
        name: 'authValue',
        label: 'Auth Value',
        type: 'password',
        placeholder: 'API key or token',
        required: false,
      },
      {
        name: 'logsEndpoint',
        label: 'Logs Endpoint',
        type: 'text',
        placeholder: '/api/logs',
        description: 'API endpoint that returns log entries',
        required: true,
      },
    ],
    capabilities: {
      realTimeLogs: false,
      activityLog: true,
      sessions: false,
      webhooks: false,
      metrics: false,
    },
    tags: ['api', 'rest', 'custom', 'generic'],
  },
];

// Helper functions
export function getIntegrationById(id: string): Integration | undefined {
  return integrations.find((i) => i.id === id);
}

export function getIntegrationsByCategory(category: IntegrationCategory): Integration[] {
  return integrations.filter((i) => i.category === category);
}

export function getAvailableIntegrations(): Integration[] {
  return integrations.filter((i) => i.status === 'available');
}

export function getComingSoonIntegrations(): Integration[] {
  return integrations.filter((i) => i.status === 'coming_soon');
}

export function getCategoryById(id: IntegrationCategory): IntegrationCategoryInfo | undefined {
  return integrationCategories.find((c) => c.id === id);
}

export function searchIntegrations(query: string): Integration[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return integrations;

  return integrations.filter((integration) => {
    const searchableText = [integration.name, integration.description, ...integration.tags]
      .join(' ')
      .toLowerCase();
    return searchableText.includes(lowerQuery);
  });
}

// Dashboard Icons CDN URL helper
export function getDashboardIconUrl(slug: string, format: 'svg' | 'png' = 'svg'): string {
  return `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/${format}/${slug}.${format}`;
}
