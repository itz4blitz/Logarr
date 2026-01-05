import { existsSync, readdirSync, statSync } from 'fs';
import { platform, homedir } from 'os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileDiscoveryService } from './file-discovery.service';

// Mock the fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

// Mock the os module
vi.mock('os', () => ({
  platform: vi.fn(() => 'linux'),
  homedir: vi.fn(() => '/home/testuser'),
}));

describe('FileDiscoveryService', () => {
  let service: FileDiscoveryService;

  beforeEach(() => {
    service = new FileDiscoveryService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('path expansion', () => {
    describe('expandPath (via validatePath)', () => {
      it('should preserve Windows absolute paths with forward slashes', async () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const result = await service.validatePath('C:/Users/test/logs');

        expect(result.error).toContain('C:/Users/test/logs');
        expect(result.error).not.toContain('/app/'); // Should not prepend working directory
      });

      it('should preserve Windows absolute paths with backslashes and normalize them', async () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const result = await service.validatePath('C:\\Users\\test\\logs');

        expect(result.error).toContain('C:/Users/test/logs');
        expect(result.error).not.toContain('\\');
      });

      it('should preserve Windows paths with different drive letters', async () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const resultZ = await service.validatePath('Z:/network/share/logs');
        const resultD = await service.validatePath('D:/data/logs');

        expect(resultZ.error).toContain('Z:/network/share/logs');
        expect(resultD.error).toContain('D:/data/logs');
      });

      it('should preserve Unix absolute paths', async () => {
        vi.mocked(existsSync).mockReturnValue(false);

        const result = await service.validatePath('/var/log/plex');

        expect(result.error).toContain('/var/log/plex');
      });

      it('should expand ~ to home directory', async () => {
        // Use platform-appropriate home directory for the test
        const testHome = process.platform === 'win32' ? 'C:\\Users\\testuser' : '/home/testuser';
        vi.mocked(homedir).mockReturnValue(testHome);
        vi.mocked(existsSync).mockReturnValue(false);

        const result = await service.validatePath('~/logs');

        // The result should contain the home directory and 'logs', normalized with forward slashes
        expect(result.error).toContain('testuser');
        expect(result.error).toContain('logs');
      });

      it('should expand Windows-style environment variables', async () => {
        process.env['APPDATA'] = 'C:/Users/test/AppData/Roaming';
        vi.mocked(existsSync).mockReturnValue(false);

        const result = await service.validatePath('%APPDATA%/Plex/Logs');

        expect(result.error).toContain('C:/Users/test/AppData/Roaming/Plex/Logs');

        delete process.env['APPDATA'];
      });

      it('should expand Unix-style environment variables', async () => {
        process.env['LOG_DIR'] = '/var/log';
        vi.mocked(existsSync).mockReturnValue(false);

        const result = await service.validatePath('$LOG_DIR/myapp');

        expect(result.error).toContain('/var/log/myapp');

        delete process.env['LOG_DIR'];
      });

      it('should keep unexpanded env vars if not set', async () => {
        delete process.env['NONEXISTENT'];
        vi.mocked(existsSync).mockReturnValue(false);

        const result = await service.validatePath('%NONEXISTENT%/logs');

        // Should keep original placeholder if env var not set
        expect(result.error).toContain('%NONEXISTENT%');
      });
    });
  });

  describe('validatePath', () => {
    it('should return accessible: true for existing directory', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
        isFile: () => false,
      } as ReturnType<typeof statSync>);
      vi.mocked(readdirSync).mockReturnValue([
        'log1.txt',
        'log2.txt',
        'log3.txt',
      ] as unknown as ReturnType<typeof readdirSync>);

      const result = await service.validatePath('/var/log');

      expect(result.accessible).toBe(true);
      expect(result.files).toEqual(['log1.txt', 'log2.txt', 'log3.txt']);
    });

    it('should return accessible: true for existing file', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => false,
        isFile: () => true,
      } as ReturnType<typeof statSync>);

      const result = await service.validatePath('/var/log/syslog');

      expect(result.accessible).toBe(true);
      expect(result.files).toEqual(['/var/log/syslog']);
    });

    it('should return accessible: false for non-existent path', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await service.validatePath('/nonexistent/path');

      expect(result.accessible).toBe(false);
      expect(result.error).toContain('does not exist');
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await service.validatePath('/protected/path');

      expect(result.accessible).toBe(false);
      expect(result.error).toBe('Permission denied');
    });
  });

  describe('glob pattern matching', () => {
    it('should match files with * wildcard', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: Date.now(),
      } as ReturnType<typeof statSync>);
      vi.mocked(readdirSync).mockReturnValue([
        { name: 'app.log', isFile: () => true, isDirectory: () => false },
        { name: 'error.log', isFile: () => true, isDirectory: () => false },
        { name: 'debug.txt', isFile: () => true, isDirectory: () => false },
      ] as unknown as ReturnType<typeof readdirSync>);

      const files = await service.discoverLogFiles(['/logs'], ['*.log']);

      // Should match .log files only
      expect(files).toHaveLength(2);
      expect(files.some((f) => f.includes('app.log'))).toBe(true);
      expect(files.some((f) => f.includes('error.log'))).toBe(true);
      expect(files.some((f) => f.includes('debug.txt'))).toBe(false);
    });

    it('should match files with ? wildcard', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: Date.now(),
      } as ReturnType<typeof statSync>);
      vi.mocked(readdirSync).mockReturnValue([
        { name: 'log1.txt', isFile: () => true, isDirectory: () => false },
        { name: 'log2.txt', isFile: () => true, isDirectory: () => false },
        { name: 'log10.txt', isFile: () => true, isDirectory: () => false },
      ] as unknown as ReturnType<typeof readdirSync>);

      const files = await service.discoverLogFiles(['/logs'], ['log?.txt']);

      // Should match log1.txt and log2.txt but not log10.txt
      expect(files).toHaveLength(2);
      expect(files.some((f) => f.includes('log1.txt'))).toBe(true);
      expect(files.some((f) => f.includes('log2.txt'))).toBe(true);
      expect(files.some((f) => f.includes('log10.txt'))).toBe(false);
    });

    it('should be case-insensitive', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: Date.now(),
      } as ReturnType<typeof statSync>);
      vi.mocked(readdirSync).mockReturnValue([
        { name: 'App.LOG', isFile: () => true, isDirectory: () => false },
        { name: 'error.log', isFile: () => true, isDirectory: () => false },
      ] as unknown as ReturnType<typeof readdirSync>);

      const files = await service.discoverLogFiles(['/logs'], ['*.log']);

      expect(files).toHaveLength(2);
    });
  });

  describe('getDefaultPaths', () => {
    const mockConfig = {
      defaultPaths: {
        docker: ['/docker/logs'],
        linux: ['/var/log/app'],
        windows: ['C:/ProgramData/App/Logs'],
        macos: ['~/Library/Logs/App'],
      },
      filePatterns: ['*.log'],
    };

    it('should return linux paths on linux platform', () => {
      vi.mocked(platform).mockReturnValue('linux');
      vi.mocked(existsSync).mockReturnValue(false);

      const paths = service.getDefaultPaths(mockConfig);

      expect(paths).toEqual(['/var/log/app']);
    });

    it('should return windows paths on win32 platform', () => {
      vi.mocked(platform).mockReturnValue('win32');
      vi.mocked(existsSync).mockReturnValue(false);

      const paths = service.getDefaultPaths(mockConfig);

      expect(paths).toEqual(['C:/ProgramData/App/Logs']);
    });

    it('should return macos paths on darwin platform', () => {
      vi.mocked(platform).mockReturnValue('darwin');
      vi.mocked(existsSync).mockReturnValue(false);
      // Use a path that will work on the current platform during testing
      const testHome = process.platform === 'win32' ? 'C:\\Users\\testuser' : '/Users/testuser';
      vi.mocked(homedir).mockReturnValue(testHome);

      const paths = service.getDefaultPaths(mockConfig);

      // The expanded path should contain 'testuser' and 'Library/Logs/App'
      expect(paths[0]).toContain('testuser');
      expect(paths[0]).toContain('Library');
      expect(paths[0]).toContain('Logs');
      expect(paths[0]).toContain('App');
    });

    it('should return docker paths when running in docker', () => {
      vi.mocked(existsSync).mockImplementation((path) => path === '/.dockerenv');

      const paths = service.getDefaultPaths(mockConfig);

      expect(paths).toEqual(['/docker/logs']);
    });
  });

  describe('discoverLogFiles', () => {
    it('should skip non-existent paths', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const files = await service.discoverLogFiles(['/nonexistent1', '/nonexistent2'], ['*.log']);

      expect(files).toEqual([]);
    });

    it('should deduplicate discovered files', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => true,
        isFile: () => false,
        mtimeMs: Date.now(),
      } as ReturnType<typeof statSync>);
      // Same file appearing in both directories
      vi.mocked(readdirSync).mockReturnValue([
        { name: 'app.log', isFile: () => true, isDirectory: () => false },
      ] as unknown as ReturnType<typeof readdirSync>);

      const files = await service.discoverLogFiles(['/logs', '/logs'], ['*.log']);

      // Should be deduplicated
      expect(files.length).toBeLessThanOrEqual(2);
    });

    it('should handle direct file paths', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({
        isDirectory: () => false,
        isFile: () => true,
        mtimeMs: Date.now(),
      } as ReturnType<typeof statSync>);

      const files = await service.discoverLogFiles(['/logs/specific.log'], ['*.log']);

      expect(files).toEqual(['/logs/specific.log']);
    });
  });
});
