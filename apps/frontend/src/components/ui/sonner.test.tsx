import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { Toaster } from './sonner';
import { toast } from 'sonner';

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'dark',
    setTheme: vi.fn(),
  }),
}));

describe('Toaster', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    // Dismiss all toasts after each test
    toast.dismiss();
  });

  it('should render without errors', () => {
    // Toaster component should render without throwing
    expect(() => render(<Toaster />)).not.toThrow();
  });

  it('should show toaster when a toast is triggered', async () => {
    render(<Toaster />);

    act(() => {
      toast('Test message');
    });

    // After triggering a toast, the toaster should be visible
    await waitFor(() => {
      const toaster = document.querySelector('[data-sonner-toaster]');
      expect(toaster).toBeInTheDocument();
    });
  });

  it('should display success toast', async () => {
    render(<Toaster />);

    act(() => {
      toast.success('Success message');
    });

    await waitFor(() => {
      expect(screen.getByText('Success message')).toBeInTheDocument();
    });
  });

  it('should display error toast', async () => {
    render(<Toaster />);

    act(() => {
      toast.error('Error message');
    });

    await waitFor(() => {
      expect(screen.getByText('Error message')).toBeInTheDocument();
    });
  });

  it('should display warning toast', async () => {
    render(<Toaster />);

    act(() => {
      toast.warning('Warning message');
    });

    await waitFor(() => {
      expect(screen.getByText('Warning message')).toBeInTheDocument();
    });
  });

  it('should display info toast', async () => {
    render(<Toaster />);

    act(() => {
      toast.info('Info message');
    });

    await waitFor(() => {
      expect(screen.getByText('Info message')).toBeInTheDocument();
    });
  });

  it('should display loading toast', async () => {
    render(<Toaster />);

    act(() => {
      toast.loading('Loading message');
    });

    await waitFor(() => {
      expect(screen.getByText('Loading message')).toBeInTheDocument();
    });
  });

  it('should display toast with description', async () => {
    render(<Toaster />);

    act(() => {
      toast('Toast title', {
        description: 'Toast description',
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Toast title')).toBeInTheDocument();
      expect(screen.getByText('Toast description')).toBeInTheDocument();
    });
  });

  it('should dismiss toast when dismissed programmatically', async () => {
    render(<Toaster />);

    let toastId: string | number;
    act(() => {
      toastId = toast('Dismissible toast');
    });

    await waitFor(() => {
      expect(screen.getByText('Dismissible toast')).toBeInTheDocument();
    });

    act(() => {
      toast.dismiss(toastId);
    });

    // Wait for animation to complete
    act(() => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(screen.queryByText('Dismissible toast')).not.toBeInTheDocument();
    });
  });
});
