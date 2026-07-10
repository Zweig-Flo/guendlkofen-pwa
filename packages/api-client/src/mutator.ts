/**
 * Custom fetch mutator used by all Orval-generated API functions.
 *
 * Configure once at app startup:
 *   setBaseUrl('http://localhost:3000')
 *   setAuthTokenProvider(() => getAccessTokenSilently())
 */

type TokenProvider = () => string | Promise<string>;

let baseUrl = '';
let tokenProvider: TokenProvider | null = null;

/** Sets the API base URL prefixed to every request (no trailing slash needed). */
export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '');
}

/**
 * Registers a function that resolves the current access token.
 * Pass null to stop sending Authorization headers (e.g. after logout).
 */
export function setAuthTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

/** Error thrown for non-2xx responses, carrying HTTP status and parsed body. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

export async function customFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const headers = new Headers(options?.headers);
  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(`${baseUrl}${url}`, { ...options, headers });

  let body: unknown = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      const contentType = response.headers.get('content-type') ?? '';
      body = contentType.includes('application/json') ? JSON.parse(text) : text;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  return body as T;
}
