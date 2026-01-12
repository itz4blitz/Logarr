import { LocalOnlyGuard } from './local-only.guard';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { describe, it, expect, beforeEach } from 'vitest';

describe('LocalOnlyGuard', () => {
  let guard: LocalOnlyGuard;

  beforeEach(() => {
    guard = new LocalOnlyGuard();
  });

  const createMockExecutionContext = (request: {
    headers?: Record<string, string | string[] | undefined>;
    socket?: { remoteAddress?: string };
    ip?: string;
    url?: string;
  }): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  describe('canActivate with private IPs', () => {
    it('should allow localhost IPv4 address', () => {
      const context = createMockExecutionContext({
        ip: '127.0.0.1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow 127.0.0.0/8 range', () => {
      const context = createMockExecutionContext({
        ip: '127.0.0.5',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow 127.1.1.1', () => {
      const context = createMockExecutionContext({
        ip: '127.1.1.1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow 10.0.0.0/8 private range', () => {
      const context = createMockExecutionContext({
        ip: '10.0.0.1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow 10.255.255.255', () => {
      const context = createMockExecutionContext({
        ip: '10.255.255.255',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow 172.16.0.0/12 private range (start)', () => {
      const context = createMockExecutionContext({
        ip: '172.16.0.1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow 172.31.255.255 (end of private Class B)', () => {
      const context = createMockExecutionContext({
        ip: '172.31.255.255',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow 172.20.5.1 (middle of private Class B)', () => {
      const context = createMockExecutionContext({
        ip: '172.20.5.1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject 172.15.255.255 (just before private Class B)', () => {
      const context = createMockExecutionContext({
        ip: '172.15.255.255',
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should reject 172.32.0.1 (just after private Class B)', () => {
      const context = createMockExecutionContext({
        ip: '172.32.0.1',
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should allow 192.168.0.0/16 private range', () => {
      const context = createMockExecutionContext({
        ip: '192.168.1.1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow 192.168.255.255', () => {
      const context = createMockExecutionContext({
        ip: '192.168.255.255',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow IPv6 loopback ::1', () => {
      const context = createMockExecutionContext({
        ip: '::1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow IPv6 loopback 0:0:0:0:0:0:0:1', () => {
      const context = createMockExecutionContext({
        ip: '0:0:0:0:0:0:0:1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow IPv6 private fc00:: range', () => {
      const context = createMockExecutionContext({
        ip: 'fc00::1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow IPv6 private fc00:abcd::1', () => {
      const context = createMockExecutionContext({
        ip: 'fc00:abcd::1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow IPv6 link-local fe80:: range', () => {
      const context = createMockExecutionContext({
        ip: 'fe80::1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow IPv6 private fec0:: range', () => {
      const context = createMockExecutionContext({
        ip: 'fec0::1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow IPv6-mapped IPv4 addresses', () => {
      const context = createMockExecutionContext({
        ip: '::ffff:127.0.0.1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow IPv6-mapped IPv4 private 192.168.x.x', () => {
      const context = createMockExecutionContext({
        ip: '::ffff:192.168.1.1',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow literal "localhost" string', () => {
      const context = createMockExecutionContext({
        ip: 'localhost',
        headers: {},
      });

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('canActivate with public IPs', () => {
    it('should reject 8.8.8.8 (Google DNS)', () => {
      const context = createMockExecutionContext({
        ip: '8.8.8.8',
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should reject 1.1.1.1 (Cloudflare DNS)', () => {
      const context = createMockExecutionContext({
        ip: '1.1.1.1',
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should reject 172.15.255.255', () => {
      const context = createMockExecutionContext({
        ip: '172.15.255.255',
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should reject 192.169.0.1', () => {
      const context = createMockExecutionContext({
        ip: '192.169.0.1',
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should reject IPv6 2001:4860:4860::8888', () => {
      const context = createMockExecutionContext({
        ip: '2001:4860:4860::8888',
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('X-Forwarded-For header handling', () => {
    it('should extract IP from X-Forwarded-For header (string)', () => {
      const context = createMockExecutionContext({
        ip: '1.2.3.4',
        headers: { 'x-forwarded-for': '192.168.1.100' },
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should extract first IP from X-Forwarded-For with multiple IPs', () => {
      const context = createMockExecutionContext({
        ip: '1.2.3.4',
        headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1, 172.16.0.1' },
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should extract IP from X-Forwarded-For header (array)', () => {
      const context = createMockExecutionContext({
        ip: '1.2.3.4',
        headers: { 'x-forwarded-for': ['127.0.0.1'] },
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject public IP from X-Forwarded-For', () => {
      const context = createMockExecutionContext({
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '8.8.8.8' },
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('X-Real-IP header handling', () => {
    it('should extract IP from X-Real-IP header', () => {
      const context = createMockExecutionContext({
        ip: '1.2.3.4',
        headers: { 'x-real-ip': '10.0.0.5' },
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should extract IP from X-Real-IP header (array)', () => {
      const context = createMockExecutionContext({
        ip: '1.2.3.4',
        headers: { 'x-real-ip': ['192.168.1.50'] },
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject public IP from X-Real-IP', () => {
      const context = createMockExecutionContext({
        ip: '127.0.0.1',
        headers: { 'x-real-ip': '1.1.1.1' },
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Header priority', () => {
    it('should prioritize X-Forwarded-For over X-Real-IP', () => {
      const context = createMockExecutionContext({
        ip: '1.2.3.4',
        headers: {
          'x-forwarded-for': '192.168.1.100',
          'x-real-ip': '8.8.8.8',
        },
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should use X-Real-IP when X-Forwarded-For is not present', () => {
      const context = createMockExecutionContext({
        ip: '1.2.3.4',
        headers: { 'x-real-ip': '10.0.0.5' },
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should fall back to socket remote address', () => {
      const context = createMockExecutionContext({
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should fall back to request.ip when socket address is not available', () => {
      const context = createMockExecutionContext({
        headers: {},
        ip: '10.0.0.1',
      });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('should return "unknown" when no IP can be determined', () => {
      const context = createMockExecutionContext({
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('ForbiddenException message', () => {
    it('should include helpful message for non-private IPs', () => {
      const context = createMockExecutionContext({
        ip: '8.8.8.8',
        headers: {},
      });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        'only accessible from local networks'
      );
    });
  });
});
