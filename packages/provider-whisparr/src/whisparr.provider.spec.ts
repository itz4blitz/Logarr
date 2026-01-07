/**
 * Tests for Whisparr provider
 */

import { WHISPARR_LOG_FILE_CONFIG } from '@logarr/provider-arr';
import { describe, it, expect, beforeEach } from 'vitest';

import { WhisparrProvider } from './whisparr.provider.js';
import { WhisparrEventTypes, WhisparrEventTypeNames } from './whisparr.types.js';

describe('WhisparrProvider', () => {
  let provider: WhisparrProvider;

  beforeEach(() => {
    provider = new WhisparrProvider();
  });

  describe('provider identity', () => {
    it('should have correct id', () => {
      expect(provider.id).toBe('whisparr');
    });

    it('should have correct name', () => {
      expect(provider.name).toBe('Whisparr');
    });
  });

  describe('capabilities', () => {
    it('should have correct capabilities', () => {
      // Capabilities from ArrBaseProvider
      expect(provider.capabilities).toEqual({
        supportsRealTimeLogs: false, // *arr apps don't support real-time log tailing
        supportsActivityLog: true, // They have history API
        supportsSessions: false, // They don't have playback sessions
        supportsWebhooks: true, // They support outbound webhooks
        supportsPlaybackHistory: false, // Not media players
      });
    });

    it('should support activity log', () => {
      expect(provider.capabilities.supportsActivityLog).toBe(true);
    });

    it('should not support sessions', () => {
      expect(provider.capabilities.supportsSessions).toBe(false);
    });

    it('should support webhooks', () => {
      expect(provider.capabilities.supportsWebhooks).toBe(true);
    });
  });

  describe('getLogPaths', () => {
    it('should return default log paths when no config', async () => {
      const paths = await provider.getLogPaths();

      expect(paths).toContain('/whisparr-logs');
      expect(paths).toContain('/config/logs');
      expect(paths).toContain('~/.config/Whisparr/logs');
      expect(paths).toContain('/var/lib/whisparr/logs');
      expect(paths).toContain('C:\\ProgramData\\Whisparr\\logs');
    });
  });

  describe('getLogFileConfig', () => {
    it('should return Whisparr log file config', () => {
      const config = provider.getLogFileConfig();

      expect(config).toBe(WHISPARR_LOG_FILE_CONFIG);
    });
  });
});

describe('WhisparrEventTypes', () => {
  it('should have correct event type values', () => {
    expect(WhisparrEventTypes.Unknown).toBe(0);
    expect(WhisparrEventTypes.Grabbed).toBe(1);
    expect(WhisparrEventTypes.SeriesFolderImported).toBe(2);
    expect(WhisparrEventTypes.DownloadFolderImported).toBe(3);
    expect(WhisparrEventTypes.DownloadFailed).toBe(4);
    expect(WhisparrEventTypes.EpisodeFileDeleted).toBe(5);
    expect(WhisparrEventTypes.EpisodeFileRenamed).toBe(6);
    expect(WhisparrEventTypes.ImportFailed).toBe(7);
  });

  it('should have matching event type names', () => {
    expect(WhisparrEventTypeNames[WhisparrEventTypes.Unknown]).toBe('unknown');
    expect(WhisparrEventTypeNames[WhisparrEventTypes.Grabbed]).toBe('grabbed');
    expect(WhisparrEventTypeNames[WhisparrEventTypes.SeriesFolderImported]).toBe(
      'seriesFolderImported'
    );
    expect(WhisparrEventTypeNames[WhisparrEventTypes.DownloadFolderImported]).toBe(
      'downloadFolderImported'
    );
    expect(WhisparrEventTypeNames[WhisparrEventTypes.DownloadFailed]).toBe('downloadFailed');
    expect(WhisparrEventTypeNames[WhisparrEventTypes.EpisodeFileDeleted]).toBe(
      'episodeFileDeleted'
    );
    expect(WhisparrEventTypeNames[WhisparrEventTypes.EpisodeFileRenamed]).toBe(
      'episodeFileRenamed'
    );
    expect(WhisparrEventTypeNames[WhisparrEventTypes.ImportFailed]).toBe('importFailed');
  });
});

describe('WHISPARR_LOG_FILE_CONFIG', () => {
  it('should have valid default paths', () => {
    expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
    expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.linux.length).toBeGreaterThan(0);
    expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.windows.length).toBeGreaterThan(0);
    expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.macos.length).toBeGreaterThan(0);
  });

  it('should have file patterns', () => {
    expect(WHISPARR_LOG_FILE_CONFIG.filePatterns).toContain('whisparr.txt');
    expect(WHISPARR_LOG_FILE_CONFIG.filePatterns).toContain('whisparr.*.txt');
    expect(WHISPARR_LOG_FILE_CONFIG.filePatterns).toContain('*.log');
  });

  it('should have encoding set to utf-8', () => {
    expect(WHISPARR_LOG_FILE_CONFIG.encoding).toBe('utf-8');
  });

  it('should have daily rotation enabled', () => {
    expect(WHISPARR_LOG_FILE_CONFIG.rotatesDaily).toBe(true);
  });

  it('should have date pattern for log rotation', () => {
    expect(WHISPARR_LOG_FILE_CONFIG.datePattern).toBeDefined();
    // Test the pattern matches expected filename format
    const pattern = WHISPARR_LOG_FILE_CONFIG.datePattern;
    expect('whisparr.2024-01-15.txt').toMatch(pattern!);
  });
});
