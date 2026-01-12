import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { Observable } from 'rxjs';

/**
 * JWT Authentication Guard
 * Validates JWT tokens from the Authorization header
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = unknown>(err: unknown, user: TUser): TUser {
    if (err !== undefined && err !== null) {
      throw new UnauthorizedException(
        err instanceof Error ? err.message : 'Authentication required'
      );
    }
    if (user === undefined || user === null) {
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  }

  // Override to customize error handling and add return type
  override canActivate(
    context: ExecutionContext
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context) as boolean | Promise<boolean> | Observable<boolean>;
  }
}
