'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiRequest } from '../../../lib/api-client'
import { AccessDenied, ApplicationShell } from '../../../components/operations'
import { normalizeRoles } from '../../../lib/roles'
import type { EmployeeIdentity } from '../../../lib/session'
import styles from './page.module.css'

interface EntryRecord {
  id: string
  vehicleIdentifier: string
  officeDate: string
  outcome: string
  authorized: boolean | null
  entryGranted: boolean
  source: string
  detectedAt: string
  employee: { id: string; displayName: string; corporateEmail: string } | null
}

const outcomeLabels: Record<string, string> = {
  TEMPORARY_ALLOCATION_AUTHORIZED: 'Authorized — temporary allocation',
  NO_VALID_TEMPORARY_ALLOCATION: 'Refused — no allocation',
  PERMANENT_STICKER_EXISTING_ENTRANCE_PROCESS: 'Permanent sticker — existing process',
  VEHICLE_NOT_REGISTERED: 'Refused — vehicle not registered',
}

export function EntryLogScreen() {
  const [records, setRecords] = useState<EntryRecord[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const refresh = useCallback(async () => {
    try {
      setRecords(await apiRequest<EntryRecord[]>('/security/entry-records', { cache: 'no-store' }))
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  if (state === 'loading') {
    return <main className={styles.authState} role="status" aria-busy="true">Loading entrance activity…</main>
  }
  if (state === 'error') {
    return <main className={styles.authState} role="alert">Entrance activity could not be loaded.</main>
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div className={styles.breadcrumb}>Security desk <span aria-hidden="true">›</span> <span>Entrance log</span></div>
        <h1>Entrance activity</h1>
        <p className={styles.subtitle}>
          Every verification attempt today, from the desk and the entrance camera, successful or not.
        </p>
      </div>

      <section className={styles.card} aria-labelledby="entry-log-heading">
        <h2 id="entry-log-heading">Today&apos;s verifications</h2>
        <div className={styles.actions}>
          <button className={styles.primary} type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
        {records.length ? (
          <table className={styles.table}>
            <thead>
              <tr><th>Time</th><th>Plate</th><th>Employee</th><th>Result</th><th>Entry</th><th>Source</th></tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{new Date(record.detectedAt).toLocaleTimeString()}</td>
                  <td>{record.vehicleIdentifier}</td>
                  <td>{record.employee ? record.employee.displayName : '—'}</td>
                  <td>{outcomeLabels[record.outcome] ?? record.outcome}</td>
                  <td>{record.entryGranted ? 'Allowed' : 'Not allowed'}</td>
                  <td>{record.source === 'LPR_CAMERA' ? 'Camera' : 'Security desk'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className={styles.empty}>No verification attempts recorded today.</p>}
      </section>
    </div>
  )
}

export default function EntryLogPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<{ identity: EmployeeIdentity } | 'loading' | 'denied'>('loading')

  useEffect(() => {
    let active = true
    apiRequest<EmployeeIdentity & { roles?: unknown }>('/employees/me').then((response) => {
      if (!active) return
      if (!response.corporateEmail || !normalizeRoles(response.roles).includes('security')) {
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
    <ApplicationShell role="security" identity={auth.identity} authState="authenticated">
      <EntryLogScreen />
    </ApplicationShell>
  )
}
