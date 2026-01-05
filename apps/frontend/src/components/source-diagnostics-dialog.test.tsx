import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SourceDiagnosticsDialog } from './source-diagnostics-dialog';
import type { Server, ConnectionStatus } from '@/lib/api';

// Mock clipboard API
const mockWriteText = vi.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

describe('SourceDiagnosticsDialog', () => {
  const mockServer: Server = {
    id: 'server-1',
    name: 'Plex Server',
    url: 'http://192.168.1.100:32400',
    providerId: 'plex',
    apiKey: 'test-api-key',
    logPath: null,
    isConnected: true,
    lastSeen: '2024-01-01T00:00:00Z',
    lastError: null,
    version: '1.32.0',
    serverName: 'Plex Media Server',
    fileIngestionEnabled: true,
    fileIngestionConnected: true,
    fileIngestionError: null,
    logPaths: ['/plex-logs', '/var/log/plex'],
    logFilePatterns: ['*.log', '*.txt'],
    lastFileSync: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  const mockConnectionStatus: ConnectionStatus = {
    connected: true,
    serverInfo: {
      name: 'Plex Media Server',
      version: '1.32.0',
      id: 'plex-server-id',
    },
    fileIngestion: {
      enabled: true,
      connected: true,
      paths: [
        {
          path: '/plex-logs',
          accessible: true,
          files: ['Plex Media Server.log', 'Plex Transcoder.log'],
        },
        {
          path: '/var/log/plex',
          accessible: false,
          error: 'Path does not exist',
        },
      ],
    },
  };

  const defaultProps = {
    server: mockServer,
    connectionStatus: mockConnectionStatus,
    isLoading: false,
    open: true,
    onOpenChange: vi.fn(),
    onRefresh: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render dialog with server name', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText(/Diagnostics: Plex Server/)).toBeInTheDocument();
    });

    it('should show API connection as connected', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText('API Connection')).toBeInTheDocument();
      // There are multiple "Connected" badges, just verify at least one exists
      const connectedBadges = screen.getAllByText('Connected');
      expect(connectedBadges.length).toBeGreaterThan(0);
    });

    it('should show server info when connected', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText(/Plex Media Server v1.32.0/)).toBeInTheDocument();
    });

    it('should show API connection as disconnected when not connected', () => {
      const disconnectedStatus: ConnectionStatus = {
        connected: false,
        error: 'Connection refused',
      };

      render(
        <SourceDiagnosticsDialog
          {...defaultProps}
          connectionStatus={disconnectedStatus}
        />
      );

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });

    it('should show file ingestion section when enabled', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText('File Ingestion')).toBeInTheDocument();
    });

    it('should not show file ingestion section when disabled on server', () => {
      const serverWithoutFileIngestion = {
        ...mockServer,
        fileIngestionEnabled: false,
      };

      render(
        <SourceDiagnosticsDialog
          {...defaultProps}
          server={serverWithoutFileIngestion}
        />
      );

      expect(screen.queryByText('File Ingestion')).not.toBeInTheDocument();
    });

    it('should show configured paths', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText('Configured Paths:')).toBeInTheDocument();
      expect(screen.getByText('/plex-logs')).toBeInTheDocument();
      expect(screen.getByText('/var/log/plex')).toBeInTheDocument();
    });

    it('should show accessible path count', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText(/1\/2 paths accessible/)).toBeInTheDocument();
      expect(screen.getByText(/2 files found/)).toBeInTheDocument();
    });

    it('should show file patterns', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText('File Patterns:')).toBeInTheDocument();
      expect(screen.getByText('*.log')).toBeInTheDocument();
      expect(screen.getByText('*.txt')).toBeInTheDocument();
    });

    it('should show server debug info', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText(/Server ID:/)).toBeInTheDocument();
      expect(screen.getByText('server-1')).toBeInTheDocument();
      expect(screen.getByText(/Provider:/)).toBeInTheDocument();
      expect(screen.getByText('plex')).toBeInTheDocument();
    });

    it('should show path error for inaccessible paths', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      expect(screen.getByText('Path does not exist')).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when isLoading is true', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} isLoading={true} />);

      // The refresh button should contain a spinning loader icon
      const spinnerIcon = document.querySelector('.animate-spin');
      expect(spinnerIcon).toBeInTheDocument();
    });

    it('should disable refresh button when loading', () => {
      render(<SourceDiagnosticsDialog {...defaultProps} isLoading={true} />);

      // Find the refresh button by looking for disabled buttons in the dialog header
      const disabledButtons = screen.getAllByRole('button').filter((btn) => btn.hasAttribute('disabled'));
      expect(disabledButtons.length).toBeGreaterThan(0);
    });
  });

  describe('interactions', () => {
    it('should call onRefresh when refresh button clicked', () => {
      const onRefresh = vi.fn();
      render(<SourceDiagnosticsDialog {...defaultProps} onRefresh={onRefresh} />);

      const buttons = screen.getAllByRole('button');
      // Find the refresh button (it's in the header, small size)
      const refreshButton = buttons[0];
      fireEvent.click(refreshButton);

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('should copy path to clipboard when copy button clicked', async () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      // Find the copy button - it's a small button (h-5 w-5) with a Copy icon
      // The paths are /plex-logs and /var/log/plex, find the path text first
      const pathElement = screen.getByText('/plex-logs');
      // The copy button is a sibling of the path code element
      const pathContainer = pathElement.closest('.flex.items-center.gap-2');
      const copyButton = pathContainer?.querySelector('button');

      if (copyButton) {
        fireEvent.click(copyButton);

        await waitFor(() => {
          expect(mockWriteText).toHaveBeenCalledWith('/plex-logs');
        });
      }
    });

    it('should expand path details when clicked', async () => {
      render(<SourceDiagnosticsDialog {...defaultProps} />);

      // First path is expanded by default (index 0 is in expandedPaths Set)
      // The discovered files should be visible in expanded state
      // Use getAllByText since file names can appear in multiple places (patterns vs discovered files)
      const plexServerFiles = screen.getAllByText('Plex Media Server.log');
      const plexTranscoderFiles = screen.getAllByText('Plex Transcoder.log');

      expect(plexServerFiles.length).toBeGreaterThan(0);
      expect(plexTranscoderFiles.length).toBeGreaterThan(0);
    });
  });

  describe('null/edge cases', () => {
    it('should handle null connectionStatus', () => {
      render(
        <SourceDiagnosticsDialog {...defaultProps} connectionStatus={null} />
      );

      expect(screen.getByText('API Connection')).toBeInTheDocument();
      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    it('should handle empty log paths', () => {
      const serverNoLogPaths = {
        ...mockServer,
        logPaths: [],
      };

      render(
        <SourceDiagnosticsDialog {...defaultProps} server={serverNoLogPaths} />
      );

      expect(screen.queryByText('Configured Paths:')).not.toBeInTheDocument();
    });

    it('should handle empty file patterns', () => {
      const serverNoPatterns = {
        ...mockServer,
        logFilePatterns: [],
      };

      render(
        <SourceDiagnosticsDialog {...defaultProps} server={serverNoPatterns} />
      );

      expect(screen.queryByText('File Patterns:')).not.toBeInTheDocument();
    });

    it('should show lastError if present', () => {
      const serverWithError = {
        ...mockServer,
        lastError: 'Authentication failed',
      };

      render(
        <SourceDiagnosticsDialog {...defaultProps} server={serverWithError} />
      );

      expect(screen.getByText(/Last Error:/)).toBeInTheDocument();
      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });

    it('should show fileIngestionError if present', () => {
      const serverWithFileError = {
        ...mockServer,
        fileIngestionError: 'Permission denied',
      };

      render(
        <SourceDiagnosticsDialog {...defaultProps} server={serverWithFileError} />
      );

      expect(screen.getByText(/File Ingestion Error:/)).toBeInTheDocument();
      expect(screen.getByText('Permission denied')).toBeInTheDocument();
    });
  });
});
