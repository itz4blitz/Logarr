import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import DataManagementPage from './page';

// Mock the hooks
vi.mock('@/hooks/use-api', () => ({
  useRetentionSettings: vi.fn(),
  useUpdateRetentionSettings: vi.fn(),
  useRetentionHistory: vi.fn(),
  useStorageStats: vi.fn(),
  useCleanupPreview: vi.fn(),
  useRunCleanup: vi.fn(),
  useFileIngestionSettings: vi.fn(),
  useUpdateFileIngestionSettings: vi.fn(),
  useDeleteServerLogsByLevel: vi.fn(),
  useDeleteServerLogs: vi.fn(),
  useDeleteAllLogs: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  useRetentionSettings,
  useUpdateRetentionSettings,
  useRetentionHistory,
  useStorageStats,
  useCleanupPreview,
  useRunCleanup,
  useFileIngestionSettings,
  useUpdateFileIngestionSettings,
  useDeleteServerLogsByLevel,
  useDeleteServerLogs,
  useDeleteAllLogs,
} from '@/hooks/use-api';
import { toast } from 'sonner';

const mockSettings = {
  enabled: true,
  infoRetentionDays: 30,
  errorRetentionDays: 90,
  batchSize: 10000,
};

const mockStats = {
  logCount: 10000,
  databaseSizeBytes: 1073741824,
  databaseSizeFormatted: '1.00 GB',
  oldestLogTimestamp: '2024-01-01T00:00:00Z',
  newestLogTimestamp: '2024-12-31T00:00:00Z',
  retentionConfig: {
    enabled: true,
    infoRetentionDays: 30,
    errorRetentionDays: 90,
    cleanupCron: '0 3 * * *',
    batchSize: 10000,
  },
  logCountsByLevel: {
    info: 5000,
    debug: 2000,
    warn: 2000,
    error: 1000,
  },
  serverStats: [
    {
      serverId: 'server-1',
      serverName: 'Plex Server',
      serverType: 'plex',
      logCount: 5000,
      estimatedSizeBytes: 5120000,
      estimatedSizeFormatted: '4.9 MB',
      oldestLogTimestamp: '2024-01-01T00:00:00Z',
      newestLogTimestamp: '2024-12-31T00:00:00Z',
      logCountsByLevel: {
        info: 2500,
        debug: 1000,
        warn: 1000,
        error: 500,
      },
      ageDistribution: {
        last24h: 100,
        last7d: 500,
        last30d: 2000,
        last90d: 2000,
        older: 400,
      },
      eligibleForCleanup: {
        info: 50,
        debug: 25,
        warn: 10,
        error: 5,
        total: 90,
      },
    },
  ],
  ageDistribution: {
    last24h: 200,
    last7d: 1000,
    last30d: 4000,
    last90d: 4000,
    older: 800,
  },
  tableSizes: {
    logEntries: 500000000,
    issues: 10000000,
    sessions: 5000000,
    playbackEvents: 1000000,
    total: 516000000,
  },
};

const mockPreview = {
  infoLogsToDelete: 100,
  debugLogsToDelete: 50,
  warnLogsToDelete: 25,
  errorLogsToDelete: 10,
  totalLogsToDelete: 185,
  estimatedSpaceSavingsBytes: 189440,
  estimatedSpaceSavingsFormatted: '185.0 KB',
  infoCutoffDate: '2024-11-01T00:00:00Z',
  errorCutoffDate: '2024-09-01T00:00:00Z',
};

const mockHistory = [
  {
    id: 'history-1',
    startedAt: '2024-12-30T03:00:00Z',
    completedAt: '2024-12-30T03:00:05Z',
    infoDeleted: 100,
    debugDeleted: 50,
    warnDeleted: 25,
    errorDeleted: 10,
    orphanedOccurrencesDeleted: 5,
    totalDeleted: 185,
    status: 'completed',
    errorMessage: null,
  },
];

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithQueryClient(component: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

describe('DataManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    (useRetentionSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockSettings,
      isLoading: false,
      error: null,
    });

    (useStorageStats as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockStats,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    (useCleanupPreview as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockPreview,
      isLoading: false,
    });

    (useRetentionHistory as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockHistory,
      isLoading: false,
    });

    (useUpdateRetentionSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockSettings),
      isPending: false,
    });

    (useRunCleanup as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        totalDeleted: 185,
        durationMs: 1234,
      }),
      isPending: false,
    });

    // File ingestion settings mocks
    (useFileIngestionSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        maxConcurrentTailers: 5,
        maxFileAgeDays: 7,
        tailerStartDelayMs: 500,
      },
      isLoading: false,
      error: null,
    });

    (useUpdateFileIngestionSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        maxConcurrentTailers: 5,
        maxFileAgeDays: 7,
        tailerStartDelayMs: 500,
      }),
      isPending: false,
    });

    // Delete mutation mocks
    (useDeleteServerLogsByLevel as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ deleted: 50, durationMs: 100 }),
      isPending: false,
    });

    (useDeleteServerLogs as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ deleted: 100, durationMs: 200 }),
      isPending: false,
    });

    (useDeleteAllLogs as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ deleted: 10000, durationMs: 5000 }),
      isPending: false,
    });
  });

  describe('loading state', () => {
    it('should show loading skeleton when settings are loading', () => {
      (useRetentionSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      renderWithQueryClient(<DataManagementPage />);

      // Should show skeletons for loading state
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should show loading skeleton when stats are loading', () => {
      (useStorageStats as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      });

      renderWithQueryClient(<DataManagementPage />);

      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('error state', () => {
    it('should show error message when settings fail to load', () => {
      (useRetentionSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to fetch settings'),
      });

      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Failed to load data management settings')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch settings')).toBeInTheDocument();
    });

    it('should show retry button on error', () => {
      (useRetentionSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to fetch'),
      });

      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should call refetch when retry is clicked', () => {
      const mockRefetch = vi.fn();
      (useRetentionSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to fetch'),
      });
      (useStorageStats as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      renderWithQueryClient(<DataManagementPage />);

      fireEvent.click(screen.getByText('Retry'));
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('storage overview', () => {
    it('should display total log count', () => {
      renderWithQueryClient(<DataManagementPage />);

      // formatCount returns "10.0K" for 10000
      expect(screen.getByText('10.0K')).toBeInTheDocument();
    });

    it('should display database size', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('1.00 GB')).toBeInTheDocument();
    });

    it('should display log level counts', () => {
      renderWithQueryClient(<DataManagementPage />);

      // formatCount returns "1.0K" for 1000, etc.
      // Use getAllByText since same counts may appear in multiple places
      expect(screen.getAllByText('1.0K').length).toBeGreaterThan(0);
      expect(screen.getAllByText('2.0K').length).toBeGreaterThan(0);
      expect(screen.getAllByText('5.0K').length).toBeGreaterThan(0);
    });

    it('should show refresh button', () => {
      renderWithQueryClient(<DataManagementPage />);

      // Find refresh button by icon
      const buttons = screen.getAllByRole('button');
      const refreshButtons = buttons.filter((btn) => btn.querySelector('svg'));
      expect(refreshButtons.length).toBeGreaterThan(0);
    });
  });

  describe('retention policy', () => {
    it('should display retention policy section', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Retention Policy')).toBeInTheDocument();
    });

    it('should show retention settings sliders', () => {
      renderWithQueryClient(<DataManagementPage />);

      // Look for Info/Debug and Error/Warn labels
      expect(screen.getByText('Info/Debug')).toBeInTheDocument();
      expect(screen.getByText('Error/Warn')).toBeInTheDocument();
    });

    it('should show retention inputs with values', () => {
      renderWithQueryClient(<DataManagementPage />);

      // Find the input fields (sliders have associated inputs)
      const inputs = screen.getAllByRole('spinbutton');
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('should have a toggle switch for enabling retention', () => {
      renderWithQueryClient(<DataManagementPage />);

      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBeGreaterThan(0);
    });

    it('should show Save button when settings are changed', async () => {
      renderWithQueryClient(<DataManagementPage />);

      // Toggle the switch to create unsaved changes
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);

      await waitFor(() => {
        expect(screen.getByText('Save')).toBeInTheDocument();
      });
    });
  });

  describe('manual cleanup', () => {
    it('should display manual cleanup section', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Manual Cleanup')).toBeInTheDocument();
    });

    it('should show logs eligible for cleanup', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('185')).toBeInTheDocument();
    });

    it('should show estimated space savings', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText(/185.0 KB/)).toBeInTheDocument();
    });

    it('should show Run Now button', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Run Now')).toBeInTheDocument();
    });

    it('should run cleanup when button clicked', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        totalDeleted: 185,
        durationMs: 1234,
      });
      (useRunCleanup as ReturnType<typeof vi.fn>).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      renderWithQueryClient(<DataManagementPage />);

      fireEvent.click(screen.getByText('Run Now'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });
    });

    it('should show success toast after cleanup', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        totalDeleted: 185,
        durationMs: 1234,
      });
      (useRunCleanup as ReturnType<typeof vi.fn>).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      renderWithQueryClient(<DataManagementPage />);

      fireEvent.click(screen.getByText('Run Now'));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('185 logs removed'));
      });
    });

    it('should show nothing to clean when no logs eligible', () => {
      (useCleanupPreview as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { ...mockPreview, totalLogsToDelete: 0 },
        isLoading: false,
      });

      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Nothing to clean up')).toBeInTheDocument();
    });
  });

  describe('cleanup history', () => {
    it('should display recent runs section', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Recent Runs')).toBeInTheDocument();
    });

    it('should show completed status with count', () => {
      renderWithQueryClient(<DataManagementPage />);

      // The history shows formatted delete count - "185" for 185 entries
      expect(screen.getByText('185')).toBeInTheDocument();
    });

    it('should show no cleanup runs message when history is empty', () => {
      (useRetentionHistory as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [],
        isLoading: false,
      });

      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('No cleanup runs yet')).toBeInTheDocument();
    });
  });

  describe('server breakdown', () => {
    it('should display storage by server section', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText(/Storage by Server/)).toBeInTheDocument();
    });

    it('should show server name', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Plex Server')).toBeInTheDocument();
    });

    it('should show server count in header', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText(/\(1\)/)).toBeInTheDocument();
    });

    it('should expand server details when clicked', async () => {
      renderWithQueryClient(<DataManagementPage />);

      // Find and click the server row
      fireEvent.click(screen.getByText('Plex Server'));

      await waitFor(() => {
        // After expansion, should show Log Levels section
        expect(screen.getByText('Log Levels')).toBeInTheDocument();
      });
    });

    it('should show age distribution when expanded', async () => {
      renderWithQueryClient(<DataManagementPage />);

      fireEvent.click(screen.getByText('Plex Server'));

      await waitFor(() => {
        expect(screen.getByText('Age')).toBeInTheDocument();
      });
    });

    it('should show cleanup section when expanded', async () => {
      renderWithQueryClient(<DataManagementPage />);

      fireEvent.click(screen.getByText('Plex Server'));

      await waitFor(() => {
        expect(screen.getByText('Cleanup')).toBeInTheDocument();
      });
    });
  });

  describe('age distribution', () => {
    it('should display log age distribution section', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Log Age Distribution')).toBeInTheDocument();
    });

    it('should show age buckets', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Last 24 hours')).toBeInTheDocument();
      expect(screen.getByText('Last 7 days')).toBeInTheDocument();
      expect(screen.getByText('Last 30 days')).toBeInTheDocument();
      expect(screen.getByText('Last 90 days')).toBeInTheDocument();
      expect(screen.getByText('Older')).toBeInTheDocument();
    });
  });

  describe('storage breakdown', () => {
    it('should display storage breakdown section', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Storage Breakdown')).toBeInTheDocument();
    });

    it('should show table names', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Log Entries')).toBeInTheDocument();
      expect(screen.getByText('Issues')).toBeInTheDocument();
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(screen.getByText('Playback Events')).toBeInTheDocument();
    });

    it('should show total table size', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('Total Table Size')).toBeInTheDocument();
    });
  });

  describe('delete functionality', () => {
    it('should show Delete All button in header', () => {
      renderWithQueryClient(<DataManagementPage />);

      // Look for the global Delete All button text
      const deleteTexts = screen.getAllByText(/Delete All/i);
      expect(deleteTexts.length).toBeGreaterThan(0);
    });

    it('should have delete mutations initialized', () => {
      renderWithQueryClient(<DataManagementPage />);

      // Verify the delete hooks are called
      expect(useDeleteAllLogs).toHaveBeenCalled();
      expect(useDeleteServerLogs).toHaveBeenCalled();
      expect(useDeleteServerLogsByLevel).toHaveBeenCalled();
    });

    it('should show delete confirmation dialog when Delete All is clicked', async () => {
      renderWithQueryClient(<DataManagementPage />);

      // Find and click the Delete All button
      const deleteTexts = screen.getAllByText(/Delete All/i);
      fireEvent.click(deleteTexts[0]);

      await waitFor(() => {
        // The dialog should show the warning message
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });
    });

    it('should show warning in delete confirmation dialog', async () => {
      renderWithQueryClient(<DataManagementPage />);

      const deleteTexts = screen.getAllByText(/Delete All/i);
      fireEvent.click(deleteTexts[0]);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
      });
    });

    it('should show Cancel and Delete buttons in confirmation dialog', async () => {
      renderWithQueryClient(<DataManagementPage />);

      const deleteTexts = screen.getAllByText(/Delete All/i);
      fireEvent.click(deleteTexts[0]);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      });
    });

    it('should close dialog when Cancel is clicked', async () => {
      renderWithQueryClient(<DataManagementPage />);

      const deleteTexts = screen.getAllByText(/Delete All/i);
      fireEvent.click(deleteTexts[0]);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      });
    });

    it('should call deleteAllLogs mutation when confirmed', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({ deleted: 10000, durationMs: 5000 });
      (useDeleteAllLogs as ReturnType<typeof vi.fn>).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      renderWithQueryClient(<DataManagementPage />);

      const deleteTexts = screen.getAllByText(/Delete All/i);
      fireEvent.click(deleteTexts[0]);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });
    });

    it('should show success toast after global delete', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({ deleted: 10000, durationMs: 5000 });
      (useDeleteAllLogs as ReturnType<typeof vi.fn>).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      renderWithQueryClient(<DataManagementPage />);

      const deleteTexts = screen.getAllByText(/Delete All/i);
      fireEvent.click(deleteTexts[0]);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('10,000 logs'));
      });
    });

    it('should show error toast on delete failure', async () => {
      const mockMutateAsync = vi.fn().mockRejectedValue(new Error('Delete failed'));
      (useDeleteAllLogs as ReturnType<typeof vi.fn>).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      renderWithQueryClient(<DataManagementPage />);

      const deleteTexts = screen.getAllByText(/Delete All/i);
      fireEvent.click(deleteTexts[0]);

      await waitFor(() => {
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Delete failed');
      });
    });

    it('should show colored log level icons when server is expanded', async () => {
      renderWithQueryClient(<DataManagementPage />);

      fireEvent.click(screen.getByText('Plex Server'));

      await waitFor(() => {
        // Look for the Log Levels section header
        expect(screen.getByText('Log Levels')).toBeInTheDocument();
      });
    });

    it('should show delete buttons for each log level when hovering server details', async () => {
      renderWithQueryClient(<DataManagementPage />);

      fireEvent.click(screen.getByText('Plex Server'));

      await waitFor(() => {
        // The expanded view should show the delete all button for the server
        const deleteButtons = screen.getAllByTitle(/Delete.*logs/);
        expect(deleteButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('file ingestion settings', () => {
    it('should display file ingestion settings section', () => {
      renderWithQueryClient(<DataManagementPage />);

      expect(screen.getByText('File Ingestion')).toBeInTheDocument();
    });

    it('should show concurrent tailers setting', () => {
      renderWithQueryClient(<DataManagementPage />);

      // Look for the label text - the label is just "Concurrent"
      expect(screen.getByText('Concurrent')).toBeInTheDocument();
    });

    it('should show max file age setting', () => {
      renderWithQueryClient(<DataManagementPage />);

      // Look for the label text - the label is just "Max Age"
      expect(screen.getByText('Max Age')).toBeInTheDocument();
    });
  });
});
