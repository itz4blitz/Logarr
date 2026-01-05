import { http, HttpResponse } from 'msw';

const API_URL = 'http://localhost:4000/api';

// Mock data
export const mockServers = [
  {
    id: '1',
    name: 'Jellyfin',
    type: 'jellyfin',
    url: 'http://localhost:8096',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    name: 'Sonarr',
    type: 'sonarr',
    url: 'http://localhost:8989',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const mockIssues = [
  {
    id: '1',
    fingerprint: 'abc123',
    title: 'Connection timeout',
    description: null,
    source: 'jellyfin',
    severity: 'high',
    status: 'open',
    serverId: '1',
    serverName: 'Jellyfin',
    category: 'network',
    occurrenceCount: 15,
    affectedUsersCount: 3,
    affectedSessionsCount: 5,
    impactScore: 72,
    firstSeen: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
  },
];

export const mockIssueStats = {
  totalIssues: 10,
  openIssues: 5,
  criticalIssues: 1,
  highIssues: 3,
  resolvedToday: 2,
  newToday: 1,
  bySource: { jellyfin: 6, sonarr: 4 },
  bySeverity: { critical: 1, high: 3, medium: 4, low: 2 },
  byStatus: { open: 5, acknowledged: 2, resolved: 3 },
  topCategories: [
    { category: 'network', count: 4 },
    { category: 'authentication', count: 3 },
  ],
  averageImpactScore: 45,
};

export const mockDashboardData = {
  health: {
    overall: 'healthy',
    servers: mockServers.map((s) => ({
      id: s.id,
      name: s.name,
      status: 'connected',
      lastSeen: new Date().toISOString(),
    })),
  },
  metrics: {
    totalLogs: 1000,
    logsToday: 150,
    activeIssues: 5,
    activeSessions: 2,
  },
  recentActivity: [],
};

export const handlers = [
  // Servers
  http.get(`${API_URL}/servers`, () => {
    return HttpResponse.json(mockServers);
  }),

  http.get(`${API_URL}/servers/:id`, ({ params }) => {
    const server = mockServers.find((s) => s.id === params.id);
    if (!server) {
      return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json(server);
  }),

  http.post(`${API_URL}/servers`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      { id: '3', ...body, createdAt: new Date().toISOString() },
      { status: 201 }
    );
  }),

  // Issues
  http.get(`${API_URL}/issues`, () => {
    return HttpResponse.json(mockIssues);
  }),

  http.get(`${API_URL}/issues/stats`, () => {
    return HttpResponse.json(mockIssueStats);
  }),

  http.get(`${API_URL}/issues/:id`, ({ params }) => {
    const issue = mockIssues.find((i) => i.id === params.id);
    if (!issue) {
      return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json(issue);
  }),

  http.post(`${API_URL}/issues/:id/acknowledge`, ({ params }) => {
    const issue = mockIssues.find((i) => i.id === params.id);
    if (!issue) {
      return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json({ ...issue, status: 'acknowledged' });
  }),

  http.post(`${API_URL}/issues/:id/resolve`, ({ params }) => {
    const issue = mockIssues.find((i) => i.id === params.id);
    if (!issue) {
      return HttpResponse.json({ message: 'Not found' }, { status: 404 });
    }
    return HttpResponse.json({ ...issue, status: 'resolved' });
  }),

  // Dashboard
  http.get(`${API_URL}/dashboard`, () => {
    return HttpResponse.json(mockDashboardData);
  }),

  http.get(`${API_URL}/dashboard/health`, () => {
    return HttpResponse.json(mockDashboardData.health);
  }),

  http.get(`${API_URL}/dashboard/metrics`, () => {
    return HttpResponse.json(mockDashboardData.metrics);
  }),

  // Logs
  http.get(`${API_URL}/logs`, () => {
    return HttpResponse.json({ entries: [], total: 0, page: 1, pageSize: 50 });
  }),

  http.get(`${API_URL}/logs/stats`, () => {
    return HttpResponse.json({
      totalLogs: 1000,
      byLevel: { info: 800, warn: 150, error: 50 },
      bySource: { jellyfin: 600, sonarr: 400 },
    });
  }),

  // Sessions
  http.get(`${API_URL}/sessions`, () => {
    return HttpResponse.json([]);
  }),

  http.get(`${API_URL}/sessions/active`, () => {
    return HttpResponse.json([]);
  }),

  // Settings - AI Providers
  http.get(`${API_URL}/settings/ai-providers`, () => {
    return HttpResponse.json([]);
  }),
];
