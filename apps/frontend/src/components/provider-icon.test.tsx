import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { ProviderIcon, getProviderMeta, providerMeta } from './provider-icon';

describe('ProviderIcon', () => {
  describe('Whisparr provider', () => {
    it('should render Whisparr icon without errors', () => {
      const { container } = render(<ProviderIcon providerId="whisparr" />);

      // The icon should render as an SVG
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('should apply size class correctly', () => {
      const { container } = render(<ProviderIcon providerId="whisparr" size="lg" />);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      // In jsdom, className is an SVGAnimatedString, so we check classList
      expect(svg?.classList.contains('h-8')).toBe(true);
      expect(svg?.classList.contains('w-8')).toBe(true);
    });

    it('should apply custom className', () => {
      const { container } = render(<ProviderIcon providerId="whisparr" className="custom-class" />);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.classList.contains('custom-class')).toBe(true);
    });
  });

  describe('All *arr providers', () => {
    const arrProviders = [
      'sonarr',
      'radarr',
      'prowlarr',
      'whisparr',
      'lidarr',
      'readarr',
      'bazarr',
    ];

    it.each(arrProviders)('should render %s icon', (providerId) => {
      const { container } = render(<ProviderIcon providerId={providerId} />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });
  });

  describe('Default icon fallback', () => {
    it('should render default icon for unknown provider', () => {
      const { container } = render(<ProviderIcon providerId="unknown-provider" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });
  });
});

describe('providerMeta', () => {
  describe('Bazarr metadata', () => {
    it('should have Bazarr entry with brand color', () => {
      expect(providerMeta.bazarr).toBeDefined();
      expect(providerMeta.bazarr.name).toBe('Bazarr');
      expect(providerMeta.bazarr.color).toBe('#7B68EE');
      expect(providerMeta.bazarr.bgColor).toBe('bg-purple-500/10');
    });
  });

  describe('Whisparr metadata', () => {
    it('should have Whisparr entry', () => {
      expect(providerMeta.whisparr).toBeDefined();
    });

    it('should have correct name', () => {
      expect(providerMeta.whisparr.name).toBe('Whisparr');
    });

    it('should have pink color', () => {
      expect(providerMeta.whisparr.color).toBe('#FF69B4');
    });

    it('should have correct background color class', () => {
      expect(providerMeta.whisparr.bgColor).toBe('bg-pink-500/10');
    });
  });

  describe('Lidarr metadata', () => {
    it('should have Lidarr name and green branding', () => {
      expect(providerMeta.lidarr.name).toBe('Lidarr');
      expect(providerMeta.lidarr.color).toBe('#00C853');
      expect(providerMeta.lidarr.bgColor).toBe('bg-green-500/10');
    });
  });

  describe('All *arr provider metadata', () => {
    const arrProviders = [
      'sonarr',
      'radarr',
      'prowlarr',
      'whisparr',
      'lidarr',
      'readarr',
      'bazarr',
    ];

    it.each(arrProviders)('should have metadata for %s', (providerId) => {
      expect(providerMeta[providerId]).toBeDefined();
      expect(providerMeta[providerId].name).toBeTruthy();
      expect(providerMeta[providerId].color).toBeTruthy();
      expect(providerMeta[providerId].bgColor).toBeTruthy();
    });
  });
});

describe('getProviderMeta', () => {
  it('should return Whisparr metadata', () => {
    const meta = getProviderMeta('whisparr');
    expect(meta.name).toBe('Whisparr');
    expect(meta.color).toBe('#FF69B4');
  });

  it('should return Lidarr metadata', () => {
    const meta = getProviderMeta('lidarr');
    expect(meta.name).toBe('Lidarr');
    expect(meta.color).toBe('#00C853');
  });

  it('should be case insensitive', () => {
    const meta = getProviderMeta('WHISPARR');
    expect(meta.name).toBe('Whisparr');
  });

  it('should return default metadata for unknown provider', () => {
    const meta = getProviderMeta('unknown-provider-xyz');
    expect(meta.name).toBe('unknown-provider-xyz');
    expect(meta.color).toBe('#6B7280');
  });
});
