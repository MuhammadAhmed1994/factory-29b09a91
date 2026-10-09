'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ApiError, apiRequest } from '../../lib/api-client'
import { AccessDenied, ApplicationShell } from '../../components/operations'
import { normalizeRoles } from '../../lib/roles'
import type { EmployeeIdentity } from '../../lib/session'
import styles from './page.module.css'

type DedicatedStatus = 'NONE' | 'RESERVED' | 'RELEASED' | 'CLAIMED_BY_ANOTHER_EMPLOYEE'

interface Notification {
  id: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

interface Vehicle { id: string }

interface Dashboard {
  officeDate: string
  dailyParkingReleaseTime: string
  officeTimeZone: string
  hasDedicatedParking: boolean
  dedicatedStatus: DedicatedStatus
  dedicatedSpace: { spaceCode: string; floor: number; floorName: string | null } | null
  todaysRelease: { id: string; status: string; claimableAt: string; claimant: string | null } | null
  temporaryAllocation: { spaceCode: string; floor: number; allocatedAt: string } | null
  availableSpaces: number
}

const statusCopy: Record<DedicatedStatus, { label: string; className: string; detail: string }> = {
  RESERVED: {
    label: 'Reserved',
    className: styles.reserved,
    detail: 'Your space is held for you today.',
  },
  RELEASED: {
    label: 'Released',
    className: styles.released,
    detail: 'Your space is available for another employee to claim.',
  },
  CLAIMED_BY_ANOTHER_EMPLOYEE: {
    label: 'Claimed by another employee',
    className: styles.claimed,
    detail: 'Your space is in use today and cannot be reclaimed without a parking administrator.',
  },
  NONE: {
    label: 'No dedicated space',
    className: styles.none,
    detail: 'You can claim a released space when one is available.',
  },
}

function officeDateLabel(value: string, timeZone: string) {
  const date = new Date(`${value}T12:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone,
  }).format(date)
}

export function HomeScreen() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [releasing, setReleasing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setDashboard(await apiRequest<Dashboard>('/parking/dashboard', { cache: 'no-store' }))
      setState('ready')
    } catch {
      setState('error')
    }
    // Notifications and vehicles are supporting detail; a failure here must not blank the screen.
    await Promise.all([
      apiRequest<Notification[]>('/notifications?unread=true', { cache: 'no-store' })
        .then(setNotifications).catch(() => setNotifications([])),
      apiRequest<Vehicle[]>('/employees/me/vehicles', { cache: 'no-store' })
        .then(setVehicles).catch(() => setVehicles(null)),
    ])
  }, [])

  async function dismissNotifications() {
    setNotifications([])
    await apiRequest('/notifications/read', { method: 'PATCH' }).catch(() => undefined)
  }

  useEffect(() => { void refresh() }, [refresh])

  async function releaseToday() {
    if (!dashboard || releasing) return
    setReleasing(true)
    setError('')
    setMessage('')
    try {
      await apiRequest('/parking/releases', {
        method: 'POST',
        body: JSON.stringify({ releaseDate: dashboard.officeDate }),
      })
      setMessage("Today's parking has been released. Another employee can now claim it.")
      setConfirming(false)
      await refresh()
    } catch (releaseError) {
      setError(
        releaseError instanceof ApiError && releaseError.status === 409
          ? 'Your parking for today has already been released.'
          : 'Your parking could not be released. Try again.',
      )
      setConfirming(false)
    } finally {
      setReleasing(false)
    }
  }

  if (state === 'loading') {
    return <main className={styles.authState} role="status" aria-busy="true">Loading your parking…</main>
  }
  if (state === 'error' || !dashboard) {
    return <main className={styles.authState} role="alert">Your parking could not be loaded. Refresh to try again.</main>
  }

  const status = statusCopy[dashboard.dedicatedStatus]
  const canReleaseToday = dashboard.hasDedicatedParking && dashboard.dedicatedStatus === 'RESERVED'

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div className={styles.breadcrumb}>Workspace <span aria-hidden="true">›</span> <span>Parking</span></div>
        <h1>Today&apos;s parking</h1>
        <p className={styles.subtitle}>
          {officeDateLabel(dashboard.officeDate, dashboard.officeTimeZone)} · office time
        </p>
      </div>

      {message && <p className={styles.success} role="status">{message}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      {notifications.length > 0 && (
        <section className={`${styles.card} ${styles.notification}`} aria-label="Notifications">
          <div>
            <div className={styles.statusLabel}>Notification</div>
            <strong>{notifications[0].title}</strong>
            <p className={styles.notice}>{notifications[0].body}</p>
          </div>
          <button className={styles.secondary} type="button" onClick={() => void dismissNotifications()}>
            Dismiss
          </button>
        </section>
      )}

      {vehicles !== null && vehicles.length === 0 && (
        <section className={`${styles.card} ${styles.prompt}`} aria-label="Register a vehicle">
          <div>
            <strong>Register your vehicle</strong>
            <p className={styles.notice}>
              Security matches your licence plate at the entrance. Add at least one vehicle before claiming a space.
            </p>
          </div>
          <Link className={styles.secondary} href="/parking/vehicles">Add a vehicle</Link>
        </section>
      )}

      <section className={`${styles.card} ${styles.statusCard}`} aria-label="Your dedicated parking">
        <div>
          <div className={styles.statusLabel}>Your parking status</div>
          <div className={styles.statusValue}>
            <span className={`${styles.pill} ${status.className}`}>{status.label}</span>
          </div>
          {dashboard.dedicatedSpace && (
            <p className={styles.spaceMeta}>
              Space {dashboard.dedicatedSpace.spaceCode} · Level {dashboard.dedicatedSpace.floor}
              {dashboard.dedicatedSpace.floorName ? ` · ${dashboard.dedicatedSpace.floorName}` : ''}
            </p>
          )}
          <p className={styles.spaceMeta}>{status.detail}</p>
        </div>
        {canReleaseToday && (
          <button
            className={styles.releaseButton}
            type="button"
            disabled={releasing}
            onClick={() => setConfirming(true)}
          >
            {releasing ? 'Releasing…' : "Release today's parking"}
          </button>
        )}
      </section>

      {dashboard.temporaryAllocation && (
        <section className={`${styles.card} ${styles.success}`} aria-label="Your claimed space">
          <div className={styles.statusLabel}>Claimed for today</div>
          <div className={styles.statusValue}>
            Space {dashboard.temporaryAllocation.spaceCode} · Level {dashboard.temporaryAllocation.floor}
          </div>
          <p className={styles.notice}>
            Floors are assigned to spread vehicles across the building; parking on another level is not checked.
          </p>
        </section>
      )}

      {!dashboard.hasDedicatedParking && !dashboard.temporaryAllocation && (
        <section className={`${styles.card} ${styles.availability}`} aria-label="Available parking today">
          <div>
            <div className={styles.statusLabel}>Available right now</div>
            <div className={styles.count}>{dashboard.availableSpaces}</div>
            <p className={styles.notice}>
              Spaces open at {dashboard.dailyParkingReleaseTime} office time and are first come, first served.
            </p>
          </div>
          <Link className={styles.secondary} href="/parking/available">Claim a space</Link>
        </section>
      )}

      {dashboard.hasDedicatedParking && (
        <section className={styles.card} aria-label="Plan ahead">
          <div className={styles.statusLabel}>Planning</div>
          <p className={styles.subtitle}>Release your space for days you already know you will not be in.</p>
          <div className={styles.actions}>
            <Link className={styles.secondary} href="/parking/my-releases/new">Open release calendar</Link>
            <Link className={styles.secondary} href="/parking/my-releases">View my releases</Link>
          </div>
        </section>
      )}

      {confirming && (
        <div className={styles.overlay} role="presentation">
          <section className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-release-title">
            <h2 id="confirm-release-title">Release today&apos;s parking?</h2>
            <p className={styles.notice}>
              Space {dashboard.dedicatedSpace?.spaceCode} becomes available to other employees. Once another
              employee claims it you cannot use it again today without a parking administrator.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.secondary} type="button" onClick={() => setConfirming(false)} disabled={releasing}>
                Keep my space
              </button>
              <button className={styles.releaseButton} type="button" onClick={() => void releaseToday()} disabled={releasing}>
                {releasing ? 'Releasing…' : 'Release it'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

interface SessionResponse extends EmployeeIdentity {
  roles?: unknown
}

export default function ParkingHomePage() {
  const router = useRouter()
  const [auth, setAuth] = useState<{ identity: EmployeeIdentity } | 'loading' | 'denied'>('loading')

  useEffect(() => {
    let active = true
    apiRequest<SessionResponse>('/employees/me').then((response) => {
      if (!active) return
      const roles = normalizeRoles(response.roles)
      if (!response.corporateEmail || !roles.includes('employee')) {
        setAuth('denied')
        return
      }
      setAuth({ identity: response })
    }).catch((error: unknown) => {
      if (!active) return
      router.replace(error instanceof ApiError && error.status === 401 ? '/sign-in?reason=session-expired' : '/sign-in')
    })
    return () => { active = false }
  }, [router])

  if (auth === 'loading') return <main className={styles.authState} role="status">Checking your session…</main>
  if (auth === 'denied') return <ApplicationShell authState="unauthenticated"><AccessDenied /></ApplicationShell>
  return (
    <ApplicationShell role="employee" identity={auth.identity} authState="authenticated">
      <HomeScreen />
    </ApplicationShell>
  )
}
