'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ApiError, apiRequest } from '../../../../lib/api-client'
import type { EmployeeIdentity, SessionRole } from '../../../../lib/session'
import { ApplicationShell, FormField, ResultPanel, StatusBadge } from '../../../../components/operations'
import styles from './page.module.css'

type Release = { id: string; releaseDate: string; claimableAt: string; status: string }
type EmployeeResponse = {
  employee?: EmployeeIdentity & { email?: string }
  roles?: SessionRole[]
  corporateEmail?: string
  email?: string
  displayName?: string
}

const OFFICE_TIME_ZONE = process.env.NEXT_PUBLIC_OFFICE_TIME_ZONE || 'UTC'
const RELEASE_TIME = process.env.NEXT_PUBLIC_DAILY_PARKING_RELEASE_TIME || '08:00'

function officeDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function getReleaseDateBounds(now: Date): { min: string; max: string } {
  const min = officeDate(now)
  const end = new Date(`${min}T00:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 30)
  return { min, max: end.toISOString().slice(0, 10) }
}

function dateOnly(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(value).toISOString().slice(0, 10)
}

function displayDate(value: string): string {
  const [year, month, day] = dateOnly(value).split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
}

function displayClaimableAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: OFFICE_TIME_ZONE,
  }).format(new Date(value))
}

export function claimabilityGuidance(
  release: Pick<Release, 'releaseDate' | 'claimableAt'> & { status?: string },
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

function statusLabel(status: string): string {
  if (status.toUpperCase() === 'OPEN') return 'Scheduled (OPEN)'
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()
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
  const [releaseDate, setReleaseDate] = useState('')
  const [dateError, setDateError] = useState('')
  const [serviceError, setServiceError] = useState('')
  const [release, setRelease] = useState<Release | null>(null)
  const [creating, setCreating] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const bounds = useMemo(() => getReleaseDateBounds(clock), [clock])

  useEffect(() => {
    let active = true
    apiRequest<EmployeeResponse>('/employees/me').then((response) => {
      const employee = (response.employee ?? response) as { corporateEmail?: string; email?: string; displayName?: string }
      const email = employee.corporateEmail ?? employee.email
      const employeeRole = response.roles?.find((candidate) => candidate === 'employee' || candidate === 'security' || candidate === 'administrator')
      if (!active) return
      if (!email || !employeeRole) { setSessionError(true); return }
      setIdentity({ corporateEmail: email, ...(employee.displayName ? { displayName: employee.displayName } : {}) })
      setRole(employeeRole)
      setReleaseDate(getReleaseDateBounds(new Date()).min)
    }).catch(() => { if (active) setSessionError(true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating) return
    const current = getReleaseDateBounds(new Date())
    if (!releaseDate) {
      setDateError('Choose a release date to continue.')
      setServiceError('')
      return
    }
    if (releaseDate < current.min || releaseDate > current.max) {
      setDateError('Choose today or a date within the next 30 days.')
      setServiceError('')
      return
    }
    setDateError('')
    setServiceError('')
    setCreating(true)
    try {
      const created = await apiRequest<Release>('/parking/releases', {
        method: 'POST', body: JSON.stringify({ releaseDate }),
      })
      setRelease(created)
      setClock(new Date())
    } catch (error) {
      const fieldError = responseFieldError(error)
      if (fieldError) setDateError(fieldError)
      else setServiceError('We couldn’t create this release. Check your connection and try again.')
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
  const dateHint = `Choose today or a date up to 30 days ahead. Office time zone: ${OFFICE_TIME_ZONE}.`

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
          <div className={styles.cardHeading}><span className={styles.step} aria-hidden="true">1</span><div><h2 id="release-form-heading">Choose a release date</h2><p>One simple step to schedule your space release.</p></div></div>
          <form onSubmit={submit} noValidate>
            <FormField id="release-date" type="date" label="Release date" value={releaseDate} min={bounds.min} max={bounds.max} required disabled={creating} error={dateError} hint={dateHint} onChange={(event) => { setReleaseDate(event.target.value); setDateError('') }} />
            <aside className={styles.guidance} aria-label="Claimability guidance"><span className={styles.guidanceIcon} aria-hidden="true">i</span><p>Today’s release becomes claimable at <strong>{RELEASE_TIME}</strong> office time. If scheduled before then, or for a future date, it remains unavailable until that release time.</p></aside>
            {serviceError && <p className={styles.errorBanner} role="alert">{serviceError}</p>}
            <div className={styles.actions}><Link className={styles.cancel} href="/parking/my-releases">Cancel</Link><button className={styles.submit} type="submit" disabled={creating}>{creating ? <><span className={styles.spinner} aria-hidden="true" />Creating your release…</> : 'Confirm release'}</button></div>
          </form>
        </section>
      </> : <section className={styles.resultColumn} aria-labelledby="result-heading">
        <div className={styles.resultIntro}><p className={styles.eyebrow}>RELEASE CONFIRMATION</p><h1 id="result-heading">Your space release is scheduled.</h1><p>Your release was created. Review when it becomes claimable.</p></div>
        <ResultPanel variant="success" title="Release created successfully" date={displayDate(release.releaseDate)}>
          <p>Release date: <strong>{displayDate(release.releaseDate)}</strong></p>
          <p>Status: <StatusBadge status={release.status.toUpperCase() === 'OPEN' ? 'scheduled' : release.status.toLowerCase() as 'claimed' | 'cancelled'} label={statusLabel(release.status)} /></p>
          <p>Claimable from: <strong>{displayClaimableAt(release.claimableAt)} office time ({OFFICE_TIME_ZONE})</strong></p>
          <p className={isClaimable ? styles.availableNote : styles.notAvailableNote} role="status">{guidance}</p>
        </ResultPanel>
        <section className={styles.detailsCard} aria-labelledby="details-heading"><h2 id="details-heading">Release details</h2><p>The date and exact claimable time come from the parking service.</p><div className={styles.detailGrid}><div><span>Release date</span><strong>{displayDate(release.releaseDate)}</strong></div><div><span>Claimable from</span><strong>{displayClaimableAt(release.claimableAt)} office time</strong></div></div></section>
        <div className={styles.resultActions}><Link href="/parking/my-releases">Back to my releases</Link><button className={styles.secondaryButton} type="button" onClick={() => { setRelease(null); setDateError(''); setServiceError('') }}>Create another release</button></div>
      </section>}
    </div>
  </ApplicationShell>
}
