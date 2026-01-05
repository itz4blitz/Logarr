import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSmoothProgress, formatTicksDuration } from './use-smooth-progress';

describe('useSmoothProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return initial position from server', () => {
    const { result } = renderHook(() =>
      useSmoothProgress({
        positionTicks: '100000000', // 10 seconds
        runTimeTicks: '1000000000', // 100 seconds
        isPaused: false,
        isPlaying: true,
      })
    );

    expect(result.current.smoothPositionTicks).toBe('100000000');
    expect(result.current.smoothProgress).toBe(10);
  });

  it('should interpolate position when playing', () => {
    const { result } = renderHook(() =>
      useSmoothProgress({
        positionTicks: '0',
        runTimeTicks: '10000000000', // 1000 seconds
        isPaused: false,
        isPlaying: true,
      })
    );

    // Initial position
    expect(result.current.smoothPositionTicks).toBe('0');

    // Advance timer by 100ms (interpolation interval)
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Position should have increased by 100ms worth of ticks (1,000,000)
    expect(parseInt(result.current.smoothPositionTicks!)).toBe(1000000);
  });

  it('should not interpolate when paused', () => {
    const { result } = renderHook(() =>
      useSmoothProgress({
        positionTicks: '100000000',
        runTimeTicks: '1000000000',
        isPaused: true,
        isPlaying: true,
      })
    );

    const initialPosition = result.current.smoothPositionTicks;

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Position should not change when paused
    expect(result.current.smoothPositionTicks).toBe(initialPosition);
  });

  it('should not interpolate when not playing', () => {
    const { result } = renderHook(() =>
      useSmoothProgress({
        positionTicks: '100000000',
        runTimeTicks: '1000000000',
        isPaused: false,
        isPlaying: false,
      })
    );

    const initialPosition = result.current.smoothPositionTicks;

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.smoothPositionTicks).toBe(initialPosition);
  });

  it('should sync to new server position when it changes', () => {
    const { result, rerender } = renderHook(
      (props) => useSmoothProgress(props),
      {
        initialProps: {
          positionTicks: '100000000',
          runTimeTicks: '1000000000',
          isPaused: false,
          isPlaying: true,
        },
      }
    );

    // Advance to interpolate
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Position should have increased
    expect(parseInt(result.current.smoothPositionTicks!)).toBeGreaterThan(100000000);

    // Server sends new position
    rerender({
      positionTicks: '500000000', // Jump to 50 seconds
      runTimeTicks: '1000000000',
      isPaused: false,
      isPlaying: true,
    });

    // Should snap to new server position
    expect(result.current.smoothPositionTicks).toBe('500000000');
    expect(result.current.smoothProgress).toBe(50);
  });

  it('should not exceed duration', () => {
    const { result } = renderHook(() =>
      useSmoothProgress({
        positionTicks: '990000000', // 99 seconds
        runTimeTicks: '1000000000', // 100 seconds
        isPaused: false,
        isPlaying: true,
      })
    );

    // Advance past duration
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should be capped at duration
    expect(parseInt(result.current.smoothPositionTicks!)).toBeLessThanOrEqual(1000000000);
    expect(result.current.smoothProgress).toBeLessThanOrEqual(100);
  });

  it('should handle null position', () => {
    const { result } = renderHook(() =>
      useSmoothProgress({
        positionTicks: null,
        runTimeTicks: '1000000000',
        isPaused: false,
        isPlaying: true,
      })
    );

    expect(result.current.smoothPositionTicks).toBe('0');
    expect(result.current.smoothProgress).toBe(0);
  });

  it('should handle null runtime', () => {
    const { result } = renderHook(() =>
      useSmoothProgress({
        positionTicks: '100000000',
        runTimeTicks: null,
        isPaused: false,
        isPlaying: true,
      })
    );

    expect(result.current.smoothProgress).toBe(0);
  });

  it('should track lastServerUpdate timestamp', () => {
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));

    const { result } = renderHook(() =>
      useSmoothProgress({
        positionTicks: '100000000',
        runTimeTicks: '1000000000',
        isPaused: false,
        isPlaying: true,
      })
    );

    expect(result.current.lastServerUpdate).toBe(new Date('2024-01-01T12:00:00Z').getTime());
  });
});

describe('formatTicksDuration', () => {
  it('should format null as --:--', () => {
    expect(formatTicksDuration(null)).toBe('--:--');
  });

  it('should format seconds only', () => {
    expect(formatTicksDuration('450000000')).toBe('0:45');
  });

  it('should format minutes and seconds', () => {
    expect(formatTicksDuration('3050000000')).toBe('5:05');
  });

  it('should format hours, minutes and seconds', () => {
    expect(formatTicksDuration('36300000000')).toBe('1:00:30');
  });

  it('should handle zero', () => {
    expect(formatTicksDuration('0')).toBe('0:00');
  });

  it('should pad minutes and seconds in hour format', () => {
    expect(formatTicksDuration('36050000000')).toBe('1:00:05');
  });
});
