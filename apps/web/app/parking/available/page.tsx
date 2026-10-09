'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiRequest } from '../../../lib/api-client'
import { AccessDenied, ApplicationShell } from '../../../components/operations'
import { normalizeRoles } from '../../../lib/roles'
import type { EmployeeIdentity, SessionRole } from '../../../lib/session'
import { AvailableParkingScreen } from './available-parking-screen'
import styles from './page.module.css'

interface SessionResponse {
  employee?: EmployeeIdentity & { roles?: unknown }
  corporateEmail?: string
  displayName?: string
  roles?: unknown
}

export default function AvailableParkingPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<{ role: SessionRole; identity: EmployeeIdentity } | 'loading' | 'denied'>('loading')

  useEffect(() => {
    let active = true
    apiRequest<SessionResponse>('/employees/me').then((response) => {
      if (!active) return
      const employee = response.employee ?? response as EmployeeIdentity
      const roles = normalizeRoles(response.roles ?? response.employee?.roles ?? [])
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
