'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiRequest } from '../../../lib/api-client'
import { ApplicationShell } from '../../../components/operations'
import styles from './page.module.css'

type ReleaseStatus = 'OPEN' | 'CLAIMED' | 'CANCELLED' | string

interface ReleaseChange {
  status: ReleaseStatus
  changedAt: string
  employeeId?: string
}

interface Release {
  id: string
  releaseDate: string
  claimableAt?: string
  status: ReleaseStatus
  statusChanges?: ReleaseChange[]
  allocation?: { claimant?: string; allocatedAt?: string }
  parkingSpace?: { spaceCode?: string; floor?: number; floorName?: string | null }
}

interface EmployeeProfile {
  corporateEmail?: string
  displayName?: string
  employee?: { corporateEmail?: string; displayName?: string }
}

const releaseUrl = (id?: string) => id ? `/parking/releases/${encodeURIComponent(id)}` : '/parking/releases'

function asDate(value: string): Date {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date(`${value}T00:00:00`) : parsed
}

function formatDate(value: string): string {
  const date = asDate(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(date)
}

function formatWeekday(value: string): string {
  const date = asDate(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-US', {
    weekday: 'long', timeZone: 'UTC',
  }).format(date)
}

function formatOfficeTimestamp(value: string): string {
  const date = asDate(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC',
  }).format(date)
}

function statusLabel(status: ReleaseStatus): string {
  if (status === 'CLAIMED') return 'Claimed'
  if (status === 'CANCELLED') return 'Cancelled'
  return 'Scheduled'
}

function activityLabel(status: ReleaseStatus): string {
  if (status === 'CLAIMED') return 'Claimed'
  if (status === 'CANCELLED') return 'Cancelled'
  return 'Created'
}

function changesFor(release: Release): ReleaseChange[] {
  if (release.statusChanges?.length) return release.statusChanges
  return [{ status: release.status, changedAt: release.status === 'CLAIMED' && release.allocation?.allocatedAt
    ? release.allocation.allocatedAt : release.releaseDate }]
}

export default function MyReleasesPage() {
  const [employee, setEmployee] = useState<{ corporateEmail: string; displayName?: string } | null>(null)
  const [releases, setReleases] = useState<Release[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingCancel, setPendingCancel] = useState<Release | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState('')
  const [focusReleaseId, setFocusReleaseId] = useState<string | null>(null)
  const statusRefs = useRef<Record<string, HTMLSpanElement | null>>({})
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null)

  const loadReleases = useCallback(async () => {
    setLoading(true)
    setError('')
    setReleases(null)
    try {
      const result = await apiRequest<Release[]>('/parking/releases', { cache: 'no-store' })
      setReleases(Array.isArray(result) ? result : [])
    } catch {
      setError('Your releases could not be loaded. Try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    apiRequest<EmployeeProfile>('/employees/me', { cache: 'no-store' })
      .then((profile) => {
        if (!active) return
        const identity = profile.employee ?? profile
        if (identity.corporateEmail) {
          setEmployee({ corporateEmail: identity.corporateEmail, displayName: identity.displayName })
        }
      })
      .catch(() => undefined)
    void loadReleases()
    return () => { active = false }
  }, [loadReleases])

  useEffect(() => {
    if (!focusReleaseId || loading) return
    const status = statusRefs.current[focusReleaseId]
    if (status) {
      status.focus()
      setFocusReleaseId(null)
    }
  }, [focusReleaseId, loading, releases])

  const confirmCancellation = async () => {
    if (!pendingCancel || pendingCancel.status !== 'OPEN') return
    const selected = pendingCancel
    setCancellingId(selected.id)
    setCancelError('')
    try {
      await apiRequest<Release>(releaseUrl(selected.id), { method: 'DELETE' })
      const refreshed = await apiRequest<Release>(releaseUrl(selected.id), { cache: 'no-store' })
      setReleases((current) => current?.map((release) => release.id === refreshed.id ? refreshed : release) ?? [refreshed])
      setFocusReleaseId(refreshed.id)
      setPendingCancel(null)
    } catch {
      setCancelError('This release could not be cancelled. It may have been claimed. Refresh and try again.')
    } finally {
      setCancellingId(null)
    }
  }

  const closeDialog = () => {
    setPendingCancel(null)
    setCancelError('')
    cancelButtonRef.current?.focus()
  }

  const identity = employee ?? { corporateEmail: 'Loading account…' }

  return <ApplicationShell role="employee" identity={identity} authState="authenticated">
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/parking/available">My parking</Link><span aria-hidden="true">/</span><span aria-current="page">My releases</span>
      </nav>

      <header className={styles.pageHeading}>
        <div>
          <div className={styles.eyebrow}>Employee parking</div>
          <h1>My parking releases</h1>
          <p>Review the spaces you’ve made available to colleagues.</p>
        </div>
        <Link className={styles.primaryButton} href="/parking/my-releases/new"><span aria-hidden="true">＋</span>Release a space</Link>
      </header>

      <section className={styles.banner} aria-label={loading ? 'Loading release status' : error ? 'Release status unavailable' : 'Release status is up to date'}>
        <span className={styles.bannerIcon} aria-hidden="true">{error ? '!' : loading ? '…' : '✓'}</span>
        <div><h2>{error ? 'Release status unavailable' : loading ? 'Loading your releases…' : 'Release status is up to date'}</h2>
          <p>{error || (loading ? 'Please wait while we retrieve your release history.' : 'Your release history and claim activity are current.')}</p></div>
      </section>

      <aside className={styles.helpNote}>
        <span aria-hidden="true">ⓘ</span>
        <p><strong>You can cancel a release only until another employee claims the space.</strong> Scheduled releases become claimable at the configured daily release time. We’ll ask you to confirm before cancelling.</p>
      </aside>

      <section className={styles.listCard} aria-labelledby="history-title">
        <div className={styles.cardHeader}>
          <div><h2 id="history-title">Release history</h2><p>Dates, space details, and recorded changes</p></div>
          {!loading && !error && releases && <span className={styles.count}>{releases.length} {releases.length === 1 ? 'release' : 'releases'}</span>}
        </div>
        {loading ? <div className={styles.state} role="status" aria-live="polite" aria-busy="true">
          <span className={styles.skeleton} /><span className={styles.skeleton} /><span className={styles.skeleton} />Loading your releases…
        </div> : error ? <div className={styles.stateError} role="alert"><p>{error}</p><button className={styles.secondaryButton} onClick={() => void loadReleases()} type="button">Retry</button></div>
          : releases?.length === 0 ? <div className={styles.state} role="status"><p>You have no parking releases yet.</p><Link className={styles.primaryButton} href="/parking/my-releases/new">Release a space</Link></div>
            : releases && <>
              <div className={styles.tableWrap}>
                <table>
                  <caption className={styles.visuallyHidden}>Your parking releases, with current status, activity history, and available actions.</caption>
                  <thead><tr><th scope="col">Release date</th><th scope="col">Parking space</th><th scope="col">Status</th><th scope="col">Activity</th><th scope="col" className={styles.actionHeading}>Action</th></tr></thead>
                  <tbody>{releases.map((release) => {
                    const claimed = release.status === 'CLAIMED'
                    const cancelled = release.status === 'CANCELLED'
                    const space = release.parkingSpace
                    const changes = changesFor(release)
                    return <tr key={release.id}>
                      <td data-label="Release date"><span className={styles.dateMain}>{formatDate(release.releaseDate)}</span><span className={styles.dateWeekday}>{formatWeekday(release.releaseDate)}</span></td>
                      <td data-label="Parking space"><span className={styles.spaceName}>Space {space?.spaceCode ?? '—'}</span><span className={styles.spaceMeta}>{space?.floor !== undefined ? `Level ${space.floor}` : 'Parking'}{space?.floorName ? ` · ${space.floorName}` : ''}</span></td>
                      <td data-label="Status"><span ref={(node) => { statusRefs.current[release.id] = node }} tabIndex={-1} id={`release-status-${release.id}`} className={`${styles.badge} ${claimed ? styles.claimed : cancelled ? styles.cancelled : styles.scheduled}`} aria-label={`Status: ${statusLabel(release.status)}`}>
                        <span aria-hidden="true">{claimed ? '✓' : cancelled ? '×' : '•'}</span>{statusLabel(release.status)}
                      </span><div className={styles.statusDetail}>{claimed ? 'No longer available to cancel' : cancelled ? 'Space was not claimed' : release.claimableAt ? `Claimable at ${formatOfficeTimestamp(release.claimableAt).split(', ').slice(-1)[0]} office time` : 'Claimable at configured release time'}</div></td>
                      <td data-label="Activity"><div className={styles.activityList}>{changes.map((change, index) => <div className={styles.activity} key={`${change.status}-${change.changedAt}-${index}`}>
                        <span className={styles.activityMark} aria-hidden="true">◷</span><span>{activityLabel(change.status)} {formatOfficeTimestamp(change.changedAt)} <span className={styles.officeTime}>office time</span></span>
                        {change.status === 'CLAIMED' && <span className={styles.activityDetail}>Claimed by {release.allocation?.claimant || 'another employee'}</span>}
                        {change.status === 'CANCELLED' && <span className={styles.activityDetail}>Cancelled by you</span>}
                      </div>)}</div></td>
                      <td className={styles.actionCell} data-label="Available action">{release.status === 'OPEN' ? <button ref={cancelButtonRef} className={styles.cancelButton} type="button" aria-label={`Cancel release for ${formatDate(release.releaseDate)}`} onClick={() => { setPendingCancel(release); setCancelError('') }}>Cancel release</button>
                        : claimed ? <span className={styles.unavailable}><strong>Cancellation unavailable</strong>Space has been claimed</span> : <span className={styles.unavailable}><strong>Release closed</strong>No further action</span>}</td>
                    </tr>
                  })}</tbody>
                </table>
              </div>
              <footer className={styles.footer}><span>✓ Showing current release status</span><span>All times shown in office time</span></footer>
            </>}
      </section>

      {pendingCancel && <div className={styles.dialogBackdrop}>
        <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="cancel-title" aria-describedby="cancel-description">
          <h2 id="cancel-title">Cancel this release?</h2>
          <p id="cancel-description">This will cancel your release for {formatDate(pendingCancel.releaseDate)}. The space will no longer be available for colleagues. This action cannot be undone.</p>
          {cancelError && <p role="alert" className={styles.dialogError}>{cancelError}</p>}
          <div className={styles.dialogActions}><button className={styles.secondaryButton} type="button" onClick={closeDialog} disabled={cancellingId !== null}>Keep release</button>
            <button autoFocus className={styles.destructiveButton} type="button" onClick={() => void confirmCancellation()} disabled={cancellingId !== null}>{cancellingId ? 'Cancelling…' : 'Confirm cancellation'}</button></div>
        </section>
      </div>}
    </div>
  </ApplicationShell>
}
