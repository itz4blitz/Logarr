import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollArea, ScrollBar } from './scroll-area';

describe('ScrollArea', () => {
  it('should render children content', () => {
    render(
      <ScrollArea>
        <div>Scroll content</div>
      </ScrollArea>
    );

    expect(screen.getByText('Scroll content')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <ScrollArea className="custom-class">
        <div>Content</div>
      </ScrollArea>
    );

    const scrollArea = container.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).toHaveClass('custom-class');
  });

  it('should render with relative positioning for layout', () => {
    const { container } = render(
      <ScrollArea>
        <div>Content</div>
      </ScrollArea>
    );

    const scrollArea = container.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).toHaveClass('relative');
  });

  it('should render viewport slot', () => {
    const { container } = render(
      <ScrollArea>
        <div>Content</div>
      </ScrollArea>
    );

    const viewport = container.querySelector('[data-slot="scroll-area-viewport"]');
    expect(viewport).toBeInTheDocument();
  });

  it('should handle long content', () => {
    const longContent = Array.from({ length: 100 }, (_, i) => (
      <div key={i}>Line {i + 1}</div>
    ));

    render(<ScrollArea className="h-[200px]">{longContent}</ScrollArea>);

    expect(screen.getByText('Line 1')).toBeInTheDocument();
    expect(screen.getByText('Line 100')).toBeInTheDocument();
  });

  it('should pass alwaysShowScrollbar prop correctly', () => {
    // Test that the component accepts the prop without errors
    const { container } = render(
      <ScrollArea alwaysShowScrollbar>
        <div>Content</div>
      </ScrollArea>
    );

    const scrollArea = container.querySelector('[data-slot="scroll-area"]');
    expect(scrollArea).toBeInTheDocument();
  });
});
