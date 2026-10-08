import { redirect } from 'next/navigation'
import { getSession, workspaceForSession } from '../lib/session'

export default async function Home() {
  const result = await getSession()

  if (result.status === 'expired') {
    redirect('/sign-in?reason=session-expired')
  }
  if (result.status === 'unauthenticated') {
    redirect('/sign-in')
  }

  redirect(workspaceForSession(result.session))
}
