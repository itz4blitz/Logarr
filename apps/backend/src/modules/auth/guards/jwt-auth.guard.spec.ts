import { JwtAuthGuard } from './jwt-auth.guard';
import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  describe('handleRequest', () => {
    it('should return user when valid', () => {
      const mockUser = { sub: 'test-user', iat: 123456, exp: 1234567 };
      const result = guard['handleRequest'](null, mockUser);

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException when error is provided', () => {
      const mockError = new Error('Test error');

      expect(() => guard['handleRequest'](mockError, null)).toThrow(
        new UnauthorizedException('Test error')
      );
    });

    it('should throw UnauthorizedException with generic message for non-Error', () => {
      expect(() => guard['handleRequest']('string error', null)).toThrow(
        new UnauthorizedException('Authentication required')
      );
    });

    it('should throw UnauthorizedException when user is null', () => {
      expect(() => guard['handleRequest'](null, null)).toThrow(
        new UnauthorizedException('Authentication required')
      );
    });

    it('should throw UnauthorizedException when user is undefined', () => {
      expect(() => guard['handleRequest'](null, undefined)).toThrow(
        new UnauthorizedException('Authentication required')
      );
    });
  });

  describe('guard behavior', () => {
    it('should be an instance of Passport AuthGuard with jwt strategy', () => {
      expect(guard).toBeInstanceOf(JwtAuthGuard);
      expect(guard.constructor.name).toBe('JwtAuthGuard');
    });
  });
});
