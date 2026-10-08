'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, apiRequest } from '../../../lib/api-client'
import styles from './page.module.css'

interface VerificationResult {
  vehicleIdentifier: string
  date?: string
  authorized: boolean | null
  outcome?: string
  allocatedAt?: string
  allocationDate?: string
  allocationTime?: string
  reason?: string
}

export interface VehicleVerificationProps {
  officeDate: string
  officeTimeZone: string
}

function formatDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(parsed)
}

function formatTime(value: string, timeZone?: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}),
  }).format(parsed)
}

export function VehicleVerification({ officeDate, officeTimeZone }: VehicleVerificationProps) {
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const vehicleIdentifier = identifier.trim()
    if (!vehicleIdentifier || inFlight.current) return

    inFlight.current = true
    setLoading(true)
    setError(null)
    setAccessDenied(false)
    setResult(null)
    try {
      const response = await apiRequest<VerificationResult>('/security/vehicle-verifications', {
        method: 'POST',
        // The protected API derives the current office day from its configured time zone.
        body: JSON.stringify({ vehicleIdentifier }),
      })
      setResult(response)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setAccessDenied(true)
      } else {
        setError("The authorization check couldn't be completed. Use the established fallback process.")
      }
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  function clearLookup() {
    if (inFlight.current) return
    setIdentifier('')
    setResult(null)
    setError(null)
    setAccessDenied(false)
    inputRef.current?.focus()
  }

  const isPermanentSticker = result?.outcome === 'PERMANENT_STICKER_EXISTING_ENTRANCE_PROCESS'
  const authorized = result?.authorized === true

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Security desk</p>
          <h1>Verify temporary parking</h1>
          <p className={styles.description}>Check a vehicle’s temporary allocation before granting entrance.</p>
        </div>
        <div className={styles.dateChip} aria-label={`Office date: ${formatDate(officeDate)}`}>
          <span aria-hidden="true">▦</span>
          <span>{formatDate(officeDate)}</span>
          <span className={styles.officeLabel}>Office date</span>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.card} aria-labelledby="lookup-title">
          <h2 id="lookup-title">Vehicle lookup</h2>
          <p className={styles.subtitle}>Search temporary allocations for today.</p>
          <form onSubmit={submit}>
            <label className={styles.label} htmlFor="vehicle-identifier">Vehicle identifier</label>
            <div className={styles.formRow}>
              <input
                ref={inputRef}
                id="vehicle-identifier"
                name="vehicleIdentifier"
                autoComplete="off"
                spellCheck={false}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                aria-describedby="lookup-help"
              />
              <button className={styles.primaryButton} type="submit" disabled={loading || !identifier.trim()}>
                {loading ? 'Checking…' : 'Check authorization'}
              </button>
            </div>
            <div className={styles.formFooter}>
              <p className={styles.helper} id="lookup-help">
                Checks temporary allocations for today only, using the office-local date. Vehicles with permanent stickers follow the existing entrance process.
              </p>
              <button className={styles.clearButton} type="button" onClick={clearLookup} disabled={loading}>Clear</button>
            </div>
          </form>
        </section>

        {loading && (
          <section className={`${styles.result} ${styles.loading}`} aria-live="polite" aria-busy="true" role="status">
            <span className={styles.resultIcon} aria-hidden="true">…</span>
            <div><h2>Checking today’s allocation…</h2><p>Vehicle identifier: <code>{identifier}</code></p></div>
          </section>
        )}

        {!loading && !result && !error && !accessDenied && (
          <section className={`${styles.result} ${styles.empty}`} aria-live="polite" role="status">
            <span className={styles.resultIcon} aria-hidden="true">i</span>
            <div><h2>Ready to verify</h2><p>Enter a vehicle identifier to check authorization.</p></div>
          </section>
        )}

        {!loading && error && (
          <section className={`${styles.result} ${styles.failure}`} aria-live="assertive" role="alert">
            <span className={styles.resultIcon} aria-hidden="true">!</span>
            <div><h2>Lookup unavailable</h2><p>{error}</p></div>
          </section>
        )}

        {!loading && accessDenied && (
          <section className={`${styles.result} ${styles.failure}`} aria-live="assertive" role="alert">
            <span className={styles.resultIcon} aria-hidden="true">!</span>
            <div><h2>Access denied</h2><p>Your account does not have the security role required to verify vehicles.</p></div>
          </section>
        )}

        {!loading && result && (
          <section className={`${styles.result} ${isPermanentSticker ? styles.empty : authorized ? styles.authorized : styles.denied}`} aria-live="polite" role="status">
            <span className={styles.resultIcon} aria-hidden="true">{isPermanentSticker ? 'i' : authorized ? '✓' : '!'}</span>
            <div className={styles.resultBody}>
              <p className={styles.resultLabel}>{isPermanentSticker ? 'Existing entrance process' : 'Authorization result'}</p>
              <h2>{isPermanentSticker ? 'Permanent sticker vehicle' : authorized ? 'Authorized' : 'Not authorized'}</h2>
              <p>{isPermanentSticker
                ? 'This vehicle has a permanent sticker. Follow the existing entrance process; this check does not decide its entry.'
                : result.reason || (authorized ? 'Authorized for today’s temporary allocation.' : 'No valid temporary allocation was found for today.')}</p>
              <p className={styles.vehicleRef}>Vehicle: <code>{result.vehicleIdentifier || identifier}</code></p>
              {!isPermanentSticker && <p className={styles.allocationDate}>Allocation date: {formatDate(result.date || officeDate)}</p>}
              {result.allocationDate && <p className={styles.allocationDate}>Allocation date: {formatDate(result.allocationDate)}</p>}
              {(result.allocatedAt || result.allocationTime) && (
                <p className={styles.allocationDate}>Allocation time: {result.allocationTime || (result.allocatedAt ? formatTime(result.allocatedAt, officeTimeZone) : '')} <span>office time</span></p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
