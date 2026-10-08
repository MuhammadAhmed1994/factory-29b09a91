import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getSession, hasAnyRole, type SessionRole } from '../lib/session'

interface RouteGuardProps {
  children: ReactNode
  requiredRoles: readonly SessionRole[]
}

/** Server-side interface guard; API endpoints must enforce the same authorization themselves. */
export default async function RouteGuard({ children, requiredRoles }: RouteGuardProps) {
  const result = await getSession()
  if (result.status !== 'authenticated') {
    redirect(result.status === 'expired' ? '/sign-in?reason=session-expired' : '/sign-in')
  }

  if (!hasAnyRole(result.session, requiredRoles)) {
    return (
      <main aria-labelledby="access-denied-title" role="main">
        <section aria-live="polite" role="status">
          <h1 id="access-denied-title">Access denied</h1>
          <p>You do not have permission to view this page.</p>
        </section>
      </main>
    )
  }

  return <>{children}</>
}
