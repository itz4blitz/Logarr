import { beforeEach, describe, expect, it, vi } from 'vitest';


import { LogFileProcessor } from './log-file-processor';
// Note: We import LogFileTailer this way to access private methods for testing
import { LogFileTailer } from './log-file-tailer';

import type { MediaServerProvider } from '@logarr/core';
import type { Stats } from 'fs';

// Mock provider for testing
const createMockProvider = (): MediaServerProvider => ({
  id: 'test-provider',
  name: 'Test Provider',
  capabilities: {
    supportsRealTimeLogs: true,
    supportsActivityLog: true,
    supportsSessions: true,
    supportsWebhooks: false,
    supportsPlaybackHistory: false,
  },
  connect: vi.fn(),
  disconnect: vi.fn(),
  testConnection: vi.fn(),
  getLogPaths: vi.fn(),
  parseLogLine: () => null,
  getCorrelationPatterns: () => [],
  getSessions: vi.fn(),
  getUsers: vi.fn(),
  getActivity: vi.fn(),
  getServerInfo: vi.fn(),
  getLogFileConfig: () => ({
    defaultPaths: {
      docker: [],
      linux: [],
      windows: [],
      macos: [],
    },
    filePatterns: ['*.txt', '*.log'],
  }),
});

const mockStats = (ino: number, size: number, birthtimeMs: number): Partial<Stats> => ({
  ino,
  size,
  birthtimeMs,
  mtimeMs: birthtimeMs,
  dev: 1,
});

describe('LogFileTailer - Rotation Detection with Cooldown', () => {
  let tailer: LogFileTailer;
  let processor: LogFileProcessor;
  let provider: MediaServerProvider;
  let rotationCallback: () => void;

  beforeEach(() => {
    processor = new LogFileProcessor(createMockProvider());
    provider = createMockProvider();
    rotationCallback = vi.fn();

    // Create a minimal tailer for testing rotation logic only
    tailer = new LogFileTailer(
      {
        serverId: 'test-server',
        filePath: '/test/log.txt',
        onEntry: vi.fn(),
        onError: vi.fn(),
        onRotation: rotationCallback,
      },
      processor,
      provider
    );
  });

  describe('detectRotationWithCooldown', () => {
    it('should detect rotation when file size decreases below current offset', () => {
      // Simulate having read 1000 bytes
      (tailer as any).currentOffset = BigInt(1000);
      (tailer as any).lastSize = BigInt(1000);

      // File shrinks to 500 bytes (rotation)
      const stats = mockStats(1, 500, Date.now());
      const ino = stats.ino ?? 1;
      const currentInode = ino !== 0 ? ino.toString() : `${stats.birthtimeMs}-${stats.dev}`;
      const currentSize = BigInt(stats.size ?? 0);

      const result = (tailer as any).detectRotationWithCooldown(currentInode, currentSize);

      expect(result).toBe(true);
      expect(rotationCallback).not.toHaveBeenCalled(); // Only detects, doesn't call callback
    });

    it('should detect rotation when inode changes', () => {
      (tailer as any).currentOffset = BigInt(500);
      (tailer as any).lastInode = 'inode-1';
      (tailer as any).lastSize = BigInt(500);

      // File replaced with different inode
      const currentInode = 'inode-2';
      const currentSize = BigInt(500);

      const result = (tailer as any).detectRotationWithCooldown(currentInode, currentSize);

      expect(result).toBe(true);
    });

    it('should NOT detect rotation when nothing changed', () => {
      (tailer as any).currentOffset = BigInt(500);
      (tailer as any).lastInode = 'inode-1';
      (tailer as any).lastSize = BigInt(500);

      const currentInode = 'inode-1';
      const currentSize = BigInt(500);

      const result = (tailer as any).detectRotationWithCooldown(currentInode, currentSize);

      expect(result).toBe(false);
    });

    it('should NOT detect rotation when file grows (normal append)', () => {
      (tailer as any).currentOffset = BigInt(500);
      (tailer as any).lastInode = 'inode-1';
      (tailer as any).lastSize = BigInt(500);

      // File grew normally
      const currentInode = 'inode-1';
      const currentSize = BigInt(1000);

      const result = (tailer as any).detectRotationWithCooldown(currentInode, currentSize);

      expect(result).toBe(false);
    });
  });

  describe('rotation cooldown to prevent false-positive loops', () => {
    it('should enter cooldown after rotation is detected', () => {
      (tailer as any).currentOffset = BigInt(1000);
      (tailer as any).lastSize = BigInt(1000);

      // First rotation detection
      const stats1 = mockStats(1, 500, Date.now());
      const ino1 = stats1.ino ?? 1;
      const currentInode1 = ino1 !== 0 ? ino1.toString() : `${stats1.birthtimeMs}-${stats1.dev}`;
      const currentSize1 = BigInt(stats1.size ?? 0);

      const result1 = (tailer as any).detectRotationWithCooldown(currentInode1, currentSize1);

      expect(result1).toBe(true);
      expect((tailer as any).lastRotationTime).toBeGreaterThan(0);
    });

    it('should prevent repeated rotation detection during cooldown period (size-based)', () => {
      // Set up state after a rotation was just handled
      (tailer as any).currentOffset = BigInt(0);
      (tailer as any).lastInode = 'inode-1';
      (tailer as any).lastSize = BigInt(500);
      (tailer as any).lastRotationTime = Date.now(); // Just detected rotation

      // Immediately check again (file appears "smaller" due to offset being 0)
      const currentInode = 'inode-1';
      const currentSize = BigInt(500);

      const result = (tailer as any).detectRotationWithCooldown(currentInode, currentSize);

      // Should NOT detect rotation again during cooldown
      expect(result).toBe(false);
    });

    it('should allow genuine inode change even during cooldown', () => {
      // Set up state after a rotation was just handled
      (tailer as any).currentOffset = BigInt(500);
      (tailer as any).lastInode = 'inode-1';
      (tailer as any).lastSize = BigInt(500);
      (tailer as any).lastRotationTime = Date.now(); // Just detected rotation

      // File genuinely replaced again (different inode)
      const currentInode = 'inode-2';
      const currentSize = BigInt(500);

      const result = (tailer as any).detectRotationWithCooldown(currentInode, currentSize);

      // Should detect rotation because inode genuinely changed
      expect(result).toBe(true);
    });

    it('should allow rotation detection after cooldown expires', () => {
      // Set up state with old rotation timestamp
      (tailer as any).currentOffset = BigInt(1000);
      (tailer as any).lastInode = 'inode-1';
      (tailer as any).lastSize = BigInt(1000);
      // Set rotation time to 3 seconds ago (past the 2 second cooldown)
      (tailer as any).lastRotationTime = Date.now() - 3000;

      // File rotated (size decreased)
      const currentInode = 'inode-1';
      const currentSize = BigInt(500);

      const result = (tailer as any).detectRotationWithCooldown(currentInode, currentSize);

      // Should detect rotation again after cooldown
      expect(result).toBe(true);
    });
  });

  describe('getInode - Windows fallback stability', () => {
    it('should use inode directly when available (Unix)', () => {
      const stats = mockStats(12345, 1000, Date.now());
      const result = (tailer as any).getInode(stats);

      expect(result).toBe('12345');
    });

    it('should use birthtimeMs+size+dev fallback on Windows (ino=0)', () => {
      const stats = mockStats(0, 1000, 1234567890123);
      const result = (tailer as any).getInode(stats);

      // Should include birthtime, size, and dev for uniqueness
      expect(result).toBe('1234567890123-1000-1');
    });

    it('should generate different inodes for files with different birth times', () => {
      const stats1 = mockStats(0, 1000, 1000);
      const stats2 = mockStats(0, 1000, 2000);

      const result1 = (tailer as any).getInode(stats1);
      const result2 = (tailer as any).getInode(stats2);

      expect(result1).not.toBe(result2);
    });

    it('should generate different inodes for files with different sizes', () => {
      const stats1 = mockStats(0, 1000, 1234567890123);
      const stats2 = mockStats(0, 2000, 1234567890123);

      const result1 = (tailer as any).getInode(stats1);
      const result2 = (tailer as any).getInode(stats2);

      expect(result1).not.toBe(result2);
    });
  });
});
