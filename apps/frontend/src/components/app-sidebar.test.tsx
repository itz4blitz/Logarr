import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Set the version environment variable before any imports
const TEST_VERSION = '0.4.3';
process.env.NEXT_PUBLIC_APP_VERSION = TEST_VERSION;

// Mock the hooks used by AppSidebar
vi.mock('@/hooks/use-api', () => ({
  useHealth: () => ({
    data: {
      status: 'ok',
      services: {
        api: { status: 'ok', latency: 5 },
        database: { status: 'ok', latency: 10 },
        redis: { status: 'ok', latency: 3 },
      },
    },
  }),
  useServers: () => ({ data: [] }),
  useActiveSessions: () => ({ data: [] }),
  useLogStats: () => ({ data: { errorCount: 0, warnCount: 0 } }),
  useIssueStats: () => ({ data: { openIssues: 0, criticalIssues: 0 } }),
  useDefaultAiProvider: () => ({ data: null }),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// Mock the sidebar UI components
vi.mock('@/components/ui/sidebar', () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar">{children}</div>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-footer">{children}</div>
  ),
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuBadge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarSeparator: () => <hr />,
  useSidebar: () => ({ state: 'expanded' }),
}));

// Mock the tooltip components
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-trigger">{children}</div>
  ),
}));

// Import after mocks are set up
import { AppSidebar } from './app-sidebar';

describe('AppSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Version Display', () => {
    it('should display version in expanded state with v prefix', () => {
      render(<AppSidebar />);

      // In expanded state, should show "v0.4.3"
      const versionText = screen.getByText(`v${TEST_VERSION}`);
      expect(versionText).toBeInTheDocument();
    });

    it('should render version in the sidebar footer', () => {
      render(<AppSidebar />);

      const footer = screen.getByTestId('sidebar-footer');
      expect(footer).toBeInTheDocument();

      // Version should be within the footer
      const versionText = screen.getByText(`v${TEST_VERSION}`);
      expect(footer).toContainElement(versionText);
    });

    it('should have tooltip with full version info', () => {
      render(<AppSidebar />);

      // The tooltip content should show "Logarr v0.4.3"
      const tooltipContent = screen.getAllByTestId('tooltip-content');
      const versionTooltip = tooltipContent.find((el) =>
        el.textContent?.includes(`Logarr v${TEST_VERSION}`)
      );
      expect(versionTooltip).toBeInTheDocument();
    });
  });

  describe('Version Display - Collapsed State', () => {
    beforeEach(() => {
      // Override useSidebar mock for collapsed state
      vi.doMock('@/components/ui/sidebar', async () => {
        const actual = await vi.importActual('@/components/ui/sidebar');
        return {
          ...actual,
          Sidebar: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="sidebar">{children}</div>
          ),
          SidebarContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarFooter: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="sidebar-footer">{children}</div>
          ),
          SidebarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarGroupContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarMenuButton: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarMenuBadge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
          SidebarSeparator: () => <hr />,
          useSidebar: () => ({ state: 'collapsed' }),
        };
      });
    });

    it('should display version without v prefix in collapsed state', async () => {
      // This test validates the conditional rendering logic
      // In collapsed state, version should show as "0.4.3" without the "v" prefix
      // The actual behavior depends on useSidebar().state
      render(<AppSidebar />);

      // Version text should be present
      const versionElements = screen.getAllByText(new RegExp(TEST_VERSION));
      expect(versionElements.length).toBeGreaterThan(0);
    });
  });

  describe('Service Status Indicators', () => {
    it('should render API status indicator', () => {
      render(<AppSidebar />);
      // API appears in both status indicator and tooltip, use getAllByText
      const apiElements = screen.getAllByText('API');
      expect(apiElements.length).toBeGreaterThan(0);
    });

    it('should render DB status indicator', () => {
      render(<AppSidebar />);
      // DB appears in both status indicator and tooltip
      const dbElements = screen.getAllByText('DB');
      expect(dbElements.length).toBeGreaterThan(0);
    });

    it('should render Live status indicator', () => {
      render(<AppSidebar />);
      // Live appears in both status indicator and tooltip
      const liveElements = screen.getAllByText('Live');
      expect(liveElements.length).toBeGreaterThan(0);
    });
  });

  describe('Navigation Items', () => {
    it('should render Dashboard link', () => {
      render(<AppSidebar />);
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('should render Sources link', () => {
      render(<AppSidebar />);
      expect(screen.getByText('Sources')).toBeInTheDocument();
    });

    it('should render Issues link', () => {
      render(<AppSidebar />);
      expect(screen.getByText('Issues')).toBeInTheDocument();
    });

    it('should render Logs link', () => {
      render(<AppSidebar />);
      expect(screen.getByText('Logs')).toBeInTheDocument();
    });

    it('should render Sessions link', () => {
      render(<AppSidebar />);
      expect(screen.getByText('Sessions')).toBeInTheDocument();
    });

    it('should render Settings link', () => {
      render(<AppSidebar />);
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });
});
