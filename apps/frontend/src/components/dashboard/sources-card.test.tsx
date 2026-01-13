import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { DashboardSource } from '@/lib/api';

import { SourcesCard } from './sources-card';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock the fit-to-viewport hook to return stable values
vi.mock('@/hooks/use-fit-to-viewport', () => ({
  useFitToViewport: () => ({
    containerRef: { current: null },
    pageSize: 5,
    isReady: true,
  }),
  useFitToViewportPagination: <T,>(data: T[], pageSize: number) => {
    const totalPages = Math.ceil(data.length / pageSize);
    return {
      paginatedData: data.slice(0, pageSize),
      currentPage: 0,
      totalPages,
      totalItems: data.length,
      startIndex: 0,
      endIndex: Math.min(pageSize, data.length),
      hasNextPage: totalPages > 1,
      hasPrevPage: false,
      nextPage: vi.fn(),
      prevPage: vi.fn(),
      firstPage: vi.fn(),
      lastPage: vi.fn(),
    };
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock provider-icon
vi.mock('@/components/provider-icon', () => ({
  ProviderIcon: ({ providerId }: { providerId: string }) => (
    <svg data-testid={`provider-icon-${providerId}`} />
  ),
  getProviderMeta: (providerId: string) => ({
    name: providerId.charAt(0).toUpperCase() + providerId.slice(1),
    color: '#6B7280',
    bgColor: 'bg-gray-500/10',
  }),
}));

// Mock ConnectionStatus
vi.mock('@/components/connection-status', () => ({
  ConnectionStatus: () => <div data-testid="connection-status" />,
}));

const createMockSource = (overrides: Partial<DashboardSource> = {}): DashboardSource => ({
  id: 'source-1',
  name: 'Test Source',
  providerId: 'jellyfin',
  isConnected: true,
  fileIngestionEnabled: false,
  fileIngestionConnected: false,
  lastSeen: new Date().toISOString(),
  version: '1.0.0',
  activeStreams: 0,
  ...overrides,
});

describe('SourcesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('rendering', () => {
    it('should render the card title', () => {
      render(<SourcesCard sources={[]} />);

      expect(screen.getByText('Sources')).toBeInTheDocument();
    });

    it('should render Manage link', () => {
      render(<SourcesCard sources={[]} />);

      const manageLink = screen.getByText('Manage');
      expect(manageLink).toBeInTheDocument();
      expect(manageLink.closest('a')).toHaveAttribute('href', '/sources');
    });

    it('should render empty state when no sources', () => {
      render(<SourcesCard sources={[]} />);

      expect(screen.getByText('No sources configured')).toBeInTheDocument();
    });

    it('should render source name', () => {
      const source = createMockSource({ name: 'My Jellyfin Server' });
      render(<SourcesCard sources={[source]} />);

      expect(screen.getByText('My Jellyfin Server')).toBeInTheDocument();
    });

    it('should render provider icon', () => {
      const source = createMockSource({ providerId: 'plex' });
      render(<SourcesCard sources={[source]} />);

      expect(screen.getByTestId('provider-icon-plex')).toBeInTheDocument();
    });

    it('should render connection status', () => {
      const source = createMockSource();
      render(<SourcesCard sources={[source]} />);

      expect(screen.getByTestId('connection-status')).toBeInTheDocument();
    });

    it('should render version when available', () => {
      const source = createMockSource({ version: '2.5.0' });
      render(<SourcesCard sources={[source]} />);

      expect(screen.getByText(/v2\.5\.0/)).toBeInTheDocument();
    });

    it('should render last seen time', () => {
      const source = createMockSource({ lastSeen: new Date().toISOString() });
      render(<SourcesCard sources={[source]} />);

      // date-fns formatDistanceToNow returns something like "less than a minute ago"
      expect(screen.getByText(/ago/i)).toBeInTheDocument();
    });

    it('should render Never when lastSeen is null', () => {
      const source = createMockSource({ lastSeen: null, version: null });
      render(<SourcesCard sources={[source]} />);

      // The text is just "Never" when there's no version
      expect(screen.getByText('Never')).toBeInTheDocument();
    });

    it('should render multiple sources', () => {
      const sources = [
        createMockSource({ id: '1', name: 'Jellyfin' }),
        createMockSource({ id: '2', name: 'Plex' }),
        createMockSource({ id: '3', name: 'Sonarr' }),
      ];
      render(<SourcesCard sources={sources} />);

      expect(screen.getByText('Jellyfin')).toBeInTheDocument();
      expect(screen.getByText('Plex')).toBeInTheDocument();
      expect(screen.getByText('Sonarr')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show skeletons when loading', () => {
      const { container } = render(<SourcesCard sources={[]} loading />);

      // Should have skeleton elements
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not show source list when loading', () => {
      render(<SourcesCard sources={[createMockSource()]} loading />);

      expect(screen.queryByText('Test Source')).not.toBeInTheDocument();
    });

    it('should not show empty state when loading', () => {
      render(<SourcesCard sources={[]} loading />);

      expect(screen.queryByText('No sources configured')).not.toBeInTheDocument();
    });
  });

  describe('sorting', () => {
    it('should have Name and Recent sort buttons', () => {
      render(<SourcesCard sources={[]} />);

      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Recent')).toBeInTheDocument();
    });

    it('should sort by name by default', () => {
      const sources = [
        createMockSource({ id: '1', name: 'Zebra' }),
        createMockSource({ id: '2', name: 'Alpha' }),
        createMockSource({ id: '3', name: 'Beta' }),
      ];
      render(<SourcesCard sources={sources} />);

      const links = screen
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.includes('/sources?edit='));

      // First source link should be for the alphabetically first item
      expect(links[0]).toHaveAttribute('href', '/sources?edit=2'); // Alpha
    });

    it('should switch to Recent sort when clicked', () => {
      const oldDate = new Date('2023-01-01').toISOString();
      const newDate = new Date('2024-01-01').toISOString();
      const sources = [
        createMockSource({ id: '1', name: 'Old Source', lastSeen: oldDate }),
        createMockSource({ id: '2', name: 'New Source', lastSeen: newDate }),
      ];
      render(<SourcesCard sources={sources} />);

      // Click Recent button
      fireEvent.click(screen.getByText('Recent'));

      // localStorage should be updated
      expect(localStorageMock.setItem).toHaveBeenCalledWith('logarr-sources-sort', 'lastSeen');
    });

    it('should persist sort preference to localStorage', () => {
      render(<SourcesCard sources={[]} />);

      fireEvent.click(screen.getByText('Recent'));

      expect(localStorageMock.setItem).toHaveBeenCalledWith('logarr-sources-sort', 'lastSeen');
    });

    it('should load sort preference from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('lastSeen');

      render(<SourcesCard sources={[]} />);

      expect(localStorageMock.getItem).toHaveBeenCalledWith('logarr-sources-sort');
    });

    it('should have both sort buttons visible', () => {
      render(<SourcesCard sources={[]} />);

      const nameButton = screen.getByText('Name');
      const recentButton = screen.getByText('Recent');

      // Both buttons should be in the document
      expect(nameButton).toBeInTheDocument();
      expect(recentButton).toBeInTheDocument();

      // Both should have the base styling
      expect(nameButton.className).toContain('rounded');
      expect(recentButton.className).toContain('rounded');
    });

    it('should be clickable and trigger sort change', () => {
      render(<SourcesCard sources={[]} />);

      fireEvent.click(screen.getByText('Recent'));

      // localStorage should be updated with the new sort preference
      expect(localStorageMock.setItem).toHaveBeenCalledWith('logarr-sources-sort', 'lastSeen');
    });
  });

  describe('source links', () => {
    it('should link each source to edit page', () => {
      const source = createMockSource({ id: 'test-id-123' });
      render(<SourcesCard sources={[source]} />);

      const link = screen.getByRole('link', { name: /Test Source/i });
      expect(link).toHaveAttribute('href', '/sources?edit=test-id-123');
    });
  });

  describe('disconnected state styling', () => {
    it('should apply grayscale to disconnected source icon', () => {
      const source = createMockSource({ isConnected: false });
      const { container } = render(<SourcesCard sources={[source]} />);

      const grayScaleElement = container.querySelector('.grayscale');
      expect(grayScaleElement).toBeInTheDocument();
    });

    it('should apply opacity to disconnected source icon', () => {
      const source = createMockSource({ isConnected: false });
      const { container } = render(<SourcesCard sources={[source]} />);

      const opacityElement = container.querySelector('.opacity-40');
      expect(opacityElement).toBeInTheDocument();
    });

    it('should not apply grayscale to connected source', () => {
      const source = createMockSource({ isConnected: true });
      const { container } = render(<SourcesCard sources={[source]} />);

      // The icon container should not have grayscale
      const iconContainers = container.querySelectorAll('[class*="flex h-8 w-8"]');
      iconContainers.forEach((container) => {
        expect(container.className).not.toContain('grayscale');
      });
    });
  });

  describe('compact layout', () => {
    it('should use compact padding (p-3)', () => {
      const { container } = render(<SourcesCard sources={[]} />);

      const card = container.querySelector('.p-3');
      expect(card).toBeInTheDocument();
    });

    it('should use compact row spacing (space-y-1)', () => {
      const sources = [
        createMockSource({ id: '1', name: 'Source 1' }),
        createMockSource({ id: '2', name: 'Source 2' }),
      ];
      const { container } = render(<SourcesCard sources={sources} />);

      const listContainer = container.querySelector('.space-y-1');
      expect(listContainer).toBeInTheDocument();
    });

    it('should use compact icon size (h-8 w-8)', () => {
      const source = createMockSource();
      const { container } = render(<SourcesCard sources={[source]} />);

      const iconContainer = container.querySelector('.h-8.w-8');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should use compact row padding (py-1.5)', () => {
      const source = createMockSource();
      const { container } = render(<SourcesCard sources={[source]} />);

      const row = container.querySelector('.py-1\\.5');
      expect(row).toBeInTheDocument();
    });
  });

  describe('pagination', () => {
    it('should not show pagination for single page', () => {
      const sources = [createMockSource({ id: '1' })];
      render(<SourcesCard sources={sources} />);

      // Pagination uses ChevronLeft/ChevronRight buttons
      expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    });
  });
});
