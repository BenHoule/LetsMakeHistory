import { env as publicEnv } from '$env/dynamic/public';

const API_BASE =
  publicEnv.PUBLIC_API_URL && publicEnv.PUBLIC_API_URL !== '__SAME_ORIGIN__'
    ? publicEnv.PUBLIC_API_URL
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

  // Some endpoints return empty bodies (e.g. 204), so parse text first.
  const raw = await res.text();
  let payload: T | { error?: string } | undefined;
  if (raw) {
    try {
      payload = JSON.parse(raw) as T | { error?: string };
    } catch {
      payload = undefined;
    }
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : `${method} ${path} -> ${res.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  get:     <T>(path: string)                                    => request<T>('GET',  path),
  post:    <T>(path: string, body: unknown)                     => request<T>('POST', path, body),
  gmGet:   <T>(path: string, gmToken: string)                   => request<T>('GET',  path, undefined, { 'x-gm-token': gmToken }),
  gmPost:   <T>(path: string, gmToken: string, body?: unknown)   => request<T>('POST',   path, body,      { 'x-gm-token': gmToken }),
  gmPut:    <T>(path: string, gmToken: string, body?: unknown)   => request<T>('PUT',    path, body,      { 'x-gm-token': gmToken }),
  gmDelete: <T>(path: string, gmToken: string)                   => request<T>('DELETE', path, undefined, { 'x-gm-token': gmToken }),
};

