'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiRequest } from '../../lib/api-client'
import styles from './page.module.css'

const UNAUTHORIZED_MESSAGE = 'This account is not authorized to use Folio3 Parking. Sign in with an approved work account.'
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client'

interface GoogleCredentialResponse {
  credential: string
}

interface GooglePromptNotification {
  isNotDisplayed?: () => boolean
  isSkippedMoment?: () => boolean
  isDismissedMoment?: () => boolean
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string
        callback: (response: GoogleCredentialResponse) => void
      }) => void
      prompt: (callback?: (notification: GooglePromptNotification) => void) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentityServices
  }
}

interface SessionResponse {
  accessToken: string
  expiresIn?: number
  employee: {
    corporateEmail: string
    roles?: string[]
  }
}

function loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
  if (window.google) return Promise.resolve(window.google)

  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = GOOGLE_SCRIPT
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    const onLoad = () => {
      script?.removeEventListener('load', onLoad)
      script?.removeEventListener('error', onError)
      if (window.google) resolve(window.google)
      else reject(new Error('Google sign-in is unavailable'))
    }
    const onError = () => {
      script?.removeEventListener('load', onLoad)
      script?.removeEventListener('error', onError)
      reject(new Error('Google sign-in is unavailable'))
    }
    script.addEventListener('load', onLoad, { once: true })
    script.addEventListener('error', onError, { once: true })
  })
}

function workspaceForRoles(roles: string[] = []): string {
  const normalizedRoles = roles.map((role) => role.toLowerCase())
  if (normalizedRoles.some((role) => role === 'administrator' || role === 'admin' || role.includes('admin'))) return '/admin'
  if (normalizedRoles.some((role) => role === 'security' || role === 'security_guard')) return '/security/verify'
  return '/parking/available'
}

export default function SignInPage() {
  const router = useRouter()
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [signedInEmail, setSignedInEmail] = useState('')
  const inFlight = useRef(false)

  const exchangeCredential = async (credential: string) => {
    try {
      const session = await apiRequest<SessionResponse>('/auth/google/session', {
        method: 'POST',
        body: JSON.stringify({ credential }),
      })
      if (!session.accessToken || !session.employee?.corporateEmail) throw new Error('Invalid session response')

      // The API guard accepts this session cookie, and the server-side route guard verifies it
      // against /employees/me before granting access to the role-specific workspace.
      const maxAge = Number.isFinite(session.expiresIn) ? Math.max(0, session.expiresIn!) : 8 * 60 * 60
      document.cookie = `parking_session=${encodeURIComponent(session.accessToken)}; path=/; max-age=${maxAge}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      setSignedInEmail(session.employee.corporateEmail)
      setError('')
      router.push(workspaceForRoles(session.employee.roles))
    } catch {
      setError(UNAUTHORIZED_MESSAGE)
      setConnecting(false)
      inFlight.current = false
    }
  }

  const startSignIn = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setConnecting(true)
    setError('')
    setSignedInEmail('')

    try {
      const google = await loadGoogleIdentityServices()
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
      if (!clientId) throw new Error('Google sign-in is unavailable')

      google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => void exchangeCredential(credential),
      })
      google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
          setError(UNAUTHORIZED_MESSAGE)
          setConnecting(false)
          inFlight.current = false
        }
      })
    } catch {
      setError(UNAUTHORIZED_MESSAGE)
      setConnecting(false)
      inFlight.current = false
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/" aria-label="Folio3 Parking home">
          <span className={styles.brandMark} aria-hidden="true">P</span>
          <span className={styles.brandName}>Folio3 <span>Parking</span></span>
        </a>
        <div className={styles.secureLabel}><span aria-hidden="true">◈</span> Secure workspace</div>
      </header>

      <main className={styles.main}>
        <section className={styles.authWrap} aria-labelledby="page-title">
          <div className={styles.eyebrow}>Folio3 account access</div>
          <article className={styles.card}>
            <header className={styles.cardHeader}>
              {signedInEmail ? <div className={styles.successMark} aria-hidden="true">✓</div> : null}
              <h1 id="page-title">Sign in to Folio3 Parking</h1>
              <p className={styles.intro}>Continue with your authorized Google Workspace account to access your parking workspace.</p>
            </header>

            {signedInEmail ? (
              <div className={styles.identityPanel} role="status" aria-live="polite">
                <span className={styles.identityIcon} aria-hidden="true">✓</span>
                <div className={styles.identityCopy}>
                  <div className={styles.identityLabel}>Signed in as</div>
                  <div className={styles.identityEmail}>{signedInEmail}</div>
                </div>
                <span className={styles.verifiedTag}>Verified</span>
              </div>
            ) : (
              <>
                <p className={styles.emptyMessage}>Continue with your Folio3 Google Workspace account.</p>
                <button
                  className={styles.continueButton}
                  type="button"
                  onClick={startSignIn}
                  disabled={connecting}
                  aria-label="Continue with Google Workspace"
                >
                  <svg aria-hidden="true" viewBox="0 0 48 48" className={styles.googleIcon}>
                    <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z" />
                    <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4.1 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z" />
                    <path fill="#FBBC05" d="M12.8 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 17.9l6.9-5.1Z" />
                    <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 6 29.5 4 24 4A20 20 0 0 0 5.9 15l6.9 5.2C14.4 15.5 18.8 12 24 12Z" />
                  </svg>
                  {connecting ? 'Connecting to Google Workspace…' : 'Continue with Google Workspace'}
                </button>
              </>
            )}

            {connecting && !signedInEmail ? (
              <p className={styles.progress} role="status" aria-live="polite">Connecting to Google Workspace…</p>
            ) : null}
            <div className={styles.eligibilityNote}>
              <span className={styles.noteIcon} aria-hidden="true">ⓘ</span>
              <span>Use your authorized <strong>Folio3 work account</strong>. Personal Google accounts are not permitted.</span>
            </div>
            <p className={styles.footnote}>Access is limited to approved Folio3 Google Workspace accounts.</p>
          </article>
          <div className={styles.errorMessage} role="alert" aria-live="assertive">{error}</div>
        </section>
      </main>

      <footer className={styles.pageFooter} aria-label="Application information">
        <span>Folio3 Parking</span><span>Authorized employees only</span>
      </footer>
    </div>
  )
}
