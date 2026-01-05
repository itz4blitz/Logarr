import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { platform, homedir } from 'os';
import { join, resolve } from 'path';

import { Injectable, Logger } from '@nestjs/common';

// Local interface until core package is rebuilt
interface LogFileConfig {
  defaultPaths: {
    docker: readonly string[];
    linux: readonly string[];
    windows: readonly string[];
    macos: readonly string[];
  };
  filePatterns: readonly string[];
  encoding?: string;
  rotatesDaily?: boolean;
  datePattern?: RegExp;
}

/**
 * FileDiscoveryService - Discovers log files from configured paths
 *
 * Features:
 * - Platform-specific default path resolution
 * - Glob pattern matching for file discovery
 * - Directory traversal with pattern matching
 */
@Injectable()
export class FileDiscoveryService {
  private readonly logger = new Logger(FileDiscoveryService.name);

  /**
   * Get default log paths based on current platform
   */
  getDefaultPaths(config: LogFileConfig): string[] {
    const currentPlatform = this.getCurrentPlatform();

    switch (currentPlatform) {
      case 'docker':
        return [...config.defaultPaths.docker];
      case 'linux':
        return this.expandPaths([...config.defaultPaths.linux]);
      case 'windows':
        return this.expandPaths([...config.defaultPaths.windows]);
      case 'macos':
        return this.expandPaths([...config.defaultPaths.macos]);
      default:
        // Try all paths
        return this.expandPaths([
          ...config.defaultPaths.docker,
          ...config.defaultPaths.linux,
          ...config.defaultPaths.windows,
          ...config.defaultPaths.macos,
        ]);
    }
  }

  /**
   * Discover log files in the given paths matching the patterns
   */
  async discoverLogFiles(paths: string[], patterns: string[]): Promise<string[]> {
    const discoveredFiles: string[] = [];

    for (const basePath of paths) {
      const expandedPath = this.expandPath(basePath);

      if (!existsSync(expandedPath)) {
        this.logger.debug(`Path does not exist: ${expandedPath}`);
        continue;
      }

      try {
        const stats = statSync(expandedPath);

        if (stats.isDirectory()) {
          // Discover files in directory
          const files = await this.discoverFilesInDirectory(expandedPath, patterns);
          discoveredFiles.push(...files);
        } else if (stats.isFile()) {
          // Direct file path
          if (this.matchesPatterns(expandedPath, patterns)) {
            discoveredFiles.push(expandedPath);
          }
        }
      } catch (error) {
        this.logger.warn(`Error accessing path ${expandedPath}:`, error);
      }
    }

    // Sort by modification time (newest first) and deduplicate
    const uniqueFiles = [...new Set(discoveredFiles)];
    return this.sortByModificationTime(uniqueFiles);
  }

  /**
   * Discover files in a directory matching patterns
   */
  private async discoverFilesInDirectory(dirPath: string, patterns: string[]): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);

        if (entry.isFile()) {
          if (this.matchesPatterns(entry.name, patterns)) {
            files.push(fullPath);
          }
        } else if (entry.isDirectory()) {
          // Optionally recurse into subdirectories
          // For now, only check immediate children
        }
      }
    } catch (error) {
      this.logger.warn(`Error reading directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * Check if a filename matches any of the patterns
   */
  private matchesPatterns(filename: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (this.matchGlobPattern(filename, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Simple glob pattern matching
   * Supports: * (any chars), ? (single char)
   */
  private matchGlobPattern(filename: string, pattern: string): boolean {
    // Convert glob to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*') // * matches any chars
      .replace(/\?/g, '.'); // ? matches single char

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(filename);
  }

  /**
   * Expand paths with home directory and environment variables
   */
  private expandPaths(paths: string[]): string[] {
    return paths.map((p) => this.expandPath(p));
  }

  /**
   * Expand a single path
   */
  private expandPath(inputPath: string): string {
    let path = inputPath;

    // Expand ~ to home directory
    if (path.startsWith('~')) {
      path = join(homedir(), path.slice(1));
    }

    // Expand environment variables (basic support)
    path = path.replace(/%(\w+)%/g, (_, name) => process.env[name] ?? _);
    path = path.replace(/\$(\w+)/g, (_, name) => process.env[name] ?? _);

    // Check if this is already an absolute path
    // Windows: starts with drive letter (e.g., C:/, D:\, Z:/)
    // Unix: starts with /
    const isWindowsAbsolute = /^[A-Za-z]:[\\/]/.test(path);
    const isUnixAbsolute = path.startsWith('/');

    if (isWindowsAbsolute || isUnixAbsolute) {
      // Already absolute, just normalize separators for Windows paths
      return path.replace(/\\/g, '/');
    }

    return resolve(path);
  }

  /**
   * Get current platform type
   */
  private getCurrentPlatform(): 'docker' | 'linux' | 'windows' | 'macos' {
    // Check if running in Docker
    if (this.isRunningInDocker()) {
      return 'docker';
    }

    const os = platform();
    switch (os) {
      case 'linux':
        return 'linux';
      case 'win32':
        return 'windows';
      case 'darwin':
        return 'macos';
      default:
        return 'linux'; // Default to Linux
    }
  }

  /**
   * Check if running inside Docker container
   */
  private isRunningInDocker(): boolean {
    // Check for .dockerenv file
    if (existsSync('/.dockerenv')) {
      return true;
    }

    // Check cgroup (Linux)
    try {
      if (existsSync('/proc/1/cgroup')) {
        const cgroup = readFileSync('/proc/1/cgroup', 'utf8');
        if (cgroup.includes('docker') || cgroup.includes('kubepods')) {
          return true;
        }
      }
    } catch {
      // Ignore errors
    }

    return false;
  }

  /**
   * Sort files by modification time (newest first)
   */
  private sortByModificationTime(files: string[]): string[] {
    return files.sort((a, b) => {
      try {
        const statsA = statSync(a);
        const statsB = statSync(b);
        return statsB.mtimeMs - statsA.mtimeMs;
      } catch {
        return 0;
      }
    });
  }

  /**
   * Validate that a path is accessible
   */
  async validatePath(inputPath: string): Promise<{
    accessible: boolean;
    error?: string;
    files?: string[];
  }> {
    const expandedPath = this.expandPath(inputPath);
    this.logger.debug(`Validating path: input="${inputPath}", expanded="${expandedPath}"`);

    try {
      const exists = existsSync(expandedPath);
      this.logger.debug(`Path exists check: ${exists}`);

      if (!exists) {
        this.logger.warn(`Path validation failed: "${expandedPath}" does not exist`);
        return {
          accessible: false,
          error: `Path does not exist: ${expandedPath}`,
        };
      }

      const stats = statSync(expandedPath);

      if (stats.isDirectory()) {
        const entries = readdirSync(expandedPath);
        return {
          accessible: true,
          files: entries.slice(0, 10), // Return first 10 files as sample
        };
      } else if (stats.isFile()) {
        return {
          accessible: true,
          files: [expandedPath],
        };
      } else {
        return {
          accessible: false,
          error: 'Path is neither a file nor a directory',
        };
      }
    } catch (error) {
      return {
        accessible: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
