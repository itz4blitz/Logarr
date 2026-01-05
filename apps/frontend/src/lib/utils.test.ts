import { describe, it, expect } from 'vitest';

import { cn } from './utils';

describe('cn (classname utility)', () => {
  describe('basic merging', () => {
    it('should merge class strings', () => {
      const result = cn('class1', 'class2');
      expect(result).toBe('class1 class2');
    });

    it('should handle single class', () => {
      const result = cn('class1');
      expect(result).toBe('class1');
    });

    it('should handle empty inputs', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should filter out falsy values', () => {
      const result = cn('class1', undefined, null, false, 'class2');
      expect(result).toBe('class1 class2');
    });
  });

  describe('conditional classes', () => {
    it('should handle conditional class objects', () => {
      const result = cn({
        class1: true,
        class2: false,
        class3: true,
      });
      expect(result).toBe('class1 class3');
    });

    it('should handle mixed inputs', () => {
      const result = cn('base-class', { 'conditional-class': true }, 'another-class');
      expect(result).toBe('base-class conditional-class another-class');
    });

    it('should handle false condition', () => {
      const isActive = false;
      const result = cn('button', { 'button-active': isActive });
      expect(result).toBe('button');
    });

    it('should handle true condition', () => {
      const isActive = true;
      const result = cn('button', { 'button-active': isActive });
      expect(result).toBe('button button-active');
    });
  });

  describe('tailwind merge', () => {
    it('should merge conflicting tailwind classes', () => {
      const result = cn('p-4', 'p-6');
      expect(result).toBe('p-6');
    });

    it('should merge conflicting margin classes', () => {
      const result = cn('m-2', 'm-4');
      expect(result).toBe('m-4');
    });

    it('should merge conflicting text colors', () => {
      const result = cn('text-red-500', 'text-blue-500');
      expect(result).toBe('text-blue-500');
    });

    it('should merge conflicting background colors', () => {
      const result = cn('bg-white', 'bg-black');
      expect(result).toBe('bg-black');
    });

    it('should keep non-conflicting classes', () => {
      const result = cn('p-4', 'm-2');
      expect(result).toBe('p-4 m-2');
    });

    it('should handle complex tailwind overrides', () => {
      const result = cn('text-sm font-medium text-gray-900', 'text-base text-white');
      expect(result).toBe('font-medium text-base text-white');
    });
  });

  describe('array inputs', () => {
    it('should handle array of classes', () => {
      const result = cn(['class1', 'class2']);
      expect(result).toBe('class1 class2');
    });

    it('should handle nested arrays', () => {
      const result = cn(['class1', ['class2', 'class3']]);
      expect(result).toBe('class1 class2 class3');
    });
  });

  describe('real world usage', () => {
    it('should handle button variant pattern', () => {
      const isPrimary = true;
      const isDisabled = false;
      const result = cn('px-4 py-2 rounded font-medium', {
        'bg-blue-500 text-white': isPrimary,
        'bg-gray-200 text-gray-700': !isPrimary,
        'opacity-50 cursor-not-allowed': isDisabled,
      });
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('text-white');
      expect(result).not.toContain('opacity-50');
    });

    it('should handle responsive classes', () => {
      const result = cn('text-sm md:text-base lg:text-lg');
      expect(result).toBe('text-sm md:text-base lg:text-lg');
    });

    it('should handle hover/focus states', () => {
      const result = cn('bg-blue-500 hover:bg-blue-600 focus:ring-2');
      expect(result).toBe('bg-blue-500 hover:bg-blue-600 focus:ring-2');
    });
  });
});
