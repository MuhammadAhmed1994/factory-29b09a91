// Written by the factory: the api reports granted roles with its own enum spelling
// (EMPLOYEE / SECURITY_GUARD / PARKING_ADMINISTRATOR). Every screen gates on the web's
// vocabulary instead, so both the server guard and the client screens normalize here --
// comparing an api role string directly against 'employee' silently denies a valid session.
export const SESSION_ROLES = ['employee', 'security', 'administrator'] as const
export type SessionRole = (typeof SESSION_ROLES)[number]

export function normalizeRole(value: unknown): SessionRole | null {
  if (typeof value !== 'string') return null
  switch (value.trim().toLowerCase()) {
    case 'employee':
      return 'employee'
    case 'security':
    case 'security_guard':
      return 'security'
    case 'admin':
    case 'administrator':
    case 'parking_administrator':
      return 'administrator'
    default:
      return null
  }
}

/** Every recognised role in an api payload, de-duplicated and in the web's vocabulary. */
export function normalizeRoles(value: unknown): SessionRole[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(normalizeRole).filter((role): role is SessionRole => role !== null))]
}
