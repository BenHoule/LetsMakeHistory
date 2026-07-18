import { PUBLIC_API_URL } from '$env/static/public';

const API_BASE =
  PUBLIC_API_URL && PUBLIC_API_URL !== '__SAME_ORIGIN__'
    ? PUBLIC_API_URL
    : '';

/**
 * Makes an HTTP request to the API.
 * @param method The HTTP method (e.g., 'GET', 'POST').
 * @param path The API endpoint path.
 * @param body The request body, if applicable.
 * @returns The parsed JSON response.
 */
async function request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${method} ${path} \u2192 ${res.status}`);
  }
    let message = `${method} ${path} -> ${res.status}`;
    try {
      const payload = await res.json() as { error?: string };
      if (payload?.error) message = payload.error;
    } catch {
      // Ignore unparseable error bodies and fall back to the HTTP status.
    }
    throw new Error(message);
}

export const api = {
  get:     <T>(path: string)                                    => request<T>('GET',  path),
  post:    <T>(path: string, body: unknown)                     => request<T>('POST', path, body),
  gmGet:   <T>(path: string, gmToken: string)                   => request<T>('GET',  path, undefined, { 'x-gm-token': gmToken }),
  gmPost:   <T>(path: string, gmToken: string, body?: unknown)   => request<T>('POST',   path, body,      { 'x-gm-token': gmToken }),
  gmPut:    <T>(path: string, gmToken: string, body?: unknown)   => request<T>('PUT',    path, body,      { 'x-gm-token': gmToken }),
  gmDelete: <T>(path: string, gmToken: string)                   => request<T>('DELETE', path, undefined, { 'x-gm-token': gmToken }),
};

