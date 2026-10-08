'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { AccessDenied, ApplicationShell } from '../../../components/operations'
import { apiRequest } from '../../../lib/api-client'
import type { SessionRole } from '../../../lib/session'
import styles from './page.module.css'

type Config = { dailyParkingReleaseTime?: string | null; officeTimeZone?: string | null }
type Identity = { corporateEmail: string; displayName?: string }
type PageState = 'loading' | 'ready' | 'denied' | 'error'

function isOfficeTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export default function ConfigurationPage() {
  const [pageState, setPageState] = useState<PageState>('loading')
  const [identity, setIdentity] = useState<Identity>()
  const [draft, setDraft] = useState('08:00')
  const [saved, setSaved] = useState('08:00')
  const [timeZone, setTimeZone] = useState('Configured office time zone')
  const [fieldError, setFieldError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const session = await apiRequest<unknown>('/employees/me')
        if (!active) return
        const record = typeof session === 'object' && session !== null ? session as Record<string, unknown> : {}
        const employee = typeof record.employee === 'object' && record.employee !== null
          ? record.employee as Record<string, unknown>
          : record
        const roles = Array.isArray(record.roles) ? record.roles : Array.isArray(employee.roles) ? employee.roles : []
        const admin = roles.some((role) => typeof role === 'string' && ['admin', 'administrator', 'parking_administrator'].includes(role.toLowerCase()))
        if (!admin) {
          setPageState('denied')
          return
        }
        setIdentity({
          corporateEmail: typeof employee.corporateEmail === 'string' ? employee.corporateEmail : 'Administrator',
          ...(typeof employee.displayName === 'string' ? { displayName: employee.displayName } : {}),
        })
        const configuration = await apiRequest<Config | null>('/admin/configuration')
        if (!active) return
        const effectiveTime = configuration?.dailyParkingReleaseTime || '08:00'
        setDraft(effectiveTime)
        setSaved(effectiveTime)
        setTimeZone(configuration?.officeTimeZone || 'Configured office time zone')
        setPageState('ready')
      } catch {
        if (active) {
          setRequestError("Configuration couldn't be loaded. Try again.")
          setPageState('error')
        }
      }
    }
    void load()
    return () => { active = false }
  }, [])

  async function confirmSave() {
    if (!isOfficeTime(draft)) {
      setFieldError('Enter a valid office-local time in HH:mm format.')
      setDialogOpen(false)
      return
    }
    setSaving(true)
    setRequestError('')
    try {
      const result = await apiRequest<Config>('/admin/configuration', {
        method: 'PATCH',
        body: JSON.stringify({ dailyParkingReleaseTime: draft }),
      })
      const savedTime = result.dailyParkingReleaseTime || draft
      setSaved(savedTime)
      setDraft(savedTime)
      setTimeZone(result.officeTimeZone || timeZone)
      setSuccess(true)
      setDialogOpen(false)
    } catch {
      setRequestError("Configuration couldn't be saved. Your previous setting remains in effect.")
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSuccess(false)
    setRequestError('')
    if (!isOfficeTime(draft)) {
      setFieldError('Enter a valid office-local time in HH:mm format.')
      return
    }
    setFieldError('')
    setDialogOpen(true)
  }

  const role: SessionRole = 'administrator'
  return <ApplicationShell role={role} identity={identity} authState={pageState === 'denied' ? 'unauthenticated' : 'authenticated'}>
    <div className={styles.page}>
      <div className={styles.breadcrumb} aria-label="Breadcrumb"><span>Administration</span><span aria-hidden="true">›</span><strong>Configuration</strong></div>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>Administrator settings</p>
        <h1>Parking configuration</h1>
        <p>Configure when released parking spaces become available.</p>
      </header>
      {pageState === 'denied' ? <AccessDenied message="This page is limited to authorized parking administrators." /> : null}
      {pageState === 'loading' ? <><p className={styles.loading} role="status" aria-live="polite">Loading configuration…</p><div className={styles.loadingField}><label htmlFor="loadingReleaseTime">Daily Parking Release Time</label><input id="loadingReleaseTime" type="time" value="08:00" disabled /></div></> : null}
      {pageState === 'error' ? <div className={styles.errorBanner} role="alert">{requestError}</div> : null}
      {pageState === 'ready' ? <>
        <aside className={styles.accessNote}><span aria-hidden="true">✓</span><span><strong>Administrator access.</strong> Access is limited to authorized parking administrators.</span></aside>
        <section className={styles.card} aria-labelledby="release-time-heading">
          <div className={styles.cardHeading}>
            <span className={styles.icon} aria-hidden="true">◷</span>
            <div><h2 id="release-time-heading">Daily Parking Release Time</h2><p>Set the time when eligible spaces are released each day.</p></div>
          </div>
          <form onSubmit={submit} noValidate>
            <div className={styles.field}>
              <label htmlFor="dailyParkingReleaseTime">Daily Parking Release Time</label>
              <div className={styles.inputRow}>
                <input
                  id="dailyParkingReleaseTime"
                  name="dailyParkingReleaseTime"
                  type="time"
                  step={60}
                  value={draft}
                  disabled={pageState !== 'ready' || saving}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? 'release-time-error release-time-hint' : 'release-time-hint'}
                  onChange={(event) => { setDraft(event.target.value); setFieldError(''); setSuccess(false) }}
                />
                <span className={styles.zoneChip}>Office time · {timeZone}</span>
              </div>
              {fieldError ? <span className={styles.fieldError} id="release-time-error" role="alert">{fieldError}</span> : null}
              <p className={styles.hint} id="release-time-hint">The default Daily Parking Release Time is 8:00 AM. Enter a 24-hour time (HH:mm), interpreted in the configured office time zone.</p>
            </div>
            {requestError && pageState === 'ready' ? <div className={styles.errorBanner} role="alert">{requestError}</div> : null}
            {success ? <div className={styles.successBanner} role="status" aria-live="polite"><strong>Daily Parking Release Time updated.</strong><span>Saved time: {saved} · {timeZone} office time.</span></div> : null}
            <div className={styles.actions}><button className={styles.saveButton} type="submit" disabled={pageState !== 'ready' || saving}>Save release time <span aria-hidden="true">→</span></button></div>
          </form>
        </section>
        <p className={styles.policyNote}>This setting controls claim eligibility for parking releases and is interpreted using the office time zone.</p>
      </> : null}
      {dialogOpen ? <div className={styles.backdrop}>
        <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
          <span className={styles.dialogIcon} aria-hidden="true">!</span>
          <h2 id="confirm-title">Confirm release time change</h2>
          <p id="confirm-description">Save the Daily Parking Release Time as <strong>{draft}</strong> in <strong>{timeZone}</strong> office time? This affects when parking releases become claimable.</p>
          <div className={styles.dialogActions}>
            <button className={styles.cancelButton} type="button" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</button>
            <button className={styles.saveButton} type="button" onClick={() => void confirmSave()} disabled={saving}>{saving ? 'Saving…' : 'Confirm save'}</button>
          </div>
        </section>
      </div> : null}
    </div>
  </ApplicationShell>
}
