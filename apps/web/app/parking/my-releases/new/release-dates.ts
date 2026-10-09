/**
 * Office-local date helpers for scheduling releases. These live outside page.tsx because a Next.js
 * route file may only export the page component; tests import them from here.
 */
export const OFFICE_TIME_ZONE = process.env.NEXT_PUBLIC_OFFICE_TIME_ZONE || 'UTC'
export const RELEASE_TIME = process.env.NEXT_PUBLIC_DAILY_PARKING_RELEASE_TIME || '08:00'

export function officeDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

/** Today through 30 days ahead, the window the Spec allows for planned releases. */
export function getReleaseDateBounds(now: Date): { min: string; max: string } {
  const min = officeDate(now)
  const end = new Date(`${min}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 30)
  return { min, max: end.toISOString().slice(0, 10) }
}

export function dateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(value).toISOString().slice(0, 10)
}

export function displayDate(value: string): string {
  const [year, month, day] = dateOnly(value).split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
}

export function displayClaimableAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: OFFICE_TIME_ZONE,
  }).format(new Date(value))
}

export function claimabilityGuidance(
  release: { releaseDate: string; claimableAt: string; status?: string },
  now: Date,
): string {
  const releaseDay = dateOnly(release.releaseDate)
  const claimableAt = new Date(release.claimableAt)
  if (releaseDay > officeDate(now) || claimableAt.getTime() > now.getTime()) {
    return `Not claimable yet. This release becomes claimable ${displayClaimableAt(release.claimableAt)} office time.`
  }
  if (release.status && release.status.toUpperCase() !== 'OPEN') {
    return `This release is ${release.status.toLowerCase()} and is not available to claim.`
  }
  return `Claimable now. The configured release time has passed (${displayClaimableAt(release.claimableAt)} office time).`
}

export function statusLabel(status: string): string {
  if (status.toUpperCase() === 'OPEN') return 'Scheduled (OPEN)'
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
}
