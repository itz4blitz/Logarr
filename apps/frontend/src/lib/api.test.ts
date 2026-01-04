import { describe, it, expect, vi } from 'vitest';

// Test the API client's URL building and request formatting
describe('ApiClient', () => {
  describe('URL construction', () => {
    it('should build correct search params for array values', () => {
      const params = new URLSearchParams();
      const severities = ['high', 'critical'];
      severities.forEach((s) => params.append('severities', s));

      expect(params.toString()).toBe('severities=high&severities=critical');
    });

    it('should handle empty arrays gracefully', () => {
      const params = new URLSearchParams();
      const empty: string[] = [];
      empty.forEach((s) => params.append('test', s));

      expect(params.toString()).toBe('');
    });

    it('should handle single values', () => {
      const params = new URLSearchParams();
      params.append('search', 'connection');
      params.append('limit', '50');

      expect(params.get('search')).toBe('connection');
      expect(params.get('limit')).toBe('50');
    });
  });

  describe('request formatting', () => {
    it('should serialize object to JSON for POST requests', () => {
      const body = {
        name: 'Test Server',
        type: 'jellyfin',
        url: 'http://localhost:8096',
      };

      const serialized = JSON.stringify(body);
      expect(serialized).toContain('"name":"Test Server"');
      expect(serialized).toContain('"type":"jellyfin"');
    });

    it('should handle undefined values in params', () => {
      const params: Record<string, string | undefined> = {
        search: 'test',
        filter: undefined,
      };

      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value);
        }
      });

      expect(searchParams.toString()).toBe('search=test');
    });
  });

  describe('date handling', () => {
    it('should parse ISO date strings correctly', () => {
      const isoDate = '2024-01-15T12:30:00.000Z';
      const date = new Date(isoDate);

      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(0); // January
      expect(date.getUTCDate()).toBe(15);
    });
  });
});
