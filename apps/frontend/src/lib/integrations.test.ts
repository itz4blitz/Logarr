import { describe, it, expect } from 'vitest';

import {
  integrations,
  getIntegrationById,
  getIntegrationsByCategory,
  getAvailableIntegrations,
  searchIntegrations,
  integrationCategories,
} from './integrations';

describe('Integrations Registry', () => {
  describe('Whisparr integration', () => {
    it('should be included in integrations array', () => {
      const whisparr = integrations.find((i) => i.id === 'whisparr');
      expect(whisparr).toBeDefined();
    });

    it('should have correct basic metadata', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr).toBeDefined();
      expect(whisparr?.name).toBe('Whisparr');
      expect(whisparr?.description).toContain('Adult content manager');
      expect(whisparr?.category).toBe('arr_stack');
    });

    it('should be marked as available', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.status).toBe('available');
    });

    it('should have correct connection type', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.connectionType).toBe('api');
    });

    it('should have builtin icon type', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.iconType).toBe('builtin');
      expect(whisparr?.icon).toBe('whisparr');
    });

    it('should have correct branding', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.color).toBe('#FF69B4'); // Hot pink
      expect(whisparr?.bgColor).toBe('bg-pink-500/10');
    });

    it('should have correct default port', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.defaultPort).toBe(6969);
    });

    it('should have correct capabilities', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.capabilities).toEqual({
        realTimeLogs: true,
        activityLog: true,
        sessions: false,
        webhooks: true,
        metrics: true,
      });
    });

    it('should have correct config fields', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.configFields).toBeDefined();
      expect(whisparr?.configFields.length).toBeGreaterThan(0);

      // Should have standard API fields
      const fieldNames = whisparr?.configFields.map((f) => f.name);
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('url');
      expect(fieldNames).toContain('apiKey');
      expect(fieldNames).toContain('logPath');
    });

    it('should have documentation URLs', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.website).toBe('https://whisparr.com');
      expect(whisparr?.docsUrl).toBe('https://wiki.servarr.com/whisparr');
    });

    it('should have searchable tags', () => {
      const whisparr = getIntegrationById('whisparr');
      expect(whisparr?.tags).toContain('arr');
      expect(whisparr?.tags).toContain('adult');
      expect(whisparr?.tags).toContain('automation');
    });
  });

  describe('getIntegrationsByCategory', () => {
    it('should include Whisparr in arr_stack category', () => {
      const arrIntegrations = getIntegrationsByCategory('arr_stack');
      const whisparr = arrIntegrations.find((i) => i.id === 'whisparr');
      expect(whisparr).toBeDefined();
    });

    it('should have multiple *arr integrations', () => {
      const arrIntegrations = getIntegrationsByCategory('arr_stack');
      const arrIds = arrIntegrations.map((i) => i.id);
      expect(arrIds).toContain('sonarr');
      expect(arrIds).toContain('radarr');
      expect(arrIds).toContain('prowlarr');
      expect(arrIds).toContain('whisparr');
      expect(arrIds).toContain('lidarr');
      expect(arrIds).toContain('readarr');
    });
  });

  describe('getAvailableIntegrations', () => {
    it('should include Whisparr in available integrations', () => {
      const available = getAvailableIntegrations();
      const whisparr = available.find((i) => i.id === 'whisparr');
      expect(whisparr).toBeDefined();
    });

    it('should include other available *arr integrations', () => {
      const available = getAvailableIntegrations();
      const ids = available.map((i) => i.id);
      // Sonarr, Radarr, Prowlarr, and Whisparr should be available
      expect(ids).toContain('sonarr');
      expect(ids).toContain('radarr');
      expect(ids).toContain('prowlarr');
      expect(ids).toContain('whisparr');
    });
  });

  describe('searchIntegrations', () => {
    it('should find Whisparr by name', () => {
      const results = searchIntegrations('whisparr');
      expect(results.some((i) => i.id === 'whisparr')).toBe(true);
    });

    it('should find Whisparr by tag', () => {
      const results = searchIntegrations('arr');
      expect(results.some((i) => i.id === 'whisparr')).toBe(true);
    });

    it('should find Whisparr by description', () => {
      const results = searchIntegrations('adult');
      expect(results.some((i) => i.id === 'whisparr')).toBe(true);
    });

    it('should find multiple *arr integrations when searching for "arr"', () => {
      const results = searchIntegrations('arr');
      const ids = results.map((i) => i.id);
      expect(ids).toContain('sonarr');
      expect(ids).toContain('radarr');
      expect(ids).toContain('whisparr');
    });
  });

  describe('integrationCategories', () => {
    it('should have arr_stack category', () => {
      const arrCategory = integrationCategories.find((c) => c.id === 'arr_stack');
      expect(arrCategory).toBeDefined();
      expect(arrCategory?.name).toBe('*Arr Stack');
    });
  });
});

describe('All *arr integrations consistency', () => {
  const arrIntegrations = ['sonarr', 'radarr', 'prowlarr', 'whisparr'];

  it.each(arrIntegrations)('%s should have consistent structure', (id) => {
    const integration = getIntegrationById(id);
    expect(integration).toBeDefined();
    expect(integration?.category).toBe('arr_stack');
    expect(integration?.status).toBe('available');
    expect(integration?.connectionType).toBe('api');
    expect(integration?.capabilities.realTimeLogs).toBe(true);
    expect(integration?.capabilities.activityLog).toBe(true);
    expect(integration?.capabilities.sessions).toBe(false);
    expect(integration?.capabilities.webhooks).toBe(true);
    expect(integration?.capabilities.metrics).toBe(true);
  });
});
