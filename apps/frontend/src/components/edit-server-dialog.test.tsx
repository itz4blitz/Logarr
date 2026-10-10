import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditServerDialog } from './edit-server-dialog';
import type { Server } from '@/lib/api';

const mutateAsync = vi.fn();

vi.mock('@/hooks/use-api', () => ({
  useUpdateServer: () => ({ mutateAsync, isPending: false }),
  useTestConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function makeServer(overrides: Partial<Server>): Server {
  return {
    id: 'server-1',
    name: 'My Server',
    providerId: 'sonarr',
    url: 'http://localhost:8989',
    apiKey: 'secret-key',
    username: null,
    logPath: null,
    isConnected: true,
    lastSeen: null,
    lastError: null,
    version: null,
    serverName: null,
    fileIngestionEnabled: false,
    fileIngestionConnected: false,
    fileIngestionError: null,
    logPaths: null,
    logFilePatterns: null,
    lastFileSync: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderDialog(server: Server) {
  return render(<EditServerDialog server={server} open onOpenChange={vi.fn()} />);
}

/** The "API key" / "Password / API key" input is the only password-type field */
function secretInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="password"]');
  if (!input) throw new Error('secret input not found');
  return input;
}

describe('EditServerDialog credential validation', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({});
  });

  describe('qbittorrent', () => {
    const qbit = makeServer({
      providerId: 'qbittorrent',
      url: 'http://localhost:8080',
      apiKey: 'old-password',
      username: 'admin',
    });

    it('renders a username field prefilled from the server', () => {
      renderDialog(qbit);

      expect(screen.getByPlaceholderText('admin')).toHaveValue('admin');
      expect(screen.getByText('Password / API key')).toBeInTheDocument();
    });

    it('allows saving with an empty password and sends the empty apiKey', async () => {
      const user = userEvent.setup();
      renderDialog(qbit);

      await user.clear(secretInput());
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('API key is required')).not.toBeInTheDocument();
      expect(mutateAsync.mock.calls[0]![0]).toMatchObject({
        id: 'server-1',
        data: { apiKey: '', username: 'admin' },
      });
    });

    it('sends an empty username to clear it when the field is emptied', async () => {
      const user = userEvent.setup();
      renderDialog(qbit);

      await user.clear(screen.getByPlaceholderText('admin'));
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync.mock.calls[0]![0].data.username).toBe('');
    });

    it('trims the username before sending it', async () => {
      const user = userEvent.setup();
      renderDialog(qbit);

      await user.clear(screen.getByPlaceholderText('admin'));
      await user.type(screen.getByPlaceholderText('admin'), '  bob  ');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync.mock.calls[0]![0].data.username).toBe('bob');
    });

    it('still validates the URL', async () => {
      const user = userEvent.setup();
      renderDialog(qbit);

      const url = screen.getByDisplayValue('http://localhost:8080');
      await user.clear(url);
      await user.type(url, 'not a url');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      expect(await screen.findByText('Must be a valid URL')).toBeInTheDocument();
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('prefills an empty username as an empty string for auth-bypass servers', () => {
      renderDialog(makeServer({ providerId: 'qbittorrent', apiKey: '', username: null }));

      expect(screen.getByPlaceholderText('admin')).toHaveValue('');
      expect(secretInput()).toHaveValue('');
    });
  });

  describe.each(['sonarr', 'radarr', 'prowlarr', 'whisparr', 'jellyfin', 'emby', 'plex'])(
    '%s',
    (providerId) => {
      const server = makeServer({ providerId });

      it('has no username field', () => {
        renderDialog(server);

        expect(screen.queryByPlaceholderText('admin')).not.toBeInTheDocument();
      });

      it('rejects an empty API key', async () => {
        const user = userEvent.setup();
        renderDialog(server);

        await user.clear(secretInput());
        await user.click(screen.getByRole('button', { name: /save changes/i }));

        expect(await screen.findByText('API key is required')).toBeInTheDocument();
        expect(mutateAsync).not.toHaveBeenCalled();
      });

      it('rejects a whitespace-only API key', async () => {
        const user = userEvent.setup();
        renderDialog(server);

        await user.clear(secretInput());
        await user.type(secretInput(), '   ');
        await user.click(screen.getByRole('button', { name: /save changes/i }));

        expect(await screen.findByText('API key is required')).toBeInTheDocument();
        expect(mutateAsync).not.toHaveBeenCalled();
      });
    }
  );

  it('saves a valid sonarr edit without sending a username', async () => {
    const user = userEvent.setup();
    renderDialog(makeServer({ providerId: 'sonarr' }));

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const data = mutateAsync.mock.calls[0]![0].data;
    expect(data.apiKey).toBe('secret-key');
    expect(data).not.toHaveProperty('username');
  });
});
