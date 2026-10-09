import { headers } from 'next/headers'
import { normalizeRoles } from './roles'

export { SESSION_ROLES, normalizeRole, normalizeRoles } from './roles'
export type { SessionRole } from './roles'
import type { SessionRole } from './roles'

export interface EmployeeIdentity {
  id?: string
  corporateEmail: string
  displayName?: string
}

export interface EmployeeSession {
  employee: EmployeeIdentity
  roles: SessionRole[]
}

export type SessionLookup =
  | { status: 'authenticated'; session: EmployeeSession }
  | { status: 'unauthenticated' }
  | { status: 'expired' }

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '')

function parseSession(payload: unknown): EmployeeSession | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as Record<string, unknown>
  const candidate = typeof record.employee === 'object' && record.employee !== null
    ? (record.employee as Record<string, unknown>)
    : record
  const email = typeof candidate.corporateEmail === 'string'
    ? candidate.corporateEmail
    : typeof candidate.email === 'string'
      ? candidate.email
      : null

  if (!email || !email.trim()) return null

  const sourceRoles = Array.isArray(record.roles)
    ? record.roles
    : Array.isArray(candidate.roles)
      ? candidate.roles
      : []
  const roles = normalizeRoles(sourceRoles)
  const id = typeof candidate.id === 'string' ? candidate.id : undefined
  const displayName = typeof candidate.displayName === 'string' ? candidate.displayName : undefined

  return {
    employee: { ...(id ? { id } : {}), corporateEmail: email, ...(displayName ? { displayName } : {}) },
    roles,
  }
}

/** Resolve the current employee from the API session cookie without exposing raw API data. */
export async function getSession(): Promise<SessionLookup> {
  const requestHeaders = await headers()
  const cookie = requestHeaders.get('cookie')
  if (!cookie) return { status: 'unauthenticated' }

  const response = await fetch(`${API_BASE_URL}/employees/me`, {
    headers: { Accept: 'application/json', Cookie: cookie },
    cache: 'no-store',
  })
  if (response.status === 401) return { status: 'expired' }
  if (response.status === 403) return { status: 'unauthenticated' }
  if (!response.ok) throw new Error('Unable to verify the current session.')

  const session = parseSession(await response.json().catch(() => null))
  return session ? { status: 'authenticated', session } : { status: 'unauthenticated' }
}

export function hasAnyRole(session: EmployeeSession, allowedRoles: readonly SessionRole[]): boolean {
  return allowedRoles.some((role) => session.roles.includes(role))
}

export function workspaceForSession(session: EmployeeSession): string {
  if (session.roles.includes('administrator')) return '/admin'
  if (session.roles.includes('security')) return '/security/verify'
  return '/parking'
}
