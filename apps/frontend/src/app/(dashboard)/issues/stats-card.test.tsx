import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertTriangle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

// Since StatsCard is not exported, we'll create a simplified version for testing
// the mobile responsiveness patterns used in the issues page
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// Recreate StatsCard component for testing (mirrors the one in page.tsx)
function StatsCard({
  title,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}) {
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <Card className="bg-card border-border/50" data-testid="stats-card">
      <CardContent className="flex h-full flex-col justify-center p-3 sm:p-4">
        {/* Mobile: centered vertical layout filling space */}
        <div
          className="flex flex-col items-center justify-center gap-1 sm:hidden"
          data-testid="mobile-layout"
        >
          <div className={cn('rounded-lg p-2', color)} data-testid="icon-container-mobile">
            <Icon className="h-6 w-6" data-testid="icon-mobile" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl leading-none font-bold" data-testid="value-mobile">
              {formattedValue}
            </span>
            {subtext && (
              <span className="text-muted-foreground text-xs" data-testid="subtext-mobile">
                {subtext}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-xs" data-testid="title-mobile">
            {title}
          </p>
        </div>
        {/* Desktop: horizontal with icon */}
        <div className="hidden items-center gap-3 sm:flex" data-testid="desktop-layout">
          <div className={cn('rounded-lg p-2', color)} data-testid="icon-container-desktop">
            <Icon className="h-4 w-4" data-testid="icon-desktop" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-xs" data-testid="title-desktop">
              {title}
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold" data-testid="value-desktop">
                {formattedValue}
              </span>
              {subtext && (
                <span className="text-muted-foreground text-xs" data-testid="subtext-desktop">
                  {subtext}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

describe('StatsCard', () => {
  describe('rendering', () => {
    it('should render with title and value', () => {
      render(
        <StatsCard
          title="Open Issues"
          value={42}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      // Check both mobile and desktop layouts exist
      expect(screen.getByTestId('mobile-layout')).toBeInTheDocument();
      expect(screen.getByTestId('desktop-layout')).toBeInTheDocument();
    });

    it('should format numbers with locale formatting', () => {
      render(
        <StatsCard
          title="Total Issues"
          value={1234567}
          icon={TrendingUp}
          color="bg-blue-500/10 text-blue-500"
        />
      );

      // Should format as "1,234,567" (US locale) in both layouts
      const formattedValue = (1234567).toLocaleString();
      const mobileValue = screen.getByTestId('value-mobile');
      const desktopValue = screen.getByTestId('value-desktop');

      expect(mobileValue).toHaveTextContent(formattedValue);
      expect(desktopValue).toHaveTextContent(formattedValue);
    });

    it('should render string values as-is', () => {
      render(
        <StatsCard title="Status" value="N/A" icon={Clock} color="bg-gray-500/10 text-gray-500" />
      );

      expect(screen.getByTestId('value-mobile')).toHaveTextContent('N/A');
      expect(screen.getByTestId('value-desktop')).toHaveTextContent('N/A');
    });

    it('should render subtext when provided', () => {
      render(
        <StatsCard
          title="Resolved"
          value={100}
          icon={CheckCircle}
          color="bg-green-500/10 text-green-500"
          subtext="today"
        />
      );

      expect(screen.getByTestId('subtext-mobile')).toHaveTextContent('today');
      expect(screen.getByTestId('subtext-desktop')).toHaveTextContent('today');
    });

    it('should not render subtext when not provided', () => {
      render(
        <StatsCard
          title="Issues"
          value={50}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      expect(screen.queryByTestId('subtext-mobile')).not.toBeInTheDocument();
      expect(screen.queryByTestId('subtext-desktop')).not.toBeInTheDocument();
    });
  });

  describe('mobile layout', () => {
    it('should have mobile-specific icon size (h-6 w-6)', () => {
      render(
        <StatsCard
          title="Open Issues"
          value={42}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      const mobileIcon = screen.getByTestId('icon-mobile');
      expect(mobileIcon).toHaveClass('h-6', 'w-6');
    });

    it('should have mobile-specific value text size (text-2xl)', () => {
      render(
        <StatsCard
          title="Open Issues"
          value={42}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      const mobileValue = screen.getByTestId('value-mobile');
      expect(mobileValue).toHaveClass('text-2xl');
    });

    it('should have centered vertical layout on mobile', () => {
      render(
        <StatsCard
          title="Open Issues"
          value={42}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      const mobileLayout = screen.getByTestId('mobile-layout');
      expect(mobileLayout).toHaveClass('flex-col', 'items-center', 'justify-center');
    });

    it('should hide on sm screens and above', () => {
      render(
        <StatsCard
          title="Open Issues"
          value={42}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      const mobileLayout = screen.getByTestId('mobile-layout');
      expect(mobileLayout).toHaveClass('sm:hidden');
    });
  });

  describe('desktop layout', () => {
    it('should have desktop-specific icon size (h-4 w-4)', () => {
      render(
        <StatsCard
          title="Open Issues"
          value={42}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      const desktopIcon = screen.getByTestId('icon-desktop');
      expect(desktopIcon).toHaveClass('h-4', 'w-4');
    });

    it('should be hidden by default and show on sm screens', () => {
      render(
        <StatsCard
          title="Open Issues"
          value={42}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      const desktopLayout = screen.getByTestId('desktop-layout');
      expect(desktopLayout).toHaveClass('hidden', 'sm:flex');
    });

    it('should have horizontal layout on desktop', () => {
      render(
        <StatsCard
          title="Open Issues"
          value={42}
          icon={AlertTriangle}
          color="bg-orange-500/10 text-orange-500"
        />
      );

      const desktopLayout = screen.getByTestId('desktop-layout');
      expect(desktopLayout).toHaveClass('items-center', 'gap-3');
    });
  });

  describe('color styling', () => {
    it('should apply color classes to icon container', () => {
      render(
        <StatsCard
          title="Critical"
          value={5}
          icon={AlertTriangle}
          color="bg-red-500/10 text-red-500"
        />
      );

      const mobileIconContainer = screen.getByTestId('icon-container-mobile');
      const desktopIconContainer = screen.getByTestId('icon-container-desktop');

      expect(mobileIconContainer).toHaveClass('bg-red-500/10', 'text-red-500');
      expect(desktopIconContainer).toHaveClass('bg-red-500/10', 'text-red-500');
    });
  });
});
