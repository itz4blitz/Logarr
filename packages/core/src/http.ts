/**
 * Shared HTTP utilities for provider clients
 * Provides consistent timeout handling, error messages, and retry logic
 */

/** Default timeout for HTTP requests (10 seconds) */
export const DEFAULT_TIMEOUT_MS = 10000;

/** Default number of retries for transient failures */
export const DEFAULT_RETRIES = 2;

/** Delay between retries (1 second) */
export const RETRY_DELAY_MS = 1000;

/**
 * Error types for better categorization and user feedback
 */
export type HttpErrorType =
  | 'timeout'
  | 'network'
  | 'dns'
  | 'connection_refused'
  | 'ssl'
  | 'unauthorized'
  | 'not_found'
  | 'server_error'
  | 'unknown';

/**
 * Enhanced error class with categorized error types
 */
export class HttpError extends Error {
  readonly type: HttpErrorType;
  readonly statusCode: number | undefined;
  readonly url: string;
  readonly suggestion: string;

  constructor(
    message: string,
    type: HttpErrorType,
    url: string,
    statusCode?: number
  ) {
    super(message);
    this.name = 'HttpError';
    this.type = type;
    this.statusCode = statusCode;
    this.url = url;
    this.suggestion = HttpError.getSuggestion(type, url);
  }

  static getSuggestion(type: HttpErrorType, url: string): string {
    const urlObj = new URL(url);
    const isLocalhost =
      urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';

    switch (type) {
      case 'timeout':
        return 'The server took too long to respond. Check if the server is running and accessible.';
      case 'network':
        return 'Could not reach the server. Check your network connection and firewall settings.';
      case 'dns':
        return `Could not resolve hostname "${urlObj.hostname}". Check if the hostname is correct.`;
      case 'connection_refused':
        if (isLocalhost) {
          return `Connection refused. If running in Docker, use "host.docker.internal" instead of "localhost" to reach services on the host machine.`;
        }
        return 'Connection refused. Check if the server is running and the port is correct.';
      case 'ssl':
        return 'SSL/TLS certificate error. Check if the server has a valid certificate or try using HTTP instead of HTTPS.';
      case 'unauthorized':
        return 'Authentication failed. Check if the API key is correct and has not expired.';
      case 'not_found':
        return 'The API endpoint was not found. Check if the URL is correct and includes the correct path.';
      case 'server_error':
        return 'The server returned an error. Check the server logs for more details.';
      default:
        return 'An unexpected error occurred. Check the server URL and credentials.';
    }
  }
}

/**
 * Categorize an error based on its message and properties
 */
function categorizeError(error: unknown, url: string): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // DNS resolution errors
  if (
    lowerMessage.includes('getaddrinfo') ||
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('dns')
  ) {
    return new HttpError(
      `DNS resolution failed for ${new URL(url).hostname}: ${message}`,
      'dns',
      url
    );
  }

  // Connection refused
  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('connection refused')
  ) {
    return new HttpError(
      `Connection refused to ${url}: ${message}`,
      'connection_refused',
      url
    );
  }

  // Timeout errors
  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('etimedout') ||
    lowerMessage.includes('aborted')
  ) {
    return new HttpError(`Request timed out for ${url}`, 'timeout', url);
  }

  // SSL/TLS errors
  if (
    lowerMessage.includes('ssl') ||
    lowerMessage.includes('tls') ||
    lowerMessage.includes('certificate') ||
    lowerMessage.includes('cert')
  ) {
    return new HttpError(
      `SSL/TLS error connecting to ${url}: ${message}`,
      'ssl',
      url
    );
  }

  // Network errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch failed') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('socket')
  ) {
    return new HttpError(
      `Network error connecting to ${url}: ${message}`,
      'network',
      url
    );
  }

  // Unknown error
  return new HttpError(
    `Failed to connect to ${url}: ${message}`,
    'unknown',
    url
  );
}

/**
 * Options for HTTP requests
 */
export interface HttpRequestOptions {
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Number of retries for transient failures (default: 2) */
  retries?: number;
  /** Additional headers to include */
  headers?: Record<string, string>;
  /** Request method (default: GET) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request body for POST/PUT/PATCH */
  body?: unknown;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: HttpError): boolean {
  // Retry on timeout, network issues, and server errors (5xx)
  return (
    error.type === 'timeout' ||
    error.type === 'network' ||
    error.type === 'server_error'
  );
}

/**
 * Make an HTTP request with timeout, retries, and enhanced error handling
 */
export async function httpRequest<T>(
  url: string,
  options: HttpRequestOptions = {}
): Promise<T> {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    headers = {},
    method = 'GET',
    body,
  } = options;

  let lastError: HttpError | null = null;
  let attempts = 0;

  while (attempts <= retries) {
    attempts++;

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...headers,
          },
          signal: controller.signal,
        };

        if (body !== undefined) {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);

        clearTimeout(timeoutId);

        // Handle HTTP errors
        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');

          let errorType: HttpErrorType = 'unknown';
          if (response.status === 401 || response.status === 403) {
            errorType = 'unauthorized';
          } else if (response.status === 404) {
            errorType = 'not_found';
          } else if (response.status >= 500) {
            errorType = 'server_error';
          }

          throw new HttpError(
            `HTTP ${response.status} ${response.statusText}: ${errorText}`,
            errorType,
            url,
            response.status
          );
        }

        return (await response.json()) as T;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Handle abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new HttpError(
          `Request timed out after ${timeout}ms`,
          'timeout',
          url
        );
      } else {
        lastError = categorizeError(error, url);
      }

      // Check if we should retry
      if (attempts <= retries && isRetryableError(lastError)) {
        await sleep(RETRY_DELAY_MS * attempts); // Exponential-ish backoff
        continue;
      }

      throw lastError;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError ?? new HttpError('Unknown error', 'unknown', url);
}

/**
 * Format an HttpError for user display
 */
export function formatHttpError(error: HttpError): string {
  return `${error.message}\n\nSuggestion: ${error.suggestion}`;
}
