'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ApiError, apiRequest } from '../../lib/api-client'
import { AccessDenied, ApplicationShell } from '../../components/operations'
import styles from './page.module.css'

const FALLBACK_OFFICE_TIME_ZONE = 'America/Los_Angeles'
const modules = [
  { title: 'Assignments', description: 'Review and manage parking assignments', href: '/admin/assignments' },
  { title: 'Employees', description: 'Maintain employee and vehicle records', href: '/admin/employees' },
  { title: 'Configuration', description: 'Set office parking rules', href: '/admin/configuration' },
  { title: 'Reports', description: 'Review parking operations reports', href: '/admin/reports' },
]

type Identity = { displayName?: string; corporateEmail: string }
type Allocation = Record<string, unknown>
type Report = { data: Allocation[] }
type DashboardState = 'loading' | 'loaded' | 'error'
type AuthState = 'loading' | 'authenticated' | 'denied' | 'signed-out' | 'error'

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function officeToday(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${fields.year}-${fields.month}-${fields.day}`
}

function formatOfficeDateTime(value: string, timeZone: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return `${new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date)} office time`
}

function activityDetails(allocation: Allocation, timeZone: string): { name: string; detail: string; when: string; dateTime: string } {
  const employee = asObject(allocation.employee)
  const release = asObject(allocation.parkingRelease)
  const assignment = asObject(release?.parkingAssignment)
  const space = asObject(assignment?.parkingSpace)
  const floor = asObject(space?.parkingFloor)
  const timestamp = typeof allocation.allocatedAt === 'string' ? allocation.allocatedAt : ''
  const displayName = typeof employee?.displayName === 'string' ? employee.displayName : ''
  const email = typeof employee?.corporateEmail === 'string' ? employee.corporateEmail : ''
  const spaceCode = typeof space?.spaceCode === 'string' ? space.spaceCode : ''
  const floorName = typeof floor?.name === 'string'
    ? floor.name
    : typeof floor?.floorNumber === 'number' ? `Level ${floor.floorNumber}` : ''
  return {
    name: displayName || email || 'Employee',
    detail: [spaceCode, floorName].filter(Boolean).join(' · '),
    when: timestamp ? formatOfficeDateTime(timestamp, timeZone) : 'Time unavailable',
    dateTime: timestamp,
  }
}

async function loadOfficeTimeZone(): Promise<string> {
  try {
    const configuration = await apiRequest<unknown>('/admin/configuration')
    const timeZone = asObject(configuration)?.officeTimeZone
    if (typeof timeZone === 'string' && timeZone.trim()) return timeZone
  } catch {
    // A configuration lookup must not prevent the report and module navigation from working.
  }
  return FALLBACK_OFFICE_TIME_ZONE
}

async function loadReport(timeZone: string): Promise<Report> {
  const date = officeToday(timeZone)
  const query = new URLSearchParams({ reportType: 'allocations', startDate: date, endDate: date })
  const response = await apiRequest<unknown>(`/admin/reports?${query.toString()}`)
  const record = asObject(response)
  return { data: Array.isArray(record?.data) ? record.data.map((item) => asObject(item) ?? {}) : [] }
}

function parseIdentity(payload: unknown): { identity: Identity; administrator: boolean } | null {
  const record = asObject(payload)
  if (!record) return null
  const employee = asObject(record.employee) ?? record
  const email = typeof employee.corporateEmail === 'string'
    ? employee.corporateEmail
    : typeof employee.email === 'string' ? employee.email : ''
  if (!email) return null
  const roles = Array.isArray(record.roles) ? record.roles : Array.isArray(employee.roles) ? employee.roles : []
  const administrator = roles.some((item) => {
    const roleRecord = asObject(item)
    const role = typeof item === 'string' ? item : roleRecord?.role
    return typeof role === 'string' && ['administrator', 'admin', 'parking_administrator'].includes(role.toLowerCase())
  })
  return {
    identity: {
      corporateEmail: email,
      ...(typeof employee.displayName === 'string' ? { displayName: employee.displayName } : {}),
    },
    administrator,
  }
}

function Dashboard({ identity }: { identity: Identity }) {
  const [state, setState] = useState<DashboardState>('loading')
  const [report, setReport] = useState<Report | null>(null)
  const [officeTimeZone, setOfficeTimeZone] = useState(FALLBACK_OFFICE_TIME_ZONE)

  const refresh = useCallback(async () => {
    setState('loading')
    const timeZone = await loadOfficeTimeZone()
    setOfficeTimeZone(timeZone)
    try {
      const nextReport = await loadReport(timeZone)
      setReport(nextReport)
      setState('loaded')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const allocations = report?.data ?? []
  const employeesAllocated = new Set(allocations.map((allocation) => {
    const employee = asObject(allocation.employee)
    return employee?.id ?? employee?.corporateEmail ?? employee?.displayName
  }).filter(Boolean)).size
  const officeDate = officeToday(officeTimeZone)
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone: officeTimeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${officeDate}T12:00:00Z`))

  return (
    <ApplicationShell role="administrator" identity={identity} authState="authenticated">
      <div className={styles.content}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Operations workspace</p>
            <h1>Parking operations</h1>
            <p className={styles.description}>A clear view of today’s parking activity and administration tools.</p>
          </div>
          <div className={styles.dateChip} aria-label={`Today, ${formattedDate}, office time`}>
            {formattedDate}<span>Office time · {officeTimeZone}</span>
          </div>
        </header>

        <aside className={styles.accessNote}>
          <span aria-hidden="true">✓</span>
          <p><strong>Administrator access.</strong> Access is limited to authorized parking administrators.</p>
        </aside>

        <section className={styles.summary} aria-label="Today's operations summary" aria-busy={state === 'loading'}>
          {state === 'loading' ? (
            <>
              <article className={styles.statCard}><span className={styles.skeletonLabel}>Loading summary</span><span className={styles.skeletonValue} /></article>
              <article className={styles.statCard}><span className={styles.skeletonLabel}>Loading employees</span><span className={styles.skeletonValue} /></article>
            </>
          ) : state === 'error' ? (
            <div className={styles.errorCard} role="alert">
              <div><strong>The operations summary couldn’t be loaded.</strong><p>Today’s allocation report is temporarily unavailable.</p></div>
              <button className={styles.retryButton} type="button" onClick={() => void refresh()}>Retry summary</button>
            </div>
          ) : (
            <>
              <article className={styles.statCard}>
                <span className={styles.statLabel}>Today’s parking allocations</span>
                <strong className={styles.statValue}>{allocations.length}</strong>
                <span className={styles.statFootnote}>From the current-day allocations report</span>
              </article>
              <article className={styles.statCard}>
                <span className={styles.statLabel}>Employees allocated</span>
                <strong className={styles.statValue}>{employeesAllocated}</strong>
                <span className={styles.statFootnote}>Unique employees in today’s report</span>
              </article>
            </>
          )}
        </section>

        <div className={styles.dashboardGrid}>
          <section className={styles.modulesCard} aria-labelledby="modules-title">
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Administrator workspace</p><h2 id="modules-title">Manage your workspace</h2></div>
              <span className={styles.adminTag}>Admin tools</span>
            </div>
            <nav className={styles.moduleGrid} aria-label="Administrator modules">
              {modules.map((module, index) => (
                <Link className={`${styles.moduleLink} ${index === 0 ? styles.primaryModule : ''}`} href={module.href} key={module.href}>
                  <span className={styles.moduleIcon} aria-hidden="true">{['▣', '◉', '⚙', '▥'][index]}</span>
                  <span className={styles.moduleCopy}><strong>{module.title}</strong><span>{module.description}</span></span>
                  <span className={styles.arrow} aria-hidden="true">↗</span>
                </Link>
              ))}
            </nav>
          </section>

          <section className={styles.activityCard} aria-labelledby="activity-title" aria-live="polite">
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Office time</p><h2 id="activity-title">Recent activity</h2></div>
              <span className={styles.activityDate}>Today</span>
            </div>
            {state === 'loading' ? (
              <div className={styles.activityLoading} role="status">Loading parking operations…</div>
            ) : state === 'error' ? (
              <p className={styles.activityMessage}>Activity is unavailable until the summary report loads.</p>
            ) : allocations.length === 0 ? (
              <p className={styles.activityMessage}>No operational activity to show yet.</p>
            ) : (
              <ul className={styles.activityList}>
                {[...allocations].sort((left, right) => {
                  const a = typeof left.allocatedAt === 'string' ? Date.parse(left.allocatedAt) : 0
                  const b = typeof right.allocatedAt === 'string' ? Date.parse(right.allocatedAt) : 0
                  return b - a
                }).slice(0, 5).map((allocation, index) => {
                  const activity = activityDetails(allocation, officeTimeZone)
                  return <li className={styles.activityItem} key={String(allocation.id ?? `${activity.dateTime}-${index}`)}>
                    <span className={styles.activityAvatar} aria-hidden="true">{activity.name.slice(0, 1).toUpperCase()}</span>
                    <span className={styles.activityCopy}><strong>{activity.name}</strong> received a parking allocation{activity.detail && <span> · {activity.detail}</span>}</span>
                    <time className={styles.activityTime} dateTime={activity.dateTime || undefined}>{activity.when}</time>
                  </li>
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </ApplicationShell>
  )
}

export default function AdminPage() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [identity, setIdentity] = useState<Identity | null>(null)

  useEffect(() => {
    let active = true
    apiRequest<unknown>('/employees/me').then((payload) => {
      if (!active) return
      const parsed = parseIdentity(payload)
      if (!parsed) {
        setAuthState('signed-out')
      } else if (!parsed.administrator) {
        setAuthState('denied')
      } else {
        setIdentity(parsed.identity)
        setAuthState('authenticated')
      }
    }).catch((error: unknown) => {
      if (!active) return
      if (error instanceof ApiError && error.status === 401) setAuthState('signed-out')
      else if (error instanceof ApiError && error.status === 403) setAuthState('denied')
      else setAuthState('error')
    })
    return () => { active = false }
  }, [])

  if (authState === 'loading') {
    return <main className={styles.authLoading} role="status">Loading parking operations…</main>
  }
  if (authState === 'denied') return <div className={styles.denied}><AccessDenied /></div>
  if (authState === 'signed-out') {
    return <main className={styles.authMessage} role="alert"><h1>Sign in required</h1><p>Sign in with your Folio3 account to access parking operations.</p><Link href="/sign-in">Sign in</Link></main>
  }
  if (authState === 'error' || !identity) {
    return <main className={styles.authMessage} role="alert"><h1>Unable to verify access</h1><p>Your administrator access could not be verified. Please try again.</p><button className={styles.retryButton} type="button" onClick={() => location.reload()}>Try again</button></main>
  }
  return <Dashboard identity={identity} />
}
