import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  httpRequest,
  HttpError,
  formatHttpError,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRIES,
  RETRY_DELAY_MS,
} from './http.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HTTP Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constants', () => {
    it('should have correct default timeout', () => {
      expect(DEFAULT_TIMEOUT_MS).toBe(10000);
    });

    it('should have correct default retries', () => {
      expect(DEFAULT_RETRIES).toBe(2);
    });

    it('should have correct retry delay', () => {
      expect(RETRY_DELAY_MS).toBe(1000);
    });
  });

  describe('HttpError', () => {
    it('should create error with correct properties', () => {
      const error = new HttpError('Test message', 'timeout', 'http://example.com');

      expect(error.message).toBe('Test message');
      expect(error.type).toBe('timeout');
      expect(error.url).toBe('http://example.com');
      expect(error.name).toBe('HttpError');
      expect(error.statusCode).toBeUndefined();
    });

    it('should create error with status code', () => {
      const error = new HttpError('Not found', 'not_found', 'http://example.com', 404);

      expect(error.statusCode).toBe(404);
    });

    it('should generate suggestion for timeout error', () => {
      const error = new HttpError('Timeout', 'timeout', 'http://example.com');

      expect(error.suggestion).toContain('server took too long');
    });

    it('should generate suggestion for network error', () => {
      const error = new HttpError('Network error', 'network', 'http://example.com');

      expect(error.suggestion).toContain('network connection');
    });

    it('should generate suggestion for DNS error', () => {
      const error = new HttpError('DNS error', 'dns', 'http://badhost.local');

      expect(error.suggestion).toContain('hostname');
      expect(error.suggestion).toContain('badhost.local');
    });

    it('should generate Docker suggestion for localhost connection refused', () => {
      const error = new HttpError('Connection refused', 'connection_refused', 'http://localhost:8096');

      expect(error.suggestion).toContain('host.docker.internal');
      expect(error.suggestion).toContain('Docker');
    });

    it('should generate generic suggestion for non-localhost connection refused', () => {
      const error = new HttpError('Connection refused', 'connection_refused', 'http://192.168.1.100:8096');

      expect(error.suggestion).not.toContain('host.docker.internal');
      expect(error.suggestion).toContain('server is running');
    });

    it('should generate suggestion for 127.0.0.1 connection refused', () => {
      const error = new HttpError('Connection refused', 'connection_refused', 'http://127.0.0.1:8096');

      expect(error.suggestion).toContain('host.docker.internal');
    });

    it('should generate suggestion for SSL error', () => {
      const error = new HttpError('SSL error', 'ssl', 'https://example.com');

      expect(error.suggestion).toContain('certificate');
      expect(error.suggestion).toContain('HTTP');
    });

    it('should generate suggestion for unauthorized error', () => {
      const error = new HttpError('Unauthorized', 'unauthorized', 'http://example.com');

      expect(error.suggestion).toContain('API key');
    });

    it('should generate suggestion for not found error', () => {
      const error = new HttpError('Not found', 'not_found', 'http://example.com');

      expect(error.suggestion).toContain('URL is correct');
    });

    it('should generate suggestion for server error', () => {
      const error = new HttpError('Server error', 'server_error', 'http://example.com');

      expect(error.suggestion).toContain('server logs');
    });

    it('should generate generic suggestion for unknown error', () => {
      const error = new HttpError('Unknown', 'unknown', 'http://example.com');

      expect(error.suggestion).toContain('unexpected error');
    });
  });

  describe('formatHttpError', () => {
    it('should format error with message and suggestion', () => {
      const error = new HttpError('Test error', 'timeout', 'http://example.com');
      const formatted = formatHttpError(error);

      expect(formatted).toContain('Test error');
      expect(formatted).toContain('Suggestion:');
      expect(formatted).toContain(error.suggestion);
    });
  });

  describe('httpRequest', () => {
    it('should make successful GET request', async () => {
      const mockResponse = { data: 'test' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await httpRequest('http://example.com/api');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should include default headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await httpRequest('http://example.com/api');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json',
          }),
        })
      );
    });

    it('should merge custom headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await httpRequest('http://example.com/api', {
        headers: { 'X-Api-Key': 'test-key' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Api-Key': 'test-key',
          }),
        })
      );
    });

    it('should use specified HTTP method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await httpRequest('http://example.com/api', { method: 'POST' });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should include body for POST requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const body = { name: 'test' };
      await httpRequest('http://example.com/api', { method: 'POST', body });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          body: JSON.stringify(body),
        })
      );
    });

    it('should throw HttpError for 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      });

      try {
        await httpRequest('http://example.com/api');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('unauthorized');
        expect((error as HttpError).statusCode).toBe(401);
      }
    });

    it('should throw HttpError for 403 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: () => Promise.resolve('Access denied'),
      });

      try {
        await httpRequest('http://example.com/api');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('unauthorized');
      }
    });

    it('should throw HttpError for 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Endpoint not found'),
      });

      try {
        await httpRequest('http://example.com/api');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('not_found');
        expect((error as HttpError).statusCode).toBe(404);
      }
    });

    it('should throw HttpError for 500 response', async () => {
      // Disable retries to test error categorization directly
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });

      try {
        await httpRequest('http://example.com/api', { retries: 0 });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('server_error');
        expect((error as HttpError).statusCode).toBe(500);
      }
    });

    it('should categorize DNS errors correctly', async () => {
      mockFetch.mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND badhost.local'));

      try {
        await httpRequest('http://badhost.local/api', { retries: 0 });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('dns');
      }
    });

    it('should categorize connection refused errors correctly', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:8096'));

      try {
        await httpRequest('http://localhost:8096/api', { retries: 0 });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('connection_refused');
      }
    });

    it('should categorize SSL errors correctly', async () => {
      mockFetch.mockRejectedValueOnce(new Error('SSL certificate problem'));

      try {
        await httpRequest('https://example.com/api', { retries: 0 });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('ssl');
      }
    });

    it('should categorize network errors correctly', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      try {
        await httpRequest('http://example.com/api', { retries: 0 });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('network');
      }
    });

    it('should retry on timeout errors', async () => {
      // First two calls fail, third succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

      const promise = httpRequest('http://example.com/api', { retries: 2 });

      // Advance timers for retry delays
      await vi.advanceTimersByTimeAsync(1000); // First retry delay
      await vi.advanceTimersByTimeAsync(2000); // Second retry delay

      const result = await promise;
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should retry on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

      const promise = httpRequest('http://example.com/api', { retries: 1 });

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on server errors (5xx)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          text: () => Promise.resolve('Server temporarily unavailable'),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });

      const promise = httpRequest('http://example.com/api', { retries: 1 });

      await vi.advanceTimersByTimeAsync(1000);

      const result = await promise;
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should NOT retry on 401 errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      });

      await expect(httpRequest('http://example.com/api', { retries: 2 })).rejects.toThrow(
        HttpError
      );

      // Should only be called once - no retries for auth errors
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 404 errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve('Not found'),
      });

      await expect(httpRequest('http://example.com/api', { retries: 2 })).rejects.toThrow(
        HttpError
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on DNS errors', async () => {
      mockFetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

      await expect(httpRequest('http://badhost.local/api', { retries: 2 })).rejects.toThrow(
        HttpError
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should respect custom timeout option', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await httpRequest('http://example.com/api', { timeout: 5000 });

      // The signal should be passed to fetch
      expect(mockFetch).toHaveBeenCalledWith(
        'http://example.com/api',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should respect retries: 0 option', async () => {
      mockFetch.mockRejectedValue(new Error('timeout'));

      await expect(httpRequest('http://example.com/api', { retries: 0 })).rejects.toThrow(
        HttpError
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle abort error as timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await httpRequest('http://example.com/api', { retries: 0 });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('timeout');
        expect((error as HttpError).message).toContain('timed out');
      }
    });

    it('should handle non-Error throws', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      try {
        await httpRequest('http://example.com/api', { retries: 0 });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).type).toBe('unknown');
      }
    });

    it('should handle response.text() failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.reject(new Error('Failed to read body')),
      });

      try {
        await httpRequest('http://example.com/api', { retries: 0 });
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError);
        expect((error as HttpError).message).toContain('Unknown error');
      }
    });
  });
});
