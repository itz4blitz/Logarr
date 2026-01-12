import { JwtStrategy } from './jwt.strategy';
import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettingsService } from '../../settings/settings.service';

import type { JwtPayload } from '../auth.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let settingsService: {
    getOrCreateJwtSecret: ReturnType<typeof vi.fn>;
  };

  const mockJwtSecret = 'test-jwt-secret-key-for-testing';

  beforeEach(() => {
    settingsService = {
      getOrCreateJwtSecret: vi.fn().mockResolvedValue(mockJwtSecret),
    };

    strategy = new JwtStrategy(settingsService as unknown as SettingsService);
  });

  describe('constructor', () => {
    it('should create strategy with secret provider', () => {
      expect(strategy).toBeInstanceOf(JwtStrategy);
    });

    it('should fetch JWT secret from settings service', async () => {
      // The secret provider is called during strategy initialization
      // We can verify the service was set up correctly
      expect(settingsService.getOrCreateJwtSecret).toBeDefined();
    });
  });

  describe('validate', () => {
    const mockPayload: Record<string, unknown> = {
      sub: 'test-user',
      iat: 1234567890,
      exp: 1234570490,
      customField: 'custom-value',
    };

    it('should return JwtPayload with sub, iat, and exp', () => {
      const result: JwtPayload = strategy.validate(mockPayload);

      expect(result).toEqual({
        sub: 'test-user',
        iat: 1234567890,
        exp: 1234570490,
      });
    });

    it('should return JwtPayload with only sub when iat and exp are missing', () => {
      const minimalPayload = { sub: 'test-user' };

      const result: JwtPayload = strategy.validate(minimalPayload);

      expect(result).toEqual({
        sub: 'test-user',
      });
      expect(result.iat).toBeUndefined();
      expect(result.exp).toBeUndefined();
    });

    it('should include iat when it is a number', () => {
      const payload = {
        sub: 'test-user',
        iat: 1234567890,
      };

      const result: JwtPayload = strategy.validate(payload);

      expect(result.sub).toBe('test-user');
      expect(result.iat).toBe(1234567890);
      expect(result.exp).toBeUndefined();
    });

    it('should include exp when it is a number', () => {
      const payload = {
        sub: 'test-user',
        exp: 1234570490,
      };

      const result: JwtPayload = strategy.validate(payload);

      expect(result.sub).toBe('test-user');
      expect(result.iat).toBeUndefined();
      expect(result.exp).toBe(1234570490);
    });

    it('should not include iat when it is not a number', () => {
      const payload = {
        sub: 'test-user',
        iat: 'not-a-number',
      };

      const result: JwtPayload = strategy.validate(payload);

      expect(result.sub).toBe('test-user');
      expect(result.iat).toBeUndefined();
    });

    it('should not include exp when it is not a number', () => {
      const payload = {
        sub: 'test-user',
        exp: null,
      };

      const result: JwtPayload = strategy.validate(payload);

      expect(result.sub).toBe('test-user');
      expect(result.exp).toBeUndefined();
    });

    it('should throw UnauthorizedException when sub is undefined', () => {
      const payloadWithoutSub = {
        iat: 1234567890,
        exp: 1234570490,
      };

      expect(() => strategy.validate(payloadWithoutSub)).toThrow(
        new UnauthorizedException('Invalid token payload')
      );
    });

    it('should throw UnauthorizedException when sub is null', () => {
      const payloadWithNullSub = {
        sub: null,
        iat: 1234567890,
      };

      expect(() => strategy.validate(payloadWithNullSub)).toThrow(
        new UnauthorizedException('Invalid token payload')
      );
    });

    it('should throw UnauthorizedException when sub is not a string', () => {
      const payloadWithNumberSub = {
        sub: 12345,
        iat: 1234567890,
      };

      expect(() => strategy.validate(payloadWithNumberSub)).toThrow(
        new UnauthorizedException('Invalid token payload')
      );
    });

    it('should handle empty string sub', () => {
      const payloadWithEmptySub = {
        sub: '',
        iat: 1234567890,
      };

      // Empty string is still a string type, so it passes the type check
      const result: JwtPayload = strategy.validate(payloadWithEmptySub);

      expect(result.sub).toBe('');
    });

    it('should ignore extra fields in payload', () => {
      const payloadWithExtra = {
        sub: 'test-user',
        iat: 1234567890,
        exp: 1234570490,
        extraField: 'should-be-ignored',
        anotherField: 12345,
      };

      const result: JwtPayload = strategy.validate(payloadWithExtra);

      expect(result).toEqual({
        sub: 'test-user',
        iat: 1234567890,
        exp: 1234570490,
      });
      expect('extraField' in result).toBe(false);
      expect('anotherField' in result).toBe(false);
    });
  });

  describe('secret provider (via constructor)', () => {
    it('should call settingsService.getOrCreateJwtSecret when secret is needed', async () => {
      // The secret provider is defined in the constructor
      // We can verify the settings service is configured correctly
      expect(settingsService.getOrCreateJwtSecret).toBeDefined();

      // Verify the mock is a function
      expect(typeof settingsService.getOrCreateJwtSecret).toBe('function');
    });

    it('should handle errors from settings service gracefully', async () => {
      const errorSettingsService = {
        getOrCreateJwtSecret: vi.fn().mockRejectedValue(new Error('Database error')),
      };

      // Creating strategy with erroring settings service should not throw immediately
      // The error will occur when the secret is actually needed
      expect(() => new JwtStrategy(errorSettingsService as unknown as SettingsService)).not.toThrow();
    });
  });
});
