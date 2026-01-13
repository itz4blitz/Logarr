import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';


import { SettingsService } from '../../settings/settings.service';

import type { JwtPayload } from '../auth.service';
import type { SecretOrKeyProvider } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(settingsService: SettingsService) {
    const secretProvider: SecretOrKeyProvider = async (
      _request: unknown,
      _rawJwtToken: unknown,
      done: (error: unknown, secret: string | Buffer | undefined) => void
    ): Promise<void> => {
      try {
        const secret = await settingsService.getOrCreateJwtSecret();
        done(null, secret);
      } catch (error) {
        done(error, undefined);
      }
    };

    super({
      // Extract JWT from Authorization header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Secret will be validated dynamically
      secretOrKeyProvider: secretProvider,
      // Ignore expiration - we'll handle it manually
      ignoreExpiration: false,
    });
  }

  /**
   * Validate JWT payload
   * Called automatically by Passport after token verification
   * The payload parameter is the decoded JWT object, not a string
   */
  validate(payload: Record<string, unknown>): JwtPayload {
    const sub = payload['sub'];
    if (sub === undefined || sub === null || typeof sub !== 'string') {
      throw new UnauthorizedException('Invalid token payload');
    }

    // Build result with only properties that exist in the payload
    const result: JwtPayload = { sub };

    const iat = payload['iat'];
    if (typeof iat === 'number') {
      result.iat = iat;
    }

    const exp = payload['exp'];
    if (typeof exp === 'number') {
      result.exp = exp;
    }

    return result;
  }
}
