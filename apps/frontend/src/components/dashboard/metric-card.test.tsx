import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Activity, AlertTriangle, Zap, Server } from 'lucide-react';

import { MetricCard } from './metric-card';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('MetricCard', () => {
  describe('rendering', () => {
    it('should render title and value', () => {
      render(<MetricCard title="Test Title" value="123" icon={Activity} />);

      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('123')).toBeInTheDocument();
    });

    it('should render numeric value', () => {
      render(<MetricCard title="Count" value={456} icon={Activity} />);

      expect(screen.getByText('456')).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
      render(<MetricCard title="Test" value="100" icon={Activity} subtitle="Additional info" />);

      expect(screen.getByText('Additional info')).toBeInTheDocument();
    });

    it('should not render subtitle when not provided', () => {
      render(<MetricCard title="Test" value="100" icon={Activity} />);

      expect(screen.queryByText('Additional info')).not.toBeInTheDocument();
    });

    it('should render icon', () => {
      const { container } = render(<MetricCard title="Test" value="100" icon={Zap} />);

      // Icon should be rendered as SVG
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('link behavior', () => {
    it('should render as link when href is provided', () => {
      render(<MetricCard title="Test" value="100" icon={Activity} href="/test-link" />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/test-link');
    });

    it('should not render as link when href is not provided', () => {
      render(<MetricCard title="Test" value="100" icon={Activity} />);

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('should apply hover styles when href is provided', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} href="/test" />
      );

      const card = container.querySelector('.cursor-pointer');
      expect(card).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show skeleton when loading', () => {
      const { container } = render(<MetricCard title="Test" value="100" icon={Activity} loading />);

      // Should have skeleton elements
      const skeletons = container.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not show value when loading', () => {
      render(<MetricCard title="Test" value="100" icon={Activity} loading />);

      expect(screen.queryByText('100')).not.toBeInTheDocument();
    });

    it('should not show title when loading', () => {
      render(<MetricCard title="Test" value="100" icon={Activity} loading />);

      expect(screen.queryByText('Test')).not.toBeInTheDocument();
    });
  });

  describe('value styling', () => {
    it('should apply custom valueClassName', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} valueClassName="text-rose-500" />
      );

      const valueElement = container.querySelector('.text-rose-500');
      expect(valueElement).toBeInTheDocument();
    });

    it('should apply tabular-nums class to value', () => {
      const { container } = render(<MetricCard title="Test" value="100" icon={Activity} />);

      const valueElement = container.querySelector('.tabular-nums');
      expect(valueElement).toBeInTheDocument();
    });
  });

  describe('sparkline', () => {
    it('should render sparkline when trend data has 2+ points', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[10, 20, 30, 40]} />
      );

      // Sparkline renders as SVG with path
      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should not render sparkline when trend has less than 2 points', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[10]} />
      );

      // Should still have placeholder div but no sparkline paths
      const sparklinesContainer = container.querySelector('.h-8.w-16');
      expect(sparklinesContainer).toBeInTheDocument();

      // No sparkline SVG paths inside
      const paths = sparklinesContainer?.querySelectorAll('path');
      expect(paths?.length ?? 0).toBe(0);
    });

    it('should not render sparkline when trend is empty', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[]} />
      );

      const sparklinesContainer = container.querySelector('.h-8.w-16');
      expect(sparklinesContainer).toBeInTheDocument();

      const paths = sparklinesContainer?.querySelectorAll('path');
      expect(paths?.length ?? 0).toBe(0);
    });

    it('should maintain consistent layout with placeholder when no trend', () => {
      const { container } = render(<MetricCard title="Test" value="100" icon={Activity} />);

      // Placeholder div should exist
      const placeholder = container.querySelector('.h-8.w-16.shrink-0');
      expect(placeholder).toBeInTheDocument();
    });

    it('should render positive sparkline (green) by default', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[10, 20, 30]} />
      );

      // Check for green stroke color
      const path = container.querySelector('svg path[stroke="#10b981"]');
      expect(path).toBeInTheDocument();
    });

    it('should render negative sparkline (red) when valueClassName includes red', () => {
      const { container } = render(
        <MetricCard
          title="Errors"
          value="100"
          icon={Activity}
          trend={[10, 20, 30]}
          valueClassName="text-red-500"
        />
      );

      // Check for red stroke color
      const path = container.querySelector('svg path[stroke="#f43f5e"]');
      expect(path).toBeInTheDocument();
    });
  });

  describe('different icons', () => {
    it.each([
      ['Activity', Activity],
      ['AlertTriangle', AlertTriangle],
      ['Zap', Zap],
      ['Server', Server],
    ])('should render with %s icon', (_, IconComponent) => {
      const { container } = render(<MetricCard title="Test" value="100" icon={IconComponent} />);

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('formatted values', () => {
    it('should display comma-formatted numbers', () => {
      render(<MetricCard title="Test" value="1,234,567" icon={Activity} />);

      expect(screen.getByText('1,234,567')).toBeInTheDocument();
    });

    it('should display percentage values', () => {
      render(<MetricCard title="Test" value="95%" icon={Activity} />);

      expect(screen.getByText('95%')).toBeInTheDocument();
    });

    it('should display zero values', () => {
      render(<MetricCard title="Test" value={0} icon={Activity} />);

      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have uppercase title styling', () => {
      const { container } = render(<MetricCard title="Test Title" value="100" icon={Activity} />);

      const title = container.querySelector('.uppercase');
      expect(title).toBeInTheDocument();
    });
  });
});

describe('Sparkline', () => {
  // Sparkline is internal but tested through MetricCard
  describe('data handling', () => {
    it('should handle all same values (flat line)', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[50, 50, 50, 50]} />
      );

      // Should render without errors
      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should handle increasing values', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[10, 20, 30, 40, 50]} />
      );

      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should handle decreasing values', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[50, 40, 30, 20, 10]} />
      );

      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should handle mixed values', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[10, 50, 20, 80, 30]} />
      );

      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should handle negative values', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[-10, 0, 10, 20]} />
      );

      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should handle exactly 2 data points (minimum)', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[10, 20]} />
      );

      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should handle large data sets', () => {
      const largeData = Array.from({ length: 100 }, (_, i) => Math.sin(i / 10) * 50 + 50);
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={largeData} />
      );

      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('should handle zero values', () => {
      const { container } = render(
        <MetricCard title="Test" value="100" icon={Activity} trend={[0, 0, 0, 0]} />
      );

      const paths = container.querySelectorAll('svg path');
      expect(paths.length).toBeGreaterThan(0);
    });
  });
});
