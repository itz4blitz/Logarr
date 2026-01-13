import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import type { SyncProgress } from '@/hooks/use-sync-status';

import { SyncBanner, SyncIndicator, SyncStatusHeader } from './sync-banner';

// Mock the use-sync-status hook
const mockUseSyncStatus = vi.fn();
vi.mock('@/hooks/use-sync-status', () => ({
  useSyncStatus: () => mockUseSyncStatus(),
}));

// Mock Progress component
vi.mock('@/components/ui/progress', () => ({
  Progress: ({ value, className }: { value: number; className?: string }) => (
    <div data-testid="progress-bar" data-value={value} className={className} />
  ),
}));

const createMockSyncProgress = (overrides: Partial<SyncProgress> = {}): SyncProgress => ({
  serverId: 'server-1',
  serverName: 'Test Server',
  status: 'processing',
  totalFiles: 10,
  processedFiles: 5,
  filesCompleted: 3,
  skippedFiles: 0,
  activeFiles: 2,
  queuedFiles: 5,
  currentFiles: ['file1.log', 'file2.log'],
  progress: 30,
  isInitialSync: false,
  ...overrides,
});

describe('SyncBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when not connected', () => {
    it('should return null when not connected', () => {
      mockUseSyncStatus.mockReturnValue({
        connected: false,
        isSyncing: false,
        syncingCount: 0,
        displayProgress: 100,
        servers: new Map(),
        isInitialSync: false,
      });

      const { container } = render(<SyncBanner />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when not syncing', () => {
    it('should return null when not syncing and no servers', () => {
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: false,
        syncingCount: 0,
        displayProgress: 100,
        servers: new Map(),
        isInitialSync: false,
      });

      const { container } = render(<SyncBanner />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when syncing', () => {
    it('should render sync banner when syncing', () => {
      const server = createMockSyncProgress();
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      expect(screen.getByText('Syncing Logs')).toBeInTheDocument();
    });

    it('should show Initial Log Sync for initial sync', () => {
      const server = createMockSyncProgress({ isInitialSync: true });
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: true,
      });

      render(<SyncBanner />);

      expect(screen.getByText('Initial Log Sync')).toBeInTheDocument();
    });

    it('should display progress percentage', () => {
      const server = createMockSyncProgress();
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 75,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      expect(screen.getByText('75%')).toBeInTheDocument();
    });

    it('should display source count', () => {
      const server = createMockSyncProgress();
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 2,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      expect(screen.getByText('2 sources')).toBeInTheDocument();
    });

    it('should use singular "source" for one source', () => {
      const server = createMockSyncProgress();
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      expect(screen.getByText('1 source')).toBeInTheDocument();
    });

    it('should show progress bar', () => {
      const server = createMockSyncProgress();
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      // There are multiple progress bars (main + per-server), get all of them
      const progressBars = screen.getAllByTestId('progress-bar');
      expect(progressBars.length).toBeGreaterThan(0);
      // Main progress bar should show displayProgress
      expect(progressBars[0]).toHaveAttribute('data-value', '50');
    });
  });

  describe('expanded details', () => {
    it('should start expanded by default', () => {
      const server = createMockSyncProgress();
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      // Server name should be visible in expanded section
      expect(screen.getByText('Test Server')).toBeInTheDocument();
    });

    it('should toggle expanded state when clicking expand button', () => {
      const server = createMockSyncProgress();
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      // Find and click the expand toggle (has source count text)
      const expandButton = screen.getByText('1 source').closest('button');
      expect(expandButton).toBeInTheDocument();

      fireEvent.click(expandButton!);

      // Server details should be hidden after collapse
      // Note: The server name is in the expanded section
      expect(screen.queryByText('Test Server')).not.toBeInTheDocument();
    });
  });

  describe('dismiss button', () => {
    it('should not show dismiss for initial sync', () => {
      const server = createMockSyncProgress({ isInitialSync: true });
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: true,
      });

      render(<SyncBanner />);

      expect(screen.queryByTitle('Dismiss')).not.toBeInTheDocument();
    });

    it('should show dismiss for non-initial sync', () => {
      const server = createMockSyncProgress({ isInitialSync: false });
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      expect(screen.getByTitle('Dismiss')).toBeInTheDocument();
    });

    it('should hide banner when dismissed', () => {
      const server = createMockSyncProgress();
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      const { container } = render(<SyncBanner />);

      const dismissButton = screen.getByTitle('Dismiss');
      fireEvent.click(dismissButton);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('server status display', () => {
    it('should show Discovering status', () => {
      const server = createMockSyncProgress({ status: 'discovering' });
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 0,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      expect(screen.getByText('Discovering...')).toBeInTheDocument();
    });

    it('should show error status with processing servers', () => {
      // Error servers don't show in the expanded details (they're filtered out by syncingServers)
      // But we can test that the banner still shows when there are other syncing servers
      const errorServer = createMockSyncProgress({
        serverId: 'server-error',
        serverName: 'Error Server',
        status: 'error',
        error: 'Connection failed',
      });
      const processingServer = createMockSyncProgress({
        serverId: 'server-processing',
        serverName: 'Processing Server',
        status: 'processing',
      });
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([
          ['server-error', errorServer],
          ['server-processing', processingServer],
        ]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      // Processing server should be visible
      expect(screen.getByText('Processing Server')).toBeInTheDocument();
    });

    it('should show file reading status', () => {
      const server = createMockSyncProgress({
        status: 'processing',
        processedFiles: 5,
        filesCompleted: 3,
      });
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      // Should show "Reading X files..." where X = processedFiles - filesCompleted
      expect(screen.getByText('Reading 2 files...')).toBeInTheDocument();
    });

    it('should show current file being processed', () => {
      const server = createMockSyncProgress({
        status: 'processing',
        currentFiles: ['important.log'],
      });
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      expect(screen.getByText('important.log')).toBeInTheDocument();
    });

    it('should show +N for multiple current files', () => {
      const server = createMockSyncProgress({
        status: 'processing',
        currentFiles: ['file1.log', 'file2.log', 'file3.log'],
      });
      mockUseSyncStatus.mockReturnValue({
        connected: true,
        isSyncing: true,
        syncingCount: 1,
        displayProgress: 50,
        servers: new Map([['server-1', server]]),
        isInitialSync: false,
      });

      render(<SyncBanner />);

      expect(screen.getByText(/\+2/)).toBeInTheDocument();
    });
  });
});

describe('SyncIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when not syncing', () => {
    mockUseSyncStatus.mockReturnValue({
      isSyncing: false,
      displayProgress: 100,
      syncingCount: 0,
    });

    const { container } = render(<SyncIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it('should render when syncing', () => {
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      displayProgress: 50,
      syncingCount: 2,
    });

    const { container } = render(<SyncIndicator />);
    expect(container.firstChild).not.toBeNull();
  });

  it('should display progress and count', () => {
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      displayProgress: 75,
      syncingCount: 3,
    });

    render(<SyncIndicator />);

    expect(screen.getByText('75% (3)')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      displayProgress: 50,
      syncingCount: 1,
    });

    const { container } = render(<SyncIndicator className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('SyncStatusHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return flex-1 spacer when not syncing', () => {
    mockUseSyncStatus.mockReturnValue({
      isSyncing: false,
      syncingCount: 0,
      displayProgress: 100,
      servers: new Map(),
      isInitialSync: false,
    });

    const { container } = render(<SyncStatusHeader />);

    expect(container.firstChild).toHaveClass('flex-1');
  });

  it('should render sync status when syncing', () => {
    const server = createMockSyncProgress();
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      syncingCount: 1,
      displayProgress: 50,
      servers: new Map([['server-1', server]]),
      isInitialSync: false,
    });

    render(<SyncStatusHeader />);

    expect(screen.getByText('Syncing')).toBeInTheDocument();
  });

  it('should show Initial Sync for initial sync', () => {
    const server = createMockSyncProgress({ isInitialSync: true });
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      syncingCount: 1,
      displayProgress: 50,
      servers: new Map([['server-1', server]]),
      isInitialSync: true,
    });

    render(<SyncStatusHeader />);

    expect(screen.getByText('Initial Sync')).toBeInTheDocument();
  });

  it('should display progress percentage', () => {
    const server = createMockSyncProgress();
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      syncingCount: 1,
      displayProgress: 65,
      servers: new Map([['server-1', server]]),
      isInitialSync: false,
    });

    render(<SyncStatusHeader />);

    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('should show file count when files available', () => {
    const server = createMockSyncProgress({
      totalFiles: 20,
      filesCompleted: 10,
    });
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      syncingCount: 1,
      displayProgress: 50,
      servers: new Map([['server-1', server]]),
      isInitialSync: false,
    });

    render(<SyncStatusHeader />);

    expect(screen.getByText('(10/20 files)')).toBeInTheDocument();
  });

  it('should show source count when no files', () => {
    const server = createMockSyncProgress({
      status: 'discovering',
      totalFiles: 0,
      filesCompleted: 0,
    });
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      syncingCount: 2,
      displayProgress: 0,
      servers: new Map([['server-1', server]]),
      isInitialSync: false,
    });

    render(<SyncStatusHeader />);

    expect(screen.getByText('(2 sources)')).toBeInTheDocument();
  });

  it('should use singular source for one source', () => {
    const server = createMockSyncProgress({
      status: 'discovering',
      totalFiles: 0,
    });
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      syncingCount: 1,
      displayProgress: 0,
      servers: new Map([['server-1', server]]),
      isInitialSync: false,
    });

    render(<SyncStatusHeader />);

    expect(screen.getByText('(1 source)')).toBeInTheDocument();
  });

  it('should have centered layout', () => {
    const server = createMockSyncProgress();
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      syncingCount: 1,
      displayProgress: 50,
      servers: new Map([['server-1', server]]),
      isInitialSync: false,
    });

    const { container } = render(<SyncStatusHeader />);

    expect(container.firstChild).toHaveClass('flex-1');
    expect(container.firstChild).toHaveClass('flex');
    expect(container.firstChild).toHaveClass('justify-center');
  });

  it('should have styled pill container', () => {
    const server = createMockSyncProgress();
    mockUseSyncStatus.mockReturnValue({
      isSyncing: true,
      syncingCount: 1,
      displayProgress: 50,
      servers: new Map([['server-1', server]]),
      isInitialSync: false,
    });

    const { container } = render(<SyncStatusHeader />);

    const pill = container.querySelector('.rounded-full');
    expect(pill).toBeInTheDocument();
  });
});
