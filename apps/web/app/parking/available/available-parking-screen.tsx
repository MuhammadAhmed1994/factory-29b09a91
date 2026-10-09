'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiRequest } from '../../../lib/api-client'
import { AccessDenied, ApplicationShell } from '../../../components/operations'
import type { EmployeeIdentity, SessionRole } from '../../../lib/session'
import { normalizeRoles } from '../../../lib/roles'
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

// The office zone is configuration the api owns; a hard-coded client default silently renders
// allocation times in the wrong day. It is read from the api and only falls back when unavailable.
const FALLBACK_OFFICE_TIME_ZONE = process.env.NEXT_PUBLIC_OFFICE_TIME_ZONE || 'UTC'

function officeDateLabel(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone,
  }).format(date)
}

function allocationDate(value: string, timeZone: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone,
  }).format(date)
}

function allocationTime(value: string, timeZone: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone,
  }).format(date)
}

/** Distinct floors the available spaces sit on, for a short "across ..." summary. */
function floorSummary(spaces: AvailableRelease[]): string {
  const floors = [...new Set(spaces.map((space) => space.parkingSpace?.floorName || `Level ${space.parkingSpace?.floor ?? '?'}`))]
  return floors.length ? floors.join(', ') : 'the car park'
}

function isUnavailable(error: unknown) {
  return error instanceof ApiError && error.status === 409
}

// The api refuses a claim from an employee who holds a dedicated space; that is a standing
// eligibility rule, not a lost race, so it must not read as a transient failure.
function isIneligible(error: unknown) {
  return error instanceof ApiError && error.status === 403
}

export function AvailableParkingScreen() {
  const [spaces, setSpaces] = useState<AvailableRelease[]>([])
  const [availabilityState, setAvailabilityState] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading')
  const [availabilityError, setAvailabilityError] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [claimError, setClaimError] = useState('')
  const [claimSuccess, setClaimSuccess] = useState<ClaimResponse | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [officeTimeZone, setOfficeTimeZone] = useState(FALLBACK_OFFICE_TIME_ZONE)

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

  useEffect(() => {
    apiRequest<{ officeTimeZone?: string }>('/parking/dashboard', { cache: 'no-store' })
      .then((dashboard) => { if (dashboard.officeTimeZone) setOfficeTimeZone(dashboard.officeTimeZone) })
      .catch(() => { /* the fallback zone still renders a usable label */ })
  }, [])

  const officeDate = useMemo(() => officeDateLabel(officeTimeZone), [officeTimeZone])

  /**
   * The Spec is explicit that employees do not choose a space: one request allocates whichever
   * space the system picks and reports the assigned floor back.
   */
  async function claim() {
    if (availabilityState !== 'ready' || claiming) return
    setClaiming(true)
    setClaimError('')
    setClaimSuccess(null)
    try {
      const result = await apiRequest<ClaimResponse>('/parking/claims', { method: 'POST' })
      if (result.status !== 'CLAIMED') throw new Error('The claim was not confirmed.')
      setClaimSuccess(result)
      setRefreshKey((current) => current + 1)
    } catch (error) {
      if (isUnavailable(error)) {
        setClaimError('The last space was claimed first. Availability has been refreshed.')
        setRefreshKey((current) => current + 1)
      } else if (isIneligible(error)) {
        setClaimError('Temporary spaces are for employees without a dedicated space. Release your own space instead when you are not using it.')
      } else {
        setClaimError('Your claim could not be confirmed. Refresh availability before trying again.')
        setAvailabilityState('error')
        setSpaces([])
      }
    } finally {
      setClaiming(false)
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
        <button className={styles.refreshButton} type="button" onClick={() => { setClaimError(''); setRefreshKey((current) => current + 1) }} disabled={availabilityState === 'loading' || claiming}>
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
            <div><dt>Allocation date and time</dt><dd>{allocationDate(claimSuccess.allocationDate, officeTimeZone)} · {allocationTime(claimSuccess.allocatedAt, officeTimeZone)} office time</dd></div>
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
          <article className={styles.spaceCard}>
            <div className={styles.spaceInfo}>
              <span className={styles.spaceIcon} aria-hidden="true">P</span>
              <div>
                <strong>{spaces.length} {spaces.length === 1 ? 'space' : 'spaces'} available</strong>
                <span>Across {floorSummary(spaces)}. The system assigns one and tells you the floor.</span>
              </div>
            </div>
            <button
              className={styles.claimButton}
              type="button"
              onClick={() => void claim()}
              disabled={claiming}
            >
              {claiming ? 'Claiming a space…' : 'Claim a parking space'}
            </button>
          </article>
        </div>}
        <p className={styles.note}>A claim is confirmed only after the server verifies the space is still available.</p>
      </section>
    </div>
  )
}
