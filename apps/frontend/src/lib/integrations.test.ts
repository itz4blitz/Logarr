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
  describe('qBittorrent integration', () => {
    it('should be available in the download clients category', () => {
      const qbit = getIntegrationById('qbittorrent');
      expect(qbit?.name).toBe('qBittorrent');
      expect(qbit?.status).toBe('available');
      expect(qbit?.category).toBe('download_clients');
      expect(qbit?.connectionType).toBe('api_basic');
      expect(getAvailableIntegrations().some((i) => i.id === 'qbittorrent')).toBe(true);
    });

    it('should have username and password optional and name/url required', () => {
      const fields = getIntegrationById('qbittorrent')?.configFields ?? [];
      expect(fields.map((f) => f.name)).toEqual(['name', 'url', 'username', 'password', 'logPath']);
      const byName = Object.fromEntries(fields.map((f) => [f.name, f]));
      expect(byName['name']?.required).toBe(true);
      expect(byName['url']?.required).toBe(true);
      expect(byName['username']?.required).toBe(false);
      expect(byName['password']?.required).toBe(false);
      expect(byName['password']?.type).toBe('password');
    });

    it('should declare credential capabilities and no sessions', () => {
      const caps = getIntegrationById('qbittorrent')?.capabilities;
      expect(caps?.sessions).toBe(false);
      // log-file tailing, like the *arr entries
      expect(caps?.realTimeLogs).toBe(true);
      expect(caps?.supportsUsername).toBe(true);
      expect(caps?.apiKeyOptional).toBe(true);
    });

    it('should be found by search', () => {
      expect(searchIntegrations('qbittorrent').some((i) => i.id === 'qbittorrent')).toBe(true);
      expect(searchIntegrations('torrent').some((i) => i.id === 'qbittorrent')).toBe(true);
    });
  });

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

  describe('Lidarr integration', () => {
    it('should be defined as an *arr stack integration', () => {
      const lidarr = getIntegrationById('lidarr');
      expect(lidarr).toBeDefined();
      expect(lidarr?.name).toBe('Lidarr');
      expect(lidarr?.category).toBe('arr_stack');
    });

    it('should be marked as available', () => {
      expect(getIntegrationById('lidarr')?.status).toBe('available');
    });

    it('should use the API connection type', () => {
      expect(getIntegrationById('lidarr')?.connectionType).toBe('api');
    });

    it('should use the dashboard-icons icon', () => {
      const lidarr = getIntegrationById('lidarr');
      expect(lidarr?.iconType).toBe('dashboard-icons');
      expect(lidarr?.icon).toBe('lidarr');
    });

    it('should have correct branding', () => {
      const lidarr = getIntegrationById('lidarr');
      expect(lidarr?.color).toBe('#00C853');
      expect(lidarr?.bgColor).toBe('bg-green-500/10');
    });

    it('should have correct default port', () => {
      expect(getIntegrationById('lidarr')?.defaultPort).toBe(8686);
    });

    it('should support the activity log', () => {
      expect(getIntegrationById('lidarr')?.capabilities.activityLog).toBe(true);
    });

    it('should have required password API key and log path config fields', () => {
      const lidarr = getIntegrationById('lidarr');
      const fieldNames = lidarr?.configFields.map((f) => f.name);
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('url');
      expect(fieldNames).toContain('apiKey');
      expect(fieldNames).toContain('logPath');

      const apiKey = lidarr?.configFields.find((f) => f.name === 'apiKey');
      expect(apiKey?.required).toBe(true);
      expect(apiKey?.type).toBe('password');
    });

    it('should be found by search', () => {
      const results = searchIntegrations('lidarr');
      expect(results.some((i) => i.id === 'lidarr')).toBe(true);
    });
  });

  describe('Seerr integration', () => {
    it('should be registered with correct metadata', () => {
      const seerr = getIntegrationById('seerr');
      expect(seerr).toBeDefined();
      expect(seerr?.name).toBe('Seerr');
      expect(seerr?.description).toContain('Overseerr');
      expect(seerr?.description).toContain('Jellyseerr');
      expect(seerr?.category).toBe('media_requests');
      expect(seerr?.status).toBe('available');
      expect(seerr?.connectionType).toBe('api');
      expect(seerr?.defaultPort).toBe(5055);
    });

    it('should use a dashboard-icons slug', () => {
      const seerr = getIntegrationById('seerr');
      expect(seerr?.iconType).toBe('dashboard-icons');
      expect(seerr?.icon).toBe('seerr');
    });

    it('should have name, url, admin apiKey and logPath fields', () => {
      const seerr = getIntegrationById('seerr');
      expect(seerr?.configFields.map((f) => f.name)).toEqual(['name', 'url', 'apiKey', 'logPath']);
      expect(seerr?.configFields.find((f) => f.name === 'apiKey')?.label).toBe('Admin API Key');
    });

    it('should have correct capabilities', () => {
      expect(getIntegrationById('seerr')?.capabilities).toEqual({
        realTimeLogs: true,
        activityLog: true,
        sessions: false,
        webhooks: false,
        metrics: false,
      });
    });

    it('should be available and replace the separate Overseerr/Jellyseerr entries', () => {
      expect(getAvailableIntegrations().map((i) => i.id)).toContain('seerr');
      expect(getIntegrationById('overseerr')).toBeUndefined();
      expect(getIntegrationById('jellyseerr')).toBeUndefined();
      const available = getIntegrationsByCategory('media_requests').filter(
        (i) => i.status !== 'coming_soon'
      );
      expect(available.map((i) => i.id)).toEqual(['seerr']);
    });

    it('should be searchable by Overseerr and Jellyseerr', () => {
      expect(searchIntegrations('overseerr').map((i) => i.id)).toContain('seerr');
      expect(searchIntegrations('jellyseerr').map((i) => i.id)).toContain('seerr');
    });
  });

  describe('Readarr integration', () => {
    it('should be available and not coming soon', () => {
      const readarr = getIntegrationById('readarr');
      expect(readarr).toBeDefined();
      expect(readarr?.name).toBe('Readarr');
      expect(readarr?.status).toBe('available');
      expect(readarr?.connectionType).toBe('api');
      expect(readarr?.category).toBe('arr_stack');
      expect(readarr?.defaultPort).toBe(8787);
    });

    it('should not be duplicated in the registry', () => {
      expect(integrations.filter((i) => i.id === 'readarr')).toHaveLength(1);
    });

    it('should state that it is retired upstream', () => {
      const readarr = getIntegrationById('readarr');
      expect(readarr?.description).toMatch(/retired/i);
      expect(readarr?.description).toMatch(/best-effort/i);
    });

    it('should have standard API config fields', () => {
      const fieldNames = getIntegrationById('readarr')?.configFields.map((f) => f.name);
      expect(fieldNames).toEqual(['name', 'url', 'apiKey', 'logPath']);
    });

    it('should use the dashboard-icons readarr icon', () => {
      const readarr = getIntegrationById('readarr');
      expect(readarr?.icon).toBe('readarr');
      expect(readarr?.iconType).toBe('dashboard-icons');
    });

    it('should be findable by name and by the retired notice', () => {
      expect(searchIntegrations('readarr').some((i) => i.id === 'readarr')).toBe(true);
      expect(searchIntegrations('retired').some((i) => i.id === 'readarr')).toBe(true);
    });
  });

  describe('Bazarr integration', () => {
    it('should be available in the arr_stack category', () => {
      const bazarr = getIntegrationById('bazarr');
      expect(bazarr).toBeDefined();
      expect(bazarr?.name).toBe('Bazarr');
      expect(bazarr?.category).toBe('arr_stack');
      expect(bazarr?.status).toBe('available');
      expect(bazarr?.connectionType).toBe('api');
    });

    it('should use the bazarr icon, brand color and default port', () => {
      const bazarr = getIntegrationById('bazarr');
      expect(bazarr?.icon).toBe('bazarr');
      expect(bazarr?.color).toBe('#7B68EE');
      expect(bazarr?.defaultPort).toBe(6767);
    });

    it('should declare log-file tailing but no webhooks or metrics', () => {
      const bazarr = getIntegrationById('bazarr');
      expect(bazarr?.capabilities).toEqual({
        realTimeLogs: true,
        activityLog: true,
        sessions: false,
        webhooks: false,
        metrics: false,
      });
    });

    it('should have API key and log path config fields', () => {
      const fieldNames = getIntegrationById('bazarr')?.configFields.map((f) => f.name);
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('url');
      expect(fieldNames).toContain('apiKey');
      expect(fieldNames).toContain('logPath');
    });

    it('should have documentation URLs', () => {
      const bazarr = getIntegrationById('bazarr');
      expect(bazarr?.website).toBe('https://bazarr.media');
      expect(bazarr?.docsUrl).toBe('https://wiki.bazarr.media');
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
      // Sonarr, Radarr, Prowlarr, Whisparr, and Lidarr should be available
      expect(ids).toContain('sonarr');
      expect(ids).toContain('radarr');
      expect(ids).toContain('prowlarr');
      expect(ids).toContain('whisparr');
      expect(ids).toContain('lidarr');
    });

    it('should include Readarr in available integrations', () => {
      const ids = getAvailableIntegrations().map((i) => i.id);
      expect(ids).toContain('readarr');
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
