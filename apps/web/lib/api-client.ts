// Written by the factory: every call to the api goes through here. The api runs on 3001 (the web
// app on 3000); NEXT_PUBLIC_API_URL points elsewhere, as Test and deployments do.
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/** Calls the api, sending the browser's session cookie. */
export async function apiRequest<T>(path: string, options: Omit<RequestInit, 'credentials'> = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const details: unknown = await response.json().catch(() => undefined)
    const message =
      typeof details === 'object' && details !== null && 'message' in details && typeof details.message === 'string'
        ? details.message
        : `API request failed (${response.status})`
    throw new ApiError(response.status, message, details)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
