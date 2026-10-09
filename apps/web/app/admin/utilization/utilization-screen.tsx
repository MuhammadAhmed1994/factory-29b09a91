'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiRequest } from '../../../lib/api-client'
import { AccessDenied, ApplicationShell } from '../../../components/operations'
import { normalizeRoles } from '../../../lib/roles'
import type { EmployeeIdentity } from '../../../lib/session'
import styles from './page.module.css'

interface UtilizationRow {
  employeeId: string
  displayName: string
  corporateEmail: string
  date: string
  spaceCode: string | null
}

interface Statistics {
  weekStart: string
  weekEnd: string
  unusedDedicated: UtilizationRow[]
  unusedTemporary: UtilizationRow[]
  daily: Array<{
    date: string
    allocatedSpaces: number
    utilizedSpaces: number
    releasedSpaces: number
    temporaryClaims: number
    utilizationPercentage: number
  }>
  totals: {
    releasedSpaces: number
    temporaryClaims: number
    allocatedSpaces: number
    utilizedSpaces: number
    utilizationPercentage: number
  }
}

interface ClaimedRelease {
  id: string
  releaseDate: string
  status: string
  allocation?: { claimant: string }
  parkingSpace?: { spaceCode: string }
}

interface WeeklyReport {
  id: string
  weekStart: string
  weekEnd: string
  generatedAt: string
  recipients: string[]
  emailedAt: string | null
  deliveryError: string | null
}

export function UtilizationScreen() {
  const [statistics, setStatistics] = useState<Statistics | null>(null)
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [claimed, setClaimed] = useState<ClaimedRelease[]>([])
  const [reverting, setReverting] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [generating, setGenerating] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [stats, stored] = await Promise.all([
        apiRequest<Statistics>('/admin/utilization', { cache: 'no-store' }),
        apiRequest<WeeklyReport[]>('/admin/utilization/weekly-reports', { cache: 'no-store' }),
      ])
      setStatistics(stats)
      setReports(stored)
      setState('ready')
    } catch {
      setState('error')
    }
    await apiRequest<ClaimedRelease[]>('/admin/parking-releases', { cache: 'no-store' })
      .then((releases) => setClaimed(releases.filter((release) => release.status === 'CLAIMED')))
      .catch(() => setClaimed([]))
  }, [])

  /** Returns a claimed space to its dedicated holder -- the Spec's administrator intervention. */
  async function revert(release: ClaimedRelease) {
    if (reverting) return
    setReverting(release.id)
    setMessage('')
    setError('')
    try {
      await apiRequest(`/admin/parking-releases/${encodeURIComponent(release.id)}/claim`, { method: 'DELETE' })
      setMessage('The claim was reverted and the space returned to its dedicated holder.')
      await refresh()
    } catch (revertError) {
      setError(revertError instanceof ApiError && revertError.status === 409
        ? 'Only a claimed release can be reverted.'
        : 'The claim could not be reverted.')
    } finally {
      setReverting(null)
    }
  }

  useEffect(() => { void refresh() }, [refresh])

  async function generate() {
    if (generating) return
    setGenerating(true)
    setMessage('')
    setError('')
    try {
      const report = await apiRequest<WeeklyReport>('/admin/utilization/weekly-reports', {
        method: 'POST', body: JSON.stringify({}),
      })
      setMessage(report.deliveryError
        ? `Report generated for ${report.weekStart} to ${report.weekEnd}, but not emailed: ${report.deliveryError}`
        : `Report generated and emailed to ${report.recipients.join(', ')}.`)
      await refresh()
    } catch (generateError) {
      setError(generateError instanceof ApiError
        ? `The report could not be generated (${generateError.status}).`
        : 'The report could not be generated.')
    } finally {
      setGenerating(false)
    }
  }

  if (state === 'loading') {
    return <main className={styles.authState} role="status" aria-busy="true">Loading utilization…</main>
  }
  if (state === 'error' || !statistics) {
    return <main className={styles.authState} role="alert">Utilization could not be loaded.</main>
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div className={styles.breadcrumb}>Administration <span aria-hidden="true">›</span> <span>Utilization</span></div>
        <h1>Parking utilization</h1>
        <p className={styles.subtitle}>
          Week {statistics.weekStart} to {statistics.weekEnd}. Usage is derived from entrance records;
          Phase 1 monitors only and applies no penalties.
        </p>
      </div>

      {message && <p className={styles.success} role="status">{message}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <section className={styles.tiles} aria-label="Weekly totals">
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Released spaces</div>
          <div className={styles.tileValue}>{statistics.totals.releasedSpaces}</div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Temporary claims</div>
          <div className={styles.tileValue}>{statistics.totals.temporaryClaims}</div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Overall utilization</div>
          <div className={styles.tileValue}>{statistics.totals.utilizationPercentage}%</div>
        </div>
        <div className={styles.tile}>
          <div className={styles.tileLabel}>Used / allocated</div>
          <div className={styles.tileValue}>
            {statistics.totals.utilizedSpaces}/{statistics.totals.allocatedSpaces}
          </div>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="daily-heading">
        <h2 id="daily-heading">Daily utilization</h2>
        <table className={styles.table}>
          <thead>
            <tr><th>Date</th><th>Used</th><th>Allocated</th><th>Released</th><th>Claimed</th><th>Utilization</th></tr>
          </thead>
          <tbody>
            {statistics.daily.map((day) => (
              <tr key={day.date}>
                <td>{day.date}</td>
                <td>{day.utilizedSpaces}</td>
                <td>{day.allocatedSpaces}</td>
                <td>{day.releasedSpaces}</td>
                <td>{day.temporaryClaims}</td>
                <td>{day.utilizationPercentage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.card} aria-labelledby="unused-dedicated-heading">
        <h2 id="unused-dedicated-heading">Dedicated parking neither released nor used</h2>
        {statistics.unusedDedicated.length ? (
          <table className={styles.table}>
            <thead><tr><th>Date</th><th>Employee</th><th>Space</th></tr></thead>
            <tbody>
              {statistics.unusedDedicated.map((row) => (
                <tr key={`${row.employeeId}-${row.date}`}>
                  <td>{row.date}</td><td>{row.displayName} ({row.corporateEmail})</td><td>{row.spaceCode ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.empty}>None this week.</p>}
      </section>

      <section className={styles.card} aria-labelledby="unused-temporary-heading">
        <h2 id="unused-temporary-heading">Temporary parking claimed but not used</h2>
        {statistics.unusedTemporary.length ? (
          <table className={styles.table}>
            <thead><tr><th>Date</th><th>Employee</th><th>Space</th></tr></thead>
            <tbody>
              {statistics.unusedTemporary.map((row) => (
                <tr key={`${row.employeeId}-${row.date}`}>
                  <td>{row.date}</td><td>{row.displayName} ({row.corporateEmail})</td><td>{row.spaceCode ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.empty}>None this week.</p>}
      </section>

      <section className={styles.card} aria-labelledby="claimed-heading">
        <h2 id="claimed-heading">Claimed releases today</h2>
        <p className={styles.note}>
          Reverting returns the space to its dedicated holder. This is the only way a claimed
          release can be undone.
        </p>
        {claimed.length ? (
          <table className={styles.table}>
            <thead><tr><th>Space</th><th>Claimed by</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {claimed.map((release) => (
                <tr key={release.id}>
                  <td>{release.parkingSpace?.spaceCode ?? '—'}</td>
                  <td>{release.allocation?.claimant ?? '—'}</td>
                  <td>
                    <button
                      className={styles.primary}
                      type="button"
                      disabled={reverting === release.id}
                      onClick={() => void revert(release)}
                    >
                      {reverting === release.id ? 'Reverting…' : 'Revert claim'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.empty}>No claimed releases today.</p>}
      </section>

      <section className={styles.card} aria-labelledby="reports-heading">
        <h2 id="reports-heading">Weekly reports</h2>
        <p className={styles.note}>
          Generated automatically every Monday morning and emailed to the configured stakeholders.
        </p>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => void generate()} disabled={generating}>
            {generating ? 'Generating…' : 'Generate last week’s report now'}
          </button>
        </div>
        {reports.length ? (
          <table className={styles.table}>
            <thead><tr><th>Week</th><th>Generated</th><th>Recipients</th><th>Delivery</th></tr></thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{report.weekStart} → {report.weekEnd}</td>
                  <td>{new Date(report.generatedAt).toLocaleString()}</td>
                  <td>{report.recipients.join(', ') || '—'}</td>
                  <td>{report.emailedAt ? 'Emailed' : report.deliveryError ?? 'Not sent'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.empty}>No reports generated yet.</p>}
      </section>
    </div>
  )
}

export default function UtilizationPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<{ identity: EmployeeIdentity } | 'loading' | 'denied'>('loading')

  useEffect(() => {
    let active = true
    apiRequest<EmployeeIdentity & { roles?: unknown }>('/employees/me').then((response) => {
      if (!active) return
      if (!response.corporateEmail || !normalizeRoles(response.roles).includes('administrator')) {
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

  if (auth === 'loading') return <main className={styles.authState} role="status">Checking administrator access…</main>
  if (auth === 'denied') return <ApplicationShell authState="unauthenticated"><AccessDenied /></ApplicationShell>
  return (
    <ApplicationShell role="administrator" identity={auth.identity} authState="authenticated">
      <UtilizationScreen />
    </ApplicationShell>
  )
}
