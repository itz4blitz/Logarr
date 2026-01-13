import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Private network IP ranges
 * - 127.0.0.0/8: Loopback (localhost)
 * - 10.0.0.0/8: Private Class A
 * - 172.16.0.0/12: Private Class B
 * - 192.168.0.0/16: Private Class C
 * - ::1/128: IPv6 loopback
 * - fc00::/7: IPv6 private
 * - fe80::/10: IPv6 link-local
 */
const PRIVATE_NETWORK_PATTERNS = [
  /^127\./, // 127.0.0.0/8
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 private
  /^fe80:/i, // IPv6 link-local
  /^fe[c-f][0-9a-f]:/i, // IPv6 private continuation
];

@Injectable()
export class LocalOnlyGuard implements CanActivate {
  private readonly logger = new Logger(LocalOnlyGuard.name);

  constructor() {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = this.extractIp(request);

    if (this.isPrivateIp(ip)) {
      this.logger.debug(`Request from private IP allowed: ${ip}`);
      return true;
    }

    this.logger.warn(`Request from non-private IP rejected: ${ip}`);
    throw new ForbiddenException(
      'This endpoint is only accessible from local networks. Please access this service from the same network as the server.'
    );
  }

  /**
   * Extract IP address from request, considering proxy headers
   */
  private extractIp(request: Request): string {
    // Check X-Forwarded-For header (from reverse proxy)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor !== undefined && forwardedFor !== null) {
      // X-Forwarded-For can contain multiple IPs, take the first one (original client)
      const headerValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      if (headerValue !== undefined && headerValue !== null && headerValue !== '') {
        const parts = headerValue.split(',');
        const firstIp = parts[0]?.trim();
        if (firstIp !== undefined && firstIp !== '') {
          return firstIp;
        }
      }
    }

    // Check X-Real-IP header (from nginx, etc.)
    const realIp = request.headers['x-real-ip'];
    if (realIp !== undefined && realIp !== null) {
      const result = Array.isArray(realIp) ? realIp[0] : realIp;
      if (result !== undefined) return result;
    }

    // Fall back to remote address
    const socketAddress = request.socket?.remoteAddress;
    const requestIp = request.ip;
    return socketAddress ?? requestIp ?? 'unknown';
  }

  /**
   * Check if IP is in a private network range
   */
  private isPrivateIp(ip: string): boolean {
    // Handle IPv6-mapped IPv4 addresses (::ffff:x.x.x.x)
    const ipv4Match = ip.match(/^::ffff:([\d.]+)$/);
    if (ipv4Match !== null) {
      const match = ipv4Match[1];
      if (match !== undefined) {
        ip = match;
      }
    }

    // Handle localhost variations
    if (ip === 'localhost' || ip === '::1' || ip === '0:0:0:0:0:0:0:1') {
      return true;
    }

    // Check against private network patterns
    return PRIVATE_NETWORK_PATTERNS.some((pattern) => pattern.test(ip));
  }
}
