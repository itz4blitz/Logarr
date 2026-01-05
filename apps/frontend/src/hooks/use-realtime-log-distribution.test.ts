import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeLogDistribution } from './use-realtime-log-distribution';

// Mock socket.io-client
const mockOn = vi.fn();
const mockEmit = vi.fn();
const mockDisconnect = vi.fn();
const mockSocket = {
  on: mockOn,
  emit: mockEmit,
  disconnect: mockDisconnect,
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock config
vi.mock('@/lib/config', () => ({
  config: {
    wsUrl: 'http://localhost:4002',
  },
}));

describe('useRealtimeLogDistribution', () => {
  let handlers: Record<string, (data?: unknown) => void> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};

    // Capture event handlers
    mockOn.mockImplementation((event: string, handler: (data?: unknown) => void) => {
      handlers[event] = handler;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const initialData = {
    error: 10,
    warn: 20,
    info: 100,
    debug: 50,
    total: 180,
    topSources: [
      { source: 'plex', count: 80, errorCount: 5 },
      { source: 'jellyfin', count: 100, errorCount: 5 },
    ],
  };

  it('should return initial data when no socket events', () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    expect(result.current.data).toEqual(initialData);
    expect(result.current.deltas).toEqual({
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      total: 0,
    });
  });

  it('should subscribe to logs on connect', async () => {
    renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    // Simulate connect event
    act(() => {
      handlers['connect']?.();
    });

    expect(mockEmit).toHaveBeenCalledWith('subscribe', {});
  });

  it('should increment error count when error log received', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    // Simulate receiving an error log
    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'error',
        message: 'Test error',
        source: 'plex',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.data?.error).toBe(11);
    expect(result.current.data?.total).toBe(181);
    expect(result.current.deltas.error).toBe(1);
  });

  it('should increment warn count when warning log received', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'warn',
        message: 'Test warning',
        source: 'plex',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.data?.warn).toBe(21);
    expect(result.current.deltas.warn).toBe(1);
  });

  it('should map warning level to warn', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'warning',
        message: 'Test warning',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.data?.warn).toBe(21);
  });

  it('should map fatal level to error', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'fatal',
        message: 'Test fatal',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.data?.error).toBe(11);
  });

  it('should map trace level to debug', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'trace',
        message: 'Test trace',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.data?.debug).toBe(51);
  });

  it('should map unknown levels to debug', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'verbose',
        message: 'Test verbose',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.data?.debug).toBe(51);
  });

  it('should update source counts when log with source received', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'info',
        message: 'Test info',
        source: 'plex',
        timestamp: new Date().toISOString(),
      });
    });

    const plexSource = result.current.data?.topSources.find((s) => s.source === 'plex');
    expect(plexSource?.count).toBe(81);
  });

  it('should update source error count when error log received', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'error',
        message: 'Test error',
        source: 'plex',
        timestamp: new Date().toISOString(),
      });
    });

    const plexSource = result.current.data?.topSources.find((s) => s.source === 'plex');
    expect(plexSource?.errorCount).toBe(6);
  });

  it('should reset deltas when initialData changes', async () => {
    const { result, rerender } = renderHook(
      ({ data }) => useRealtimeLogDistribution({ initialData: data, enabled: true }),
      { initialProps: { data: initialData } }
    );

    // Receive a log
    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'error',
        message: 'Test error',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.deltas.error).toBe(1);

    // New initialData arrives (simulating poll)
    const newInitialData = { ...initialData, total: 185, error: 12 };
    rerender({ data: newInitialData });

    expect(result.current.deltas).toEqual({
      error: 0,
      warn: 0,
      info: 0,
      debug: 0,
      total: 0,
    });
  });

  it('should not connect when disabled', () => {
    renderHook(() => useRealtimeLogDistribution({ initialData, enabled: false }));

    // Should not have set up any handlers (disconnect any existing)
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('should disconnect when unmounted', () => {
    const { unmount } = renderHook(() =>
      useRealtimeLogDistribution({ initialData, enabled: true })
    );

    unmount();

    expect(mockEmit).toHaveBeenCalledWith('unsubscribe');
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('should return undefined data when initialData is undefined', () => {
    const { result } = renderHook(() =>
      useRealtimeLogDistribution({ initialData: undefined, enabled: true })
    );

    expect(result.current.data).toBeUndefined();
  });

  it('should handle multiple logs correctly', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'error',
        message: 'Error 1',
        timestamp: new Date().toISOString(),
      });
      handlers['log']?.({
        id: '2',
        level: 'error',
        message: 'Error 2',
        timestamp: new Date().toISOString(),
      });
      handlers['log']?.({
        id: '3',
        level: 'warn',
        message: 'Warn 1',
        timestamp: new Date().toISOString(),
      });
      handlers['log']?.({
        id: '4',
        level: 'info',
        message: 'Info 1',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.data?.error).toBe(12);
    expect(result.current.data?.warn).toBe(21);
    expect(result.current.data?.info).toBe(101);
    expect(result.current.data?.total).toBe(184);
  });

  it('should handle case-insensitive log levels', async () => {
    const { result } = renderHook(() => useRealtimeLogDistribution({ initialData, enabled: true }));

    act(() => {
      handlers['log']?.({
        id: '1',
        level: 'ERROR',
        message: 'Error',
        timestamp: new Date().toISOString(),
      });
      handlers['log']?.({
        id: '2',
        level: 'WARN',
        message: 'Warn',
        timestamp: new Date().toISOString(),
      });
      handlers['log']?.({
        id: '3',
        level: 'INFO',
        message: 'Info',
        timestamp: new Date().toISOString(),
      });
    });

    expect(result.current.data?.error).toBe(11);
    expect(result.current.data?.warn).toBe(21);
    expect(result.current.data?.info).toBe(101);
  });
});
