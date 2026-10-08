'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiRequest } from '../../../lib/api-client'
import { AccessDenied, ApplicationShell } from '../../../components/operations'
import type { EmployeeIdentity, SessionRole } from '../../../lib/session'
import styles from './page.module.css'

interface Space {
  id: string
  spaceCode: string
  floor?: number
  floorName?: string | null
}

interface AvailableRelease {
  id: string
  status: string
  releaseDate: string
  parkingSpace?: Space
}

interface AvailabilityResponse {
  spaces: AvailableRelease[]
}

interface ClaimResponse {
  status: string
  claimant: { displayName: string; corporateEmail?: string }
  allocationDate: string
  allocatedAt: string
  assignedFloor: number | string
  spaceCode: string
}

interface SessionResponse {
  employee?: EmployeeIdentity & { roles?: SessionRole[] }
  corporateEmail?: string
  displayName?: string
  roles?: SessionRole[]
}

const OFFICE_TIME_ZONE = process.env.NEXT_PUBLIC_OFFICE_TIME_ZONE || 'America/Los_Angeles'

function officeDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: OFFICE_TIME_ZONE,
  }).format(date)
}

function allocationDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: OFFICE_TIME_ZONE,
  }).format(date)
}

function allocationTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: OFFICE_TIME_ZONE,
  }).format(date)
}

function isUnavailable(error: unknown) {
  return error instanceof ApiError && error.status === 409
}

export function AvailableParkingScreen() {
  const [spaces, setSpaces] = useState<AvailableRelease[]>([])
  const [availabilityState, setAvailabilityState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [availabilityError, setAvailabilityError] = useState('')
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [claimError, setClaimError] = useState('')
  const [claimSuccess, setClaimSuccess] = useState<ClaimResponse | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(async () => {
    setAvailabilityState('loading')
    setAvailabilityError('')
    setSpaces([])
    try {
      const response = await apiRequest<AvailableRelease[] | AvailabilityResponse>('/parking/availability', { cache: 'no-store' })
      const releases = Array.isArray(response) ? response : response.spaces
      // The endpoint returns only claimable releases. Ignore non-open/malformed records defensively.
      const claimable = (Array.isArray(releases) ? releases : []).filter(
        (release) => release.status === 'OPEN' && Boolean(release.parkingSpace?.spaceCode),
      )
      setSpaces(claimable)
      setAvailabilityState(claimable.length ? 'ready' : 'empty')
    } catch {
      setAvailabilityError("Availability couldn't be loaded. Try again.")
      setAvailabilityState('error')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh, refreshKey])

  const officeDate = useMemo(() => officeDateLabel(), [])

  async function claim(release: AvailableRelease) {
    if (availabilityState !== 'ready' || claimingId || !release.parkingSpace) return
    setClaimingId(release.id)
    setClaimError('')
    setClaimSuccess(null)
    try {
      const result = await apiRequest<ClaimResponse>(`/parking/releases/${encodeURIComponent(release.id)}/claims`, { method: 'POST' })
      if (result.status !== 'CLAIMED') throw new Error('The claim was not confirmed.')
      setClaimSuccess(result)
      setSpaces((current) => current.filter((item) => item.id !== release.id))
      setAvailabilityState((current) => current === 'ready' && spaces.length <= 1 ? 'empty' : current)
    } catch (error) {
      if (isUnavailable(error)) {
        setClaimError(`Space ${release.parkingSpace.spaceCode} is unavailable. Another employee claimed it first. Availability has been refreshed.`)
        setRefreshKey((current) => current + 1)
      } else {
        setClaimError('Your claim could not be confirmed. Refresh availability before trying again.')
        setAvailabilityState('error')
        setSpaces([])
      }
    } finally {
      setClaimingId(null)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div>
          <div className={styles.breadcrumb}>Workspace <span aria-hidden="true">›</span> <span>Parking</span></div>
          <h1>Available parking</h1>
          <p className={styles.subtitle}>Find and claim a released space at your office.</p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => { setClaimError(''); setRefreshKey((current) => current + 1) }} disabled={availabilityState === 'loading' || Boolean(claimingId)}>
          <span aria-hidden="true">↻</span> Refresh availability
        </button>
      </div>

      <section className={styles.summary} aria-label="Today's parking availability">
        <div>
          <div className={styles.eyebrow}>Today's availability · Office time</div>
          <div className={styles.date}>{officeDate}</div>
          <p>Spaces are assigned first come, first served. Availability may change while you decide.</p>
        </div>
        <div className={styles.count} aria-live="polite">
          <strong>{availabilityState === 'ready' ? spaces.length : availabilityState === 'empty' ? 0 : '—'}</strong>
          <span>spaces claimable</span>
        </div>
      </section>

      {claimSuccess && (
        <section className={`${styles.result} ${styles.success}`} role="status" aria-live="polite">
          <div className={styles.resultHeading}><span aria-hidden="true">✓</span><div><p>Your request is confirmed</p><h2>Parking space claimed</h2></div></div>
          <dl>
            <div><dt>Assigned space</dt><dd>{claimSuccess.spaceCode}</dd></div>
            <div><dt>Assigned floor</dt><dd>{claimSuccess.assignedFloor}</dd></div>
            <div><dt>Claimed by</dt><dd>{claimSuccess.claimant.displayName || claimSuccess.claimant.corporateEmail}</dd></div>
            <div><dt>Allocation date and time</dt><dd>{allocationDate(claimSuccess.allocationDate)} · {allocationTime(claimSuccess.allocatedAt)} office time</dd></div>
          </dl>
        </section>
      )}

      {claimError && <p className={styles.unavailable} role="status" aria-live="polite">{claimError}</p>}

      <section className={styles.spacesSection} aria-labelledby="spaces-heading">
        <div className={styles.sectionHeading}>
          <div><h2 id="spaces-heading">Claimable spaces</h2><p>These spaces are available to request right now.</p></div>
          {availabilityState === 'ready' && <span className={styles.confirmed}>✓ Availability confirmed</span>}
        </div>

        {availabilityState === 'loading' && <div className={styles.state} role="status" aria-live="polite" aria-busy="true">Checking available spaces…</div>}
        {availabilityState === 'error' && <div className={styles.stateError} role="alert">{availabilityError || 'Availability could not be confirmed. Refresh to try again.'}</div>}
        {availabilityState === 'empty' && <div className={styles.state} role="status">There are no claimable spaces right now.<button type="button" onClick={() => setRefreshKey((current) => current + 1)}>Refresh availability</button></div>}
        {availabilityState === 'ready' && <div className={styles.list}>
          {spaces.map((release) => {
            const space = release.parkingSpace!
            return <article className={styles.spaceCard} key={release.id}>
              <div className={styles.spaceInfo}>
                <span className={styles.spaceIcon} aria-hidden="true">P</span>
                <div><strong>{space.spaceCode}</strong>{(space.floorName || space.floor !== undefined) && <span>{space.floorName || `Level ${space.floor}`}</span>}</div>
              </div>
              <button className={styles.claimButton} type="button" aria-label={`${claimingId === release.id ? 'Claiming' : 'Claim'} space ${space.spaceCode}`} onClick={() => void claim(release)} disabled={availabilityState !== 'ready' || Boolean(claimingId)}>
                {claimingId === release.id ? `Claiming ${space.spaceCode}…` : `Claim space ${space.spaceCode}`}
              </button>
            </article>
          })}
        </div>}
        <p className={styles.note}>A claim is confirmed only after the server verifies the space is still available.</p>
      </section>
    </div>
  )
}

export default function AvailableParkingPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<{ role: SessionRole; identity: EmployeeIdentity } | 'loading' | 'denied'>('loading')

  useEffect(() => {
    let active = true
    apiRequest<SessionResponse>('/employees/me').then((response) => {
      if (!active) return
      const employee = response.employee ?? response as EmployeeIdentity
      const roles = response.roles ?? response.employee?.roles ?? []
      if (!employee.corporateEmail || !roles.includes('employee')) {
        setAuth('denied')
        return
      }
      setAuth({ role: 'employee', identity: employee })
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) router.replace('/sign-in?reason=session-expired')
      else router.replace('/sign-in')
    })
    return () => { active = false }
  }, [router])

  if (auth === 'loading') return <main className={styles.authLoading} role="status">Checking your session…</main>
  if (auth === 'denied') return <ApplicationShell authState="unauthenticated"><AccessDenied /></ApplicationShell>
  return <ApplicationShell role={auth.role} identity={auth.identity} authState="authenticated"><AvailableParkingScreen /></ApplicationShell>
}
