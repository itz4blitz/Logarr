/**
 * Tests for *arr application log parser
 */

import { describe, it, expect } from 'vitest';

import {
  parseArrLogLine,
  isArrLogContinuation,
  parseArrLogLineWithContext,
  finalizeArrLogEntry,
  extractArrMetadata,
  getArrSeverityBoost,
  ARR_LOG_FILE_CONFIG,
  SONARR_LOG_FILE_CONFIG,
  RADARR_LOG_FILE_CONFIG,
  LIDARR_LOG_FILE_CONFIG,
  READARR_LOG_FILE_CONFIG,
  PROWLARR_LOG_FILE_CONFIG,
  WHISPARR_LOG_FILE_CONFIG,
} from './arr.parser.js';

describe('Arr Parser', () => {
  describe('parseArrLogLine', () => {
    it('should parse a standard NLog format line', () => {
      const line = '2024-01-15 10:30:45.123|Info|HttpServer|HTTP Request completed';
      const result = parseArrLogLine(line);

      expect(result).not.toBeNull();
      expect(result?.level).toBe('info');
      expect(result?.source).toBe('HttpServer');
      expect(result?.message).toBe('HTTP Request completed');
      expect(result?.timestamp.toISOString()).toContain('2024-01-15');
    });

    it('should parse a debug log line', () => {
      const line = '2024-01-15 10:30:45.123|Debug|MediaEncoder|Starting encode';
      const result = parseArrLogLine(line);

      expect(result).not.toBeNull();
      expect(result?.level).toBe('debug');
      expect(result?.source).toBe('MediaEncoder');
      expect(result?.message).toBe('Starting encode');
    });

    it('should parse a warning log line', () => {
      const line = '2024-01-15 10:30:45.123|Warn|Database|Connection slow';
      const result = parseArrLogLine(line);

      expect(result).not.toBeNull();
      expect(result?.level).toBe('warn');
      expect(result?.source).toBe('Database');
    });

    it('should parse "Warning" level (alternative spelling)', () => {
      const line = '2024-01-15 10:30:45.123|Warning|Database|Connection slow';
      const result = parseArrLogLine(line);

      expect(result).not.toBeNull();
      expect(result?.level).toBe('warn');
    });

    it('should parse an error log line', () => {
      const line = '2024-01-15 10:30:45.123|Error|TranscodeJob|Failed to start';
      const result = parseArrLogLine(line);

      expect(result).not.toBeNull();
      expect(result?.level).toBe('error');
      expect(result?.source).toBe('TranscodeJob');
    });

    it('should parse a fatal log line', () => {
      const line = '2024-01-15 10:30:45.123|Fatal|Server|Critical failure';
      const result = parseArrLogLine(line);

      expect(result).not.toBeNull();
      expect(result?.level).toBe('fatal');
      expect(result?.source).toBe('Server');
    });

    it('should parse a trace log line', () => {
      const line = '2024-01-15 10:30:45.123|Trace|API|Verbose message';
      const result = parseArrLogLine(line);

      expect(result).not.toBeNull();
      expect(result?.level).toBe('trace');
    });

    it('should return null for empty lines', () => {
      expect(parseArrLogLine('')).toBeNull();
      expect(parseArrLogLine('   ')).toBeNull();
    });

    it('should return null for stack trace lines', () => {
      expect(parseArrLogLine('   at System.Threading.Task.Run()')).toBeNull();
    });

    it('should preserve raw line in result', () => {
      const line = '2024-01-15 10:30:45.123|Info|Test|Raw line preservation';
      const result = parseArrLogLine(line);

      expect(result?.raw).toBe(line);
    });

    it('should handle timestamp without fractional seconds', () => {
      const line = '2024-01-15 10:30:45|Info|Test|No fractional seconds';
      const result = parseArrLogLine(line);

      expect(result).not.toBeNull();
      expect(result?.timestamp.getMilliseconds()).toBe(0);
      expect(result?.message).toBe('No fractional seconds');
    });

    describe('fractional second precision', () => {
      it.each([
        ['.2', 200],
        ['.25', 250],
        ['.123', 123],
        ['.1234', 123],
        ['.1234567', 123],
        ['', 0],
      ])('should parse fractional seconds %j as %i ms', (fraction, expectedMs) => {
        const line = `2026-10-10 12:00:01${fraction}|Info|RssSyncService|RSS Sync Completed. Reports found: 50`;
        const result = parseArrLogLine(line);

        expect(result).not.toBeNull();
        expect(result?.level).toBe('info');
        expect(result?.source).toBe('RssSyncService');
        expect(result?.message).toBe('RSS Sync Completed. Reports found: 50');
        expect(result?.timestamp.getTime()).toBe(
          new Date(2026, 9, 10, 12, 0, 1, expectedMs).getTime()
        );
      });

      it('documents known limitation: an 8-digit fraction is not parsed as an entry and is treated as a continuation', () => {
        const line = '2026-10-10 12:00:01.12345678|Info|RssSyncService|Too many digits';

        // Regex allows at most 7 fraction digits, so the line does not match the NLog format
        expect(parseArrLogLine(line)).toBeNull();
        expect(isArrLogContinuation(line)).toBe(true);
      });
    });
  });

  describe('isArrLogContinuation', () => {
    it('should not treat a one-digit fractional second line as a continuation', () => {
      expect(
        isArrLogContinuation('2026-10-10 12:00:01.2|Info|RssSyncService|RSS Sync Completed.')
      ).toBe(false);
    });

    it('should parse a realistic multi-line exception sample', () => {
      const lines = [
        '2026-10-10 12:00:05.4|Error|DownloadClientProvider|Error connecting to qBittorrent',
        '',
        '[v4.0.10.2544] System.Net.Http.HttpRequestException: Connection refused (localhost:8080)',
        '   at System.Net.Http.HttpConnectionPool.ConnectToTcpHostAsync(String host, Int32 port, HttpRequestMessage initialRequest, Boolean async, CancellationToken cancellationToken)',
      ];

      const first = parseArrLogLine(lines[0] as string);
      expect(first).not.toBeNull();
      expect(first?.level).toBe('error');
      expect(first?.source).toBe('DownloadClientProvider');
      expect(first?.timestamp.getTime()).toBe(new Date(2026, 9, 10, 12, 0, 5, 400).getTime());
      expect(isArrLogContinuation(lines[0] as string)).toBe(false);

      // Exception detail lines are not NLog entries and must be treated as continuations
      expect(parseArrLogLine(lines[2] as string)).toBeNull();
      expect(isArrLogContinuation(lines[2] as string)).toBe(true);
      expect(isArrLogContinuation(lines[3] as string)).toBe(true);
    });

    it('should detect stack trace lines', () => {
      expect(isArrLogContinuation('   at System.Threading.Task.Run()')).toBe(true);
      expect(isArrLogContinuation('  at MyClass.MyMethod()')).toBe(true);
    });

    it('should detect .NET exception declarations', () => {
      expect(isArrLogContinuation('System.NullReferenceException: Object reference')).toBe(true);
      expect(
        isArrLogContinuation(
          'Microsoft.Extensions.DependencyInjection.ActivatorUtilitiesException: Unable to resolve'
        )
      ).toBe(true);
      expect(isArrLogContinuation('NzbDrone.Core.SomeException: Error')).toBe(true);
      expect(isArrLogContinuation('NLog.NLogRuntimeException: Error')).toBe(true);
    });

    it('should detect inner exception markers', () => {
      expect(isArrLogContinuation('---> System.IO.IOException: The pipe is broken')).toBe(true);
    });

    it('should detect end of exception markers', () => {
      expect(isArrLogContinuation('--- End of inner exception stack trace ---')).toBe(true);
    });

    it('should not detect regular log lines as continuations', () => {
      expect(isArrLogContinuation('2024-01-15 10:30:45.123|Info|Test|Message')).toBe(false);
    });

    it('should return false for empty lines', () => {
      expect(isArrLogContinuation('')).toBe(false);
      expect(isArrLogContinuation('   ')).toBe(false);
    });
  });

  describe('parseArrLogLineWithContext', () => {
    const context = { continuationLines: [] as string[], filePath: '/test/arr.log', lineNumber: 1 };

    it('returns the entry parsed from the current line', () => {
      const result = parseArrLogLineWithContext(
        '2024-01-15 10:30:45.123|Info|Test|Message',
        context
      );

      expect(result.entry?.message).toBe('Message');
      expect(result.isContinuation).toBe(false);
      expect(result.previousComplete).toBe(false);
    });

    it('parses one-digit fraction timestamps', () => {
      const result = parseArrLogLineWithContext('2026-10-10 12:00:05.4|Error|Src|Boom', context);

      expect(result.entry?.timestamp.getTime()).toBe(
        new Date(2026, 9, 10, 12, 0, 5, 400).getTime()
      );
    });

    it('flags previousComplete when a previous entry is pending', () => {
      const previousEntry = parseArrLogLine('2024-01-15 10:30:45.123|Info|Test|First')!;
      const result = parseArrLogLineWithContext('2024-01-15 10:30:46.123|Info|Test|Second', {
        ...context,
        previousEntry,
      });

      expect(result.entry?.message).toBe('Second');
      expect(result.previousComplete).toBe(true);
    });

    it('identifies continuation lines', () => {
      const result = parseArrLogLineWithContext('   at System.Threading.Task.Run()', context);

      expect(result).toEqual({ entry: null, isContinuation: true, previousComplete: false });
    });

    it('treats the [vX] exception line as a continuation', () => {
      const result = parseArrLogLineWithContext(
        '[v4.0.10.2544] System.InvalidOperationException: bad state',
        context
      );

      expect(result.isContinuation).toBe(true);
    });

    it('ignores blank lines without flushing the pending entry', () => {
      const previousEntry = parseArrLogLine('2026-10-10 12:00:05.4|Error|Src|Boom')!;
      const result = parseArrLogLineWithContext('', { ...context, previousEntry });

      expect(result).toEqual({ entry: null, isContinuation: false, previousComplete: false });
    });
  });

  describe('finalizeArrLogEntry', () => {
    const entry = parseArrLogLine('2026-10-10 12:00:05.4|Error|Src|Boom')!;

    it('populates exception and appends its message for a [vX] prefixed line', () => {
      const result = finalizeArrLogEntry(entry, [
        '[v4.0.10.2544] System.InvalidOperationException: bad state',
        '   at Foo.Bar()',
      ]);

      expect(result.exception).toBe('System.InvalidOperationException');
      expect(result.message).toBe('Boom - bad state');
    });

    it('skips leading blank lines and does not duplicate a message already present', () => {
      const withMsg = parseArrLogLine('2026-10-10 12:00:05.4|Error|Src|bad state happened')!;
      const result = finalizeArrLogEntry(withMsg, ['', 'System.IO.IOException: bad state']);

      expect(result.exception).toBe('System.IO.IOException');
      expect(result.message).toBe('bad state happened');
    });

    it('returns the entry unchanged when there is no exception line', () => {
      expect(finalizeArrLogEntry(entry, ['   at Foo.Bar()'])).toBe(entry);
    });
  });

  describe('extractArrMetadata', () => {
    it('should extract download ID', () => {
      const message = 'Processing release with DownloadId=abc123def456';
      const metadata = extractArrMetadata(message);

      expect(metadata['downloadId']).toBe('abc123def456');
    });

    it('should extract indexer from brackets', () => {
      const message = '[MyIndexer] Release found';
      const metadata = extractArrMetadata(message);

      expect(metadata['indexer']).toBe('MyIndexer');
    });

    it('should extract indexer from Indexer= format', () => {
      const message = 'Searching Indexer=NzbGeek for releases';
      const metadata = extractArrMetadata(message);

      expect(metadata['indexer']).toBe('NzbGeek');
    });

    it('should extract release/title', () => {
      const message = 'Grabbed Release="My.Movie.2024.1080p.BluRay"';
      const metadata = extractArrMetadata(message);

      expect(metadata['release']).toBe('My.Movie.2024.1080p.BluRay');
    });

    it('should extract quality', () => {
      const message = 'Import Quality=Bluray-1080p';
      const metadata = extractArrMetadata(message);

      expect(metadata['quality']).toBe('Bluray-1080p');
    });
  });

  describe('getArrSeverityBoost', () => {
    it('should boost disk space warnings to error', () => {
      expect(getArrSeverityBoost('Low disk space on /data', 'warn')).toBe('error');
    });

    it('should boost permission denied warnings to error', () => {
      expect(getArrSeverityBoost('Permission denied: /mnt/media', 'warn')).toBe('error');
    });

    it('should boost access denied warnings to error', () => {
      expect(getArrSeverityBoost('Access denied to folder', 'warn')).toBe('error');
    });

    it('should boost database locked warnings to error', () => {
      expect(getArrSeverityBoost('Database locked, retrying', 'warn')).toBe('error');
    });

    it('should boost connection refused warnings to error', () => {
      expect(getArrSeverityBoost('Connection refused to indexer', 'warn')).toBe('error');
    });

    it('should boost timeout warnings to error', () => {
      expect(getArrSeverityBoost('Request timeout after 30s', 'warn')).toBe('error');
    });

    it('should boost failed to import warnings to error', () => {
      expect(getArrSeverityBoost('Failed to import episode', 'warn')).toBe('error');
    });

    it('should not boost non-critical warnings', () => {
      expect(getArrSeverityBoost('Minor issue detected', 'warn')).toBe('warn');
    });

    it('should not change error level', () => {
      expect(getArrSeverityBoost('Disk space low', 'error')).toBe('error');
    });

    it('should not change info level', () => {
      expect(getArrSeverityBoost('Disk space check', 'info')).toBe('info');
    });
  });
});

describe('Log File Configurations', () => {
  describe('ARR_LOG_FILE_CONFIG (generic)', () => {
    it('should have valid default paths', () => {
      expect(ARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
    });

    it('should have generic file patterns', () => {
      expect(ARR_LOG_FILE_CONFIG.filePatterns).toContain('*.txt');
      expect(ARR_LOG_FILE_CONFIG.filePatterns).toContain('*.log');
    });

    it('should have encoding set to utf-8', () => {
      expect(ARR_LOG_FILE_CONFIG.encoding).toBe('utf-8');
    });

    it('should have daily rotation enabled', () => {
      expect(ARR_LOG_FILE_CONFIG.rotatesDaily).toBe(true);
    });
  });

  describe('SONARR_LOG_FILE_CONFIG', () => {
    it('should have valid default paths', () => {
      expect(SONARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
      expect(SONARR_LOG_FILE_CONFIG.defaultPaths.linux).toContain('~/.config/Sonarr/logs');
    });

    it('should have Sonarr-specific file patterns', () => {
      expect(SONARR_LOG_FILE_CONFIG.filePatterns).toContain('sonarr.txt');
      expect(SONARR_LOG_FILE_CONFIG.filePatterns).toContain('sonarr.*.txt');
    });

    it('should have date pattern for log rotation', () => {
      expect(SONARR_LOG_FILE_CONFIG.datePattern).toBeDefined();
      expect('sonarr.2024-01-15.txt').toMatch(SONARR_LOG_FILE_CONFIG.datePattern!);
    });
  });

  describe('RADARR_LOG_FILE_CONFIG', () => {
    it('should have valid default paths', () => {
      expect(RADARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
      expect(RADARR_LOG_FILE_CONFIG.defaultPaths.linux).toContain('~/.config/Radarr/logs');
    });

    it('should have Radarr-specific file patterns', () => {
      expect(RADARR_LOG_FILE_CONFIG.filePatterns).toContain('radarr.txt');
      expect(RADARR_LOG_FILE_CONFIG.filePatterns).toContain('radarr.*.txt');
    });

    it('should have date pattern for log rotation', () => {
      expect('radarr.2024-01-15.txt').toMatch(RADARR_LOG_FILE_CONFIG.datePattern!);
    });
  });

  describe('LIDARR_LOG_FILE_CONFIG', () => {
    it('should have valid default paths', () => {
      expect(LIDARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
      expect(LIDARR_LOG_FILE_CONFIG.defaultPaths.linux).toContain('~/.config/Lidarr/logs');
    });

    it('should have Lidarr-specific file patterns', () => {
      expect(LIDARR_LOG_FILE_CONFIG.filePatterns).toContain('lidarr.txt');
    });

    it('should have date pattern for log rotation', () => {
      expect('lidarr.2024-01-15.txt').toMatch(LIDARR_LOG_FILE_CONFIG.datePattern!);
    });
  });

  describe('READARR_LOG_FILE_CONFIG', () => {
    it('should have valid default paths', () => {
      expect(READARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
      expect(READARR_LOG_FILE_CONFIG.defaultPaths.linux).toContain('~/.config/Readarr/logs');
    });

    it('should have Readarr-specific file patterns', () => {
      expect(READARR_LOG_FILE_CONFIG.filePatterns).toContain('readarr.txt');
    });

    it('should have date pattern for log rotation', () => {
      expect('readarr.2024-01-15.txt').toMatch(READARR_LOG_FILE_CONFIG.datePattern!);
    });
  });

  describe('PROWLARR_LOG_FILE_CONFIG', () => {
    it('should have valid default paths', () => {
      expect(PROWLARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
      expect(PROWLARR_LOG_FILE_CONFIG.defaultPaths.linux).toContain('~/.config/Prowlarr/logs');
    });

    it('should have Prowlarr-specific file patterns', () => {
      expect(PROWLARR_LOG_FILE_CONFIG.filePatterns).toContain('prowlarr.txt');
    });

    it('should have date pattern for log rotation', () => {
      expect('prowlarr.2024-01-15.txt').toMatch(PROWLARR_LOG_FILE_CONFIG.datePattern!);
    });
  });

  describe('WHISPARR_LOG_FILE_CONFIG', () => {
    it('should have valid default paths', () => {
      expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.docker).toContain('/config/logs');
      expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.linux).toContain('~/.config/Whisparr/logs');
      expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.linux).toContain('/var/lib/whisparr/logs');
    });

    it('should have Whisparr-specific file patterns', () => {
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
      expect('whisparr.2024-01-15.txt').toMatch(WHISPARR_LOG_FILE_CONFIG.datePattern!);
    });

    it('should have Windows paths', () => {
      expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.windows.length).toBeGreaterThan(0);
      const hasAppdata = WHISPARR_LOG_FILE_CONFIG.defaultPaths.windows.some(
        (p) => p.includes('APPDATA') || p.includes('ProgramData')
      );
      expect(hasAppdata).toBe(true);
    });

    it('should have macOS paths', () => {
      expect(WHISPARR_LOG_FILE_CONFIG.defaultPaths.macos.length).toBeGreaterThan(0);
    });
  });
});
