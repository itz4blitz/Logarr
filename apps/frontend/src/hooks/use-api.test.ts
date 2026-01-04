import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  queryKeys,
  useHealth,
  useDashboardStats,
  useServers,
  useServer,
  useLogs,
  useLogStats,
  useSessions,
  useIssues,
  useIssue,
  useIssueStats,
  useAiProviderSettings,
} from './use-api';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  api: {
    getHealth: vi.fn(),
    getDashboard: vi.fn(),
    getServers: vi.fn(),
    getServer: vi.fn(),
    getLogs: vi.fn(),
    getLogStats: vi.fn(),
    getSessions: vi.fn(),
    getIssues: vi.fn(),
    getIssue: vi.fn(),
    getIssueStats: vi.fn(),
    getAiProviderSettings: vi.fn(),
  },
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
};

describe('queryKeys', () => {
  it('should have health key', () => {
    expect(queryKeys.health).toEqual(['health']);
  });

  it('should have dashboard key', () => {
    expect(queryKeys.dashboard).toEqual(['dashboard']);
  });

  it('should have servers key', () => {
    expect(queryKeys.servers).toEqual(['servers']);
  });

  it('should generate server key with id', () => {
    expect(queryKeys.server('123')).toEqual(['servers', '123']);
  });

  it('should generate logs key with params', () => {
    const params = { search: 'error', limit: 10 };
    expect(queryKeys.logs(params)).toEqual(['logs', params]);
  });

  it('should generate logs key without params', () => {
    expect(queryKeys.logs()).toEqual(['logs', undefined]);
  });

  it('should generate log key with id', () => {
    expect(queryKeys.log('123')).toEqual(['logs', 'detail', '123']);
  });

  it('should have sessions key', () => {
    expect(queryKeys.sessions).toEqual(['sessions']);
  });

  it('should have activeSessions key', () => {
    expect(queryKeys.activeSessions).toEqual(['sessions', 'active']);
  });

  it('should generate session key with id', () => {
    expect(queryKeys.session('123')).toEqual(['sessions', '123']);
  });

  it('should generate issues key with params', () => {
    const params = { search: 'connection' };
    expect(queryKeys.issues(params)).toEqual(['issues', params]);
  });

  it('should generate issue key with id', () => {
    expect(queryKeys.issue('123')).toEqual(['issues', 'detail', '123']);
  });

  it('should generate issueStats key with serverId', () => {
    expect(queryKeys.issueStats('server-1')).toEqual(['issues', 'stats', 'server-1']);
  });

  it('should have aiProviderSettings key', () => {
    expect(queryKeys.aiProviderSettings).toEqual(['settings', 'ai']);
  });

  it('should generate aiProviderSetting key with id', () => {
    expect(queryKeys.aiProviderSetting('123')).toEqual(['settings', 'ai', '123']);
  });
});

describe('useHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch health data', async () => {
    const mockHealth = {
      status: 'ok',
      service: 'logarr',
      timestamp: '2024-01-01T00:00:00Z',
      services: {
        api: { status: 'ok' },
        database: { status: 'ok' },
        redis: { status: 'ok' },
      },
    };
    vi.mocked(api.getHealth).mockResolvedValue(mockHealth);

    const { result } = renderHook(() => useHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockHealth);
    expect(api.getHealth).toHaveBeenCalled();
  });
});

describe('useDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch dashboard data', async () => {
    const mockDashboard = {
      health: { status: 'healthy', sources: { online: 2, total: 2 }, issues: { critical: 0, high: 1, open: 3 }, activeStreams: 1 },
      activityChart: [],
      activityHeatmap: [],
      logDistribution: { error: 0, warn: 0, info: 0, debug: 0, total: 0, topSources: [] },
      metrics: { errorRate: { current: 0, trend: [], change: 0 }, logVolume: { today: 0, average: 0, trend: [] }, sessionCount: { today: 0, trend: [] }, issueCount: { open: 0, trend: [] } },
      topIssues: [],
      sources: [],
      nowPlaying: [],
      recentEvents: [],
    };
    vi.mocked(api.getDashboard).mockResolvedValue(mockDashboard);

    const { result } = renderHook(() => useDashboardStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockDashboard);
  });
});

describe('useServers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch servers list', async () => {
    const mockServers = [
      { id: '1', name: 'Server 1', providerId: 'jellyfin', isConnected: true },
      { id: '2', name: 'Server 2', providerId: 'sonarr', isConnected: false },
    ];
    vi.mocked(api.getServers).mockResolvedValue(mockServers as any);

    const { result } = renderHook(() => useServers(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockServers);
  });
});

describe('useServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch single server by id', async () => {
    const mockServer = { id: '123', name: 'Test Server', providerId: 'jellyfin' };
    vi.mocked(api.getServer).mockResolvedValue(mockServer as any);

    const { result } = renderHook(() => useServer('123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockServer);
    expect(api.getServer).toHaveBeenCalledWith('123');
  });

  it('should not fetch when id is empty', () => {
    renderHook(() => useServer(''), {
      wrapper: createWrapper(),
    });

    expect(api.getServer).not.toHaveBeenCalled();
  });
});

describe('useLogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch logs with params', async () => {
    const mockLogs = {
      data: [{ id: '1', message: 'Error', level: 'error' }],
      total: 1,
      limit: 100,
      offset: 0,
    };
    vi.mocked(api.getLogs).mockResolvedValue(mockLogs as any);

    const params = { levels: ['error'], limit: 100 };
    const { result } = renderHook(() => useLogs(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockLogs);
    expect(api.getLogs).toHaveBeenCalledWith(params);
  });
});

describe('useLogStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch log stats', async () => {
    const mockStats = {
      totalCount: 100,
      errorCount: 10,
      warnCount: 20,
      infoCount: 60,
      debugCount: 10,
      errorRate: 0.1,
      topSources: [],
      topErrors: [],
    };
    vi.mocked(api.getLogStats).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useLogStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockStats);
  });

  it('should fetch log stats with serverId', async () => {
    vi.mocked(api.getLogStats).mockResolvedValue({} as any);

    const { result } = renderHook(() => useLogStats('server-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(api.getLogStats).toHaveBeenCalledWith('server-1');
  });
});

describe('useSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch sessions', async () => {
    const mockSessions = [
      { id: '1', userName: 'User 1', isActive: true },
      { id: '2', userName: 'User 2', isActive: false },
    ];
    vi.mocked(api.getSessions).mockResolvedValue(mockSessions as any);

    const { result } = renderHook(() => useSessions(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSessions);
  });
});

describe('useIssues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch issues with params', async () => {
    const mockIssues = [
      { id: '1', title: 'Connection Error', severity: 'high', status: 'open' },
    ];
    vi.mocked(api.getIssues).mockResolvedValue(mockIssues as any);

    const params = { severities: ['high'] as any, search: 'connection' };
    const { result } = renderHook(() => useIssues(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockIssues);
    expect(api.getIssues).toHaveBeenCalledWith(params);
  });
});

describe('useIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch single issue by id', async () => {
    const mockIssue = { id: '123', title: 'Test Issue', severity: 'high' };
    vi.mocked(api.getIssue).mockResolvedValue(mockIssue as any);

    const { result } = renderHook(() => useIssue('123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockIssue);
    expect(api.getIssue).toHaveBeenCalledWith('123');
  });

  it('should not fetch when id is empty', () => {
    renderHook(() => useIssue(''), {
      wrapper: createWrapper(),
    });

    expect(api.getIssue).not.toHaveBeenCalled();
  });
});

describe('useIssueStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch issue stats', async () => {
    const mockStats = {
      totalIssues: 50,
      openIssues: 10,
      criticalIssues: 2,
      highIssues: 5,
      resolvedToday: 3,
      newToday: 2,
      bySource: {},
      bySeverity: {},
      byStatus: {},
      topCategories: [],
      averageImpactScore: 5.5,
    };
    vi.mocked(api.getIssueStats).mockResolvedValue(mockStats);

    const { result } = renderHook(() => useIssueStats(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockStats);
  });
});

describe('useAiProviderSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch AI provider settings', async () => {
    const mockSettings = [
      { id: '1', provider: 'openai', name: 'GPT-4', isEnabled: true },
    ];
    vi.mocked(api.getAiProviderSettings).mockResolvedValue(mockSettings as any);

    const { result } = renderHook(() => useAiProviderSettings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockSettings);
  });
});
