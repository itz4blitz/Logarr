import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AiProvidersPage from './page';

// Mock the hooks
vi.mock('@/hooks/use-api', () => ({
  useAvailableAiProviders: vi.fn(),
  useAiProviderSettings: vi.fn(),
  useCreateAiProviderSetting: vi.fn(),
  useUpdateAiProviderSetting: vi.fn(),
  useDeleteAiProviderSetting: vi.fn(),
  useTestAiProvider: vi.fn(),
  useTestAiProviderSetting: vi.fn(),
  useFetchAiProviderModels: vi.fn(),
  useFetchAiProviderModelsForSetting: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  useAvailableAiProviders,
  useAiProviderSettings,
  useCreateAiProviderSetting,
  useUpdateAiProviderSetting,
  useDeleteAiProviderSetting,
  useTestAiProvider,
  useTestAiProviderSetting,
  useFetchAiProviderModels,
  useFetchAiProviderModelsForSetting,
} from '@/hooks/use-api';
import { toast } from 'sonner';

import type { AiProviderInfo, AiProviderSettings } from '@/lib/api';

const mockProviders: AiProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT models from OpenAI',
    website: 'https://openai.com',
    requiresApiKey: true,
    supportsBaseUrl: true,
    models: [
      { id: 'gpt-4', name: 'GPT-4', contextWindow: 8192 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 4096 },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude models from Anthropic',
    website: 'https://anthropic.com',
    requiresApiKey: true,
    supportsBaseUrl: false,
    models: [
      { id: 'claude-3-opus', name: 'Claude 3 Opus', contextWindow: 200000 },
      { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', contextWindow: 200000 },
    ],
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local LLMs via Ollama',
    website: 'https://ollama.ai',
    requiresApiKey: false,
    supportsBaseUrl: true,
    models: [{ id: 'llama2', name: 'Llama 2', contextWindow: 4096 }],
  },
];

const mockSettings: AiProviderSettings[] = [
  {
    id: 'setting-1',
    provider: 'openai',
    name: 'My OpenAI',
    model: 'gpt-4',
    hasApiKey: true,
    baseUrl: null,
    maxTokens: 1000,
    temperature: 0.7,
    isDefault: true,
    isEnabled: true,
    lastTestResult: 'success',
    lastTestedAt: '2024-12-31T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-12-31T00:00:00Z',
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
  return render(
    <QueryClientProvider client={queryClient}>{component}</QueryClientProvider>
  );
}

describe('AiProvidersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock implementations
    (useAvailableAiProviders as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockProviders,
      isLoading: false,
    });

    (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockSettings,
      isLoading: false,
    });

    (useCreateAiProviderSetting as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });

    (useUpdateAiProviderSetting as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });

    (useDeleteAiProviderSetting as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });

    (useTestAiProvider as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true, responseTime: 100 }),
      isPending: false,
    });

    (useTestAiProviderSetting as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ success: true, responseTime: 100 }),
      isPending: false,
    });

    (useFetchAiProviderModels as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue([]),
      isPending: false,
    });

    (useFetchAiProviderModelsForSetting as ReturnType<typeof vi.fn>).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue([]),
      isPending: false,
    });
  });

  describe('loading state', () => {
    it('should show loading skeleton when providers are loading', () => {
      (useAvailableAiProviders as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: true,
      });

      renderWithQueryClient(<AiProvidersPage />);

      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should show loading skeleton when settings are loading', () => {
      (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
        isLoading: true,
      });

      renderWithQueryClient(<AiProvidersPage />);

      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('empty state', () => {
    it('should show empty state when no providers configured', () => {
      (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [],
        isLoading: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('No AI Providers Configured')).toBeInTheDocument();
    });

    it('should show provider buttons in empty state', () => {
      (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [],
        isLoading: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      // OpenAI appears multiple times in empty state
      expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Anthropic').length).toBeGreaterThan(0);
    });
  });

  describe('configured providers', () => {
    it('should display configured provider', () => {
      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('My OpenAI')).toBeInTheDocument();
    });

    it('should show default badge on default provider', () => {
      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('Default')).toBeInTheDocument();
    });

    it('should show model name', () => {
      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('GPT-4')).toBeInTheDocument();
    });

    it('should show connection status', () => {
      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    it('should show failed status when test failed', () => {
      (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [{ ...mockSettings[0], lastTestResult: 'error' }],
        isLoading: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('Failed')).toBeInTheDocument();
    });

    it('should show "Not tested" when never tested', () => {
      (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [{ ...mockSettings[0], lastTestResult: null, lastTestedAt: null }],
        isLoading: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('Not tested')).toBeInTheDocument();
    });

    it('should show temperature value', () => {
      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('0.7')).toBeInTheDocument();
    });

    it('should show max tokens value', () => {
      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('1,000')).toBeInTheDocument();
    });
  });

  describe('unconfigured providers', () => {
    it('should show "Add Provider" section', () => {
      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('Add Provider')).toBeInTheDocument();
    });

    it('should show unconfigured providers', () => {
      renderWithQueryClient(<AiProvidersPage />);

      // Anthropic and Ollama are not configured
      expect(screen.getByText('Anthropic')).toBeInTheDocument();
      expect(screen.getByText('Ollama')).toBeInTheDocument();
    });

    it('should show "API Key" for providers requiring key', () => {
      renderWithQueryClient(<AiProvidersPage />);

      // Anthropic requires API key
      expect(screen.getAllByText('API Key').length).toBeGreaterThan(0);
    });

    it('should show "Local" for providers not requiring key', () => {
      renderWithQueryClient(<AiProvidersPage />);

      // Ollama is local
      expect(screen.getByText('Local')).toBeInTheDocument();
    });
  });

  describe('actions', () => {
    it('should have dropdown menu trigger', () => {
      renderWithQueryClient(<AiProvidersPage />);

      // Find the more button (three dots) - the button contains an svg
      // Look for buttons that contain the MoreHorizontal icon class
      const buttons = screen.getAllByRole('button');
      const moreButton = buttons.find((btn) => {
        const svg = btn.querySelector('svg');
        return svg?.classList.contains('lucide-more-horizontal');
      });
      // If exact class match doesn't work, look for buttons with an SVG and h-8 w-8 size
      const hasActionButton = buttons.some((btn) => {
        const hasIcon = btn.querySelector('svg') !== null;
        const isSmall = btn.className.includes('h-8') && btn.className.includes('w-8');
        return hasIcon && isSmall;
      });
      expect(hasActionButton || moreButton).toBeTruthy();
    });

    it('should have test button', () => {
      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('Test')).toBeInTheDocument();
    });

    it('should test provider when test button clicked', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        success: true,
        responseTime: 100,
      });
      (useTestAiProviderSetting as ReturnType<typeof vi.fn>).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      fireEvent.click(screen.getByText('Test'));

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });
    });

    it('should show success toast on successful test', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        success: true,
        responseTime: 100,
      });
      (useTestAiProviderSetting as ReturnType<typeof vi.fn>).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      fireEvent.click(screen.getByText('Test'));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Connected (100ms)');
      });
    });

    it('should show error toast on failed test', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        success: false,
        message: 'Invalid API key',
      });
      (useTestAiProviderSetting as ReturnType<typeof vi.fn>).mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      fireEvent.click(screen.getByText('Test'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid API key');
      });
    });
  });

  describe('add provider dialog', () => {
    it('should open dialog when clicking unconfigured provider', async () => {
      renderWithQueryClient(<AiProvidersPage />);

      // Click on Anthropic (unconfigured provider) - in the "Add Provider" section
      const anthropicButtons = screen.getAllByText('Anthropic');
      // Click the one in the Add Provider section (should be a button)
      const anthropicButton = anthropicButtons.find((el) =>
        el.closest('button') !== null
      );
      expect(anthropicButton).toBeDefined();
      fireEvent.click(anthropicButton!.closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('Configure Anthropic')).toBeInTheDocument();
      });
    });

    it('should open dialog when clicking provider in empty state', async () => {
      (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [],
        isLoading: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      // Click on OpenAI button in empty state
      const openaiButtons = screen.getAllByText('OpenAI');
      // Find one that's inside a button
      const openaiButton = openaiButtons.find((el) =>
        el.closest('button') !== null
      );
      expect(openaiButton).toBeDefined();
      fireEvent.click(openaiButton!.closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('Configure OpenAI')).toBeInTheDocument();
      });
    });
  });

  describe('dialog functionality', () => {
    it('should show dialog title when opened', async () => {
      renderWithQueryClient(<AiProvidersPage />);

      // Click on Anthropic (unconfigured provider)
      const anthropicButtons = screen.getAllByText('Anthropic');
      const anthropicButton = anthropicButtons.find((el) =>
        el.closest('button') !== null
      );
      fireEvent.click(anthropicButton!.closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('Configure Anthropic')).toBeInTheDocument();
      });
    });

    it('should show form fields in dialog', async () => {
      renderWithQueryClient(<AiProvidersPage />);

      // Click on Anthropic
      const anthropicButtons = screen.getAllByText('Anthropic');
      const anthropicButton = anthropicButtons.find((el) =>
        el.closest('button') !== null
      );
      fireEvent.click(anthropicButton!.closest('button')!);

      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toBeInTheDocument();
        expect(screen.getByLabelText(/API Key/)).toBeInTheDocument();
      });
    });

    it('should show Test and Save buttons in dialog', async () => {
      renderWithQueryClient(<AiProvidersPage />);

      // Click on Anthropic
      const anthropicButtons = screen.getAllByText('Anthropic');
      const anthropicButton = anthropicButtons.find((el) =>
        el.closest('button') !== null
      );
      fireEvent.click(anthropicButton!.closest('button')!);

      await waitFor(() => {
        // Dialog has Test and Save buttons
        const dialogButtons = screen.getAllByRole('button');
        expect(dialogButtons.some((btn) => btn.textContent?.includes('Test'))).toBe(true);
        expect(dialogButtons.some((btn) => btn.textContent?.includes('Save'))).toBe(true);
      });
    });
  });

  describe('provider cards', () => {
    it('should display multiple providers when configured', () => {
      (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [
          mockSettings[0],
          {
            ...mockSettings[0],
            id: 'setting-2',
            provider: 'anthropic',
            name: 'My Anthropic',
            model: 'claude-3-opus',
            isDefault: false,
          },
        ],
        isLoading: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      expect(screen.getByText('My OpenAI')).toBeInTheDocument();
      expect(screen.getByText('My Anthropic')).toBeInTheDocument();
    });

    it('should show only one default badge', () => {
      (useAiProviderSettings as ReturnType<typeof vi.fn>).mockReturnValue({
        data: [
          mockSettings[0],
          {
            ...mockSettings[0],
            id: 'setting-2',
            provider: 'anthropic',
            name: 'My Anthropic',
            model: 'claude-3-opus',
            isDefault: false,
          },
        ],
        isLoading: false,
      });

      renderWithQueryClient(<AiProvidersPage />);

      // Only one Default badge should exist
      expect(screen.getAllByText('Default').length).toBe(1);
    });
  });
});
