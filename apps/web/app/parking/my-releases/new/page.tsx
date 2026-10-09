'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ApiError, apiRequest } from '../../../../lib/api-client'
import type { EmployeeIdentity, SessionRole } from '../../../../lib/session'
import { normalizeRoles } from '../../../../lib/roles'
import { ApplicationShell, ResultPanel, StatusBadge } from '../../../../components/operations'
import { ReleaseCalendar } from './release-calendar'
import {
  OFFICE_TIME_ZONE,
  RELEASE_TIME,
  claimabilityGuidance,
  dateOnly,
  displayClaimableAt,
  displayDate,
  getReleaseDateBounds,
  statusLabel,
} from './release-dates'
import styles from './page.module.css'

type Release = { id: string; releaseDate: string; claimableAt: string; status: string }
type EmployeeResponse = {
  employee?: EmployeeIdentity & { email?: string }
  roles?: SessionRole[]
  corporateEmail?: string
  email?: string
  displayName?: string
}

function responseFieldError(error: unknown): string | undefined {
  if (!(error instanceof ApiError) || error.status !== 422) return undefined
  const details = error.details
  if (typeof details !== 'object' || details === null || !('message' in details)) return error.message
  const message = details.message
  if (Array.isArray(message)) {
    const field = message.find((entry) => typeof entry === 'object' && entry !== null && 'property' in entry && entry.property === 'releaseDate')
    if (field && typeof field === 'object' && 'constraints' in field) {
      const constraints = field.constraints
      if (typeof constraints === 'object' && constraints !== null) return Object.values(constraints).join(' ')
    }
  }
  return typeof message === 'string' ? message : error.message
}

export default function NewReleasePage() {
  const [identity, setIdentity] = useState<EmployeeIdentity | null>(null)
  const [role, setRole] = useState<SessionRole | null>(null)
  const [sessionError, setSessionError] = useState(false)
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [dateError, setDateError] = useState('')
  const [serviceError, setServiceError] = useState('')
  const [release, setRelease] = useState<Release | null>(null)
  const [created, setCreated] = useState<Release[]>([])
  const [existing, setExisting] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const bounds = useMemo(() => getReleaseDateBounds(clock), [clock])

  useEffect(() => {
    let active = true
    apiRequest<EmployeeResponse>('/employees/me').then((response) => {
      const employee = (response.employee ?? response) as { corporateEmail?: string; email?: string; displayName?: string }
      const email = employee.corporateEmail ?? employee.email
      const employeeRole = normalizeRoles(response.roles)[0]
      if (!active) return
      if (!email || !employeeRole) { setSessionError(true); return }
      setIdentity({ corporateEmail: email, ...(employee.displayName ? { displayName: employee.displayName } : {}) })
      setRole(employeeRole)
    }).catch(() => { if (active) setSessionError(true) })
    return () => { active = false }
  }, [])

  // Dates already released cannot be released again, so the calendar marks them unavailable
  // rather than letting the employee submit a request the api will reject.
  useEffect(() => {
    let active = true
    apiRequest<Release[]>('/parking/releases', { cache: 'no-store' }).then((releases) => {
      if (!active) return
      const taken: Record<string, string> = {}
      for (const item of releases) {
        if (item.status.toUpperCase() === 'CANCELLED') continue
        taken[dateOnly(item.releaseDate)] = item.status.toUpperCase() === 'CLAIMED'
          ? 'Already claimed by another employee'
          : 'Already released'
      }
      setExisting(taken)
    }).catch(() => { /* the calendar still works; the api remains the authority */ })
    return () => { active = false }
  }, [created])

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  function toggleDate(date: string) {
    setDateError('')
    setSelectedDates((current) => current.includes(date)
      ? current.filter((value) => value !== date)
      : [...current, date].sort())
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating) return
    const current = getReleaseDateBounds(new Date())
    if (!selectedDates.length) {
      setDateError('Choose at least one date to release.')
      setServiceError('')
      return
    }
    if (selectedDates.some((date) => date < current.min || date > current.max)) {
      setDateError('Choose today or dates within the next 30 days.')
      setServiceError('')
      return
    }
    setDateError('')
    setServiceError('')
    setCreating(true)
    try {
      const releases = await apiRequest<Release[]>('/parking/releases', {
        method: 'POST', body: JSON.stringify({ releaseDates: selectedDates }),
      })
      setCreated(releases)
      setRelease(releases[0] ?? null)
      setSelectedDates([])
      setClock(new Date())
    } catch (error) {
      const fieldError = responseFieldError(error)
      if (fieldError) setDateError(fieldError)
      else setServiceError('We couldn\u2019t create these releases. Check your connection and try again.')
    } finally {
      setCreating(false)
    }
  }

  if (!identity || !role) {
    return <div className={styles.loading} role={sessionError ? 'alert' : 'status'} aria-live="polite">
      {sessionError ? <>Sign in with your Folio3 account to create a release. <Link href="/sign-in">Sign in</Link></> : 'Loading your parking workspace…'}
    </div>
  }
  if (role !== 'employee') {
    return <ApplicationShell authState="authenticated" role={role} identity={identity}>
      <section className={styles.accessDenied} role="alert"><h1>Access denied</h1><p>Only employees with an assigned parking space can create releases.</p></section>
    </ApplicationShell>
  }

  const guidance = release ? claimabilityGuidance(release, clock) : ''
  const isClaimable = guidance.startsWith('Claimable now.') && release?.status.toUpperCase() === 'OPEN'
  const dateHint = `Choose today or any dates up to 30 days ahead. Office time zone: ${OFFICE_TIME_ZONE}.`

  return <ApplicationShell authState="authenticated" role={role} identity={identity}>
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/parking/available">My parking</Link><span aria-hidden="true">›</span><Link href="/parking/my-releases">My releases</Link><span aria-hidden="true">›</span><span aria-current="page">New release</span></nav>
      {!release ? <>
        <header className={styles.heading}>
          <p className={styles.eyebrow}>MY RELEASES</p>
          <h1>Release a parking space</h1>
          <p>Make your assigned space available to a colleague when you won’t need it.</p>
        </header>
        <section className={styles.formCard} aria-labelledby="release-form-heading">
          <div className={styles.cardHeading}><span className={styles.step} aria-hidden="true">1</span><div><h2 id="release-form-heading">Choose your release dates</h2><p>Select a single day or as many as you need.</p></div></div>
          <form onSubmit={submit} noValidate>
            <p className={styles.hint} id="calendar-hint">{dateHint}</p>
            <ReleaseCalendar
              min={bounds.min}
              max={bounds.max}
              selected={selectedDates}
              unavailable={existing}
              disabled={creating}
              onToggle={toggleDate}
            />
            <p className={styles.selectionSummary} role="status">
              {selectedDates.length
                ? `${selectedDates.length} date${selectedDates.length === 1 ? '' : 's'} selected: ${selectedDates.map(displayDate).join(', ')}`
                : 'No dates selected yet.'}
            </p>
            {dateError && <p className={styles.errorBanner} role="alert">{dateError}</p>}
            <aside className={styles.guidance} aria-label="Claimability guidance"><span className={styles.guidanceIcon} aria-hidden="true">i</span><p>Today’s release becomes claimable at <strong>{RELEASE_TIME}</strong> office time. If scheduled before then, or for a future date, it remains unavailable until that release time.</p></aside>
            {serviceError && <p className={styles.errorBanner} role="alert">{serviceError}</p>}
            <div className={styles.actions}><Link className={styles.cancel} href="/parking/my-releases">Cancel</Link><button className={styles.submit} type="submit" disabled={creating || !selectedDates.length}>{creating ? <><span className={styles.spinner} aria-hidden="true" />Creating your releases…</> : `Confirm ${selectedDates.length || ''} release${selectedDates.length === 1 ? '' : 's'}`.replace('  ', ' ')}</button></div>
          </form>
        </section>
      </> : <section className={styles.resultColumn} aria-labelledby="result-heading">
        <div className={styles.resultIntro}><p className={styles.eyebrow}>RELEASE CONFIRMATION</p><h1 id="result-heading">{created.length > 1 ? `${created.length} space releases are scheduled.` : 'Your space release is scheduled.'}</h1><p>Review when each date becomes claimable.</p></div>
        {created.length > 1 && (
          <ul className={styles.createdList} aria-label="Scheduled releases">
            {created.map((item) => (
              <li key={item.id}>
                <strong>{displayDate(item.releaseDate)}</strong>
                <span>Claimable from {displayClaimableAt(item.claimableAt)} office time</span>
              </li>
            ))}
          </ul>
        )}
        <ResultPanel variant="success" title="Release created successfully" date={displayDate(release.releaseDate)}>
          <p>Release date: <strong>{displayDate(release.releaseDate)}</strong></p>
          <p>Status: <StatusBadge status={release.status.toUpperCase() === 'OPEN' ? 'scheduled' : release.status.toLowerCase() as 'claimed' | 'cancelled'} label={statusLabel(release.status)} /></p>
          <p>Claimable from: <strong>{displayClaimableAt(release.claimableAt)} office time ({OFFICE_TIME_ZONE})</strong></p>
          <p className={isClaimable ? styles.availableNote : styles.notAvailableNote} role="status">{guidance}</p>
        </ResultPanel>
        <section className={styles.detailsCard} aria-labelledby="details-heading"><h2 id="details-heading">Release details</h2><p>The date and exact claimable time come from the parking service.</p><div className={styles.detailGrid}><div><span>Release date</span><strong>{displayDate(release.releaseDate)}</strong></div><div><span>Claimable from</span><strong>{displayClaimableAt(release.claimableAt)} office time</strong></div></div></section>
        <div className={styles.resultActions}><Link href="/parking/my-releases">Back to my releases</Link><button className={styles.secondaryButton} type="button" onClick={() => { setRelease(null); setCreated([]); setDateError(''); setServiceError('') }}>Create another release</button></div>
      </section>}
    </div>
  </ApplicationShell>
}
