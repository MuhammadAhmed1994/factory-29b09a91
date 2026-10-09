'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiRequest } from '../../../lib/api-client'
import { AccessDenied, ApplicationShell } from '../../../components/operations'
import { normalizeRoles } from '../../../lib/roles'
import type { EmployeeIdentity } from '../../../lib/session'
import styles from './page.module.css'

export interface Vehicle {
  id: string
  vehicleIdentifier: string
  make: string | null
  model: string | null
  color: string | null
  hasPermanentSticker: boolean
}

const EMPTY = { vehicleIdentifier: '', make: '', model: '', color: '' }

export function VehicleProfileScreen({ firstLogin }: { firstLogin?: boolean }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [form, setForm] = useState({ ...EMPTY })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      setVehicles(await apiRequest<Vehicle[]>('/employees/me/vehicles', { cache: 'no-store' }))
      setState('ready')
    } catch {
      setState('error')
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  function reset() {
    setForm({ ...EMPTY })
    setEditingId(null)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (!form.vehicleIdentifier.trim()) {
      setError('Enter the licence plate number.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    // Blank optional fields are sent as null so clearing a value actually removes it.
    const payload = {
      vehicleIdentifier: form.vehicleIdentifier.trim(),
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      color: form.color.trim() || null,
    }
    try {
      if (editingId) {
        await apiRequest(`/employees/me/vehicles/${encodeURIComponent(editingId)}`, {
          method: 'PATCH', body: JSON.stringify(payload),
        })
        setMessage('Vehicle updated.')
      } else {
        await apiRequest('/employees/me/vehicles', { method: 'POST', body: JSON.stringify(payload) })
        setMessage('Vehicle registered.')
      }
      reset()
      await refresh()
    } catch (saveError) {
      setError(
        saveError instanceof ApiError && saveError.status === 409
          ? 'That licence plate is already registered.'
          : 'The vehicle could not be saved. Check the details and try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function remove(vehicle: Vehicle) {
    setError('')
    setMessage('')
    try {
      await apiRequest(`/employees/me/vehicles/${encodeURIComponent(vehicle.id)}`, { method: 'DELETE' })
      setMessage(`${vehicle.vehicleIdentifier} removed.`)
      await refresh()
    } catch {
      setError('The vehicle could not be removed. Try again.')
    }
  }

  if (state === 'loading') {
    return <main className={styles.authState} role="status" aria-busy="true">Loading your vehicles…</main>
  }

  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <div className={styles.breadcrumb}>Workspace <span aria-hidden="true">›</span> <span>My vehicles</span></div>
        <h1>My vehicles</h1>
        <p className={styles.subtitle}>
          Security matches the licence plate at the entrance against your registered vehicles.
        </p>
      </div>

      {firstLogin && !vehicles.length && (
        <p className={styles.prompt} role="status">
          <strong>Register your vehicle to continue</strong>
          You need at least one licence plate on file before you can claim a parking space.
        </p>
      )}
      {message && <p className={styles.success} role="status">{message}</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}

      <section className={styles.card} aria-labelledby="vehicle-form-heading">
        <h2 id="vehicle-form-heading">{editingId ? 'Edit vehicle' : 'Register a vehicle'}</h2>
        <form onSubmit={submit} noValidate>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="vehicleIdentifier">Licence plate <span className={styles.required}>*</span></label>
              <input
                id="vehicleIdentifier"
                value={form.vehicleIdentifier}
                disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, vehicleIdentifier: event.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="make">Make (optional)</label>
              <input id="make" value={form.make} disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, make: event.target.value }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="model">Model (optional)</label>
              <input id="model" value={form.model} disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} />
            </div>
            <div className={styles.field}>
              <label htmlFor="color">Colour (optional)</label>
              <input id="color" value={form.color} disabled={saving}
                onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} />
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.primary} type="submit" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Register vehicle'}
            </button>
            {editingId && (
              <button className={styles.secondary} type="button" onClick={reset} disabled={saving}>Cancel</button>
            )}
          </div>
        </form>
      </section>

      <section className={styles.card} aria-labelledby="vehicle-list-heading">
        <h2 id="vehicle-list-heading">Registered vehicles</h2>
        {vehicles.length ? (
          <table className={styles.table}>
            <thead>
              <tr><th>Licence plate</th><th>Vehicle</th><th>Entrance</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td className={styles.plate}>{vehicle.vehicleIdentifier}</td>
                  <td className={styles.meta}>
                    {[vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(' · ') || 'No details recorded'}
                  </td>
                  <td>
                    {vehicle.hasPermanentSticker
                      ? <span className={styles.sticker}>Permanent sticker</span>
                      : <span className={styles.meta}>Verified per day</span>}
                  </td>
                  <td>
                    <button className={styles.secondary} type="button" onClick={() => {
                      setEditingId(vehicle.id)
                      setForm({
                        vehicleIdentifier: vehicle.vehicleIdentifier,
                        make: vehicle.make ?? '',
                        model: vehicle.model ?? '',
                        color: vehicle.color ?? '',
                      })
                    }}>Edit</button>
                    <button className={styles.danger} type="button" onClick={() => void remove(vehicle)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className={styles.empty}>No vehicles registered yet.</p>
        )}
      </section>
    </div>
  )
}

export default function VehiclesPage() {
  const router = useRouter()
  const [auth, setAuth] = useState<{ identity: EmployeeIdentity } | 'loading' | 'denied'>('loading')

  useEffect(() => {
    let active = true
    apiRequest<EmployeeIdentity & { roles?: unknown }>('/employees/me').then((response) => {
      if (!active) return
      if (!response.corporateEmail || !normalizeRoles(response.roles).includes('employee')) {
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
    <ApplicationShell role="employee" identity={auth.identity} authState="authenticated">
      <VehicleProfileScreen />
    </ApplicationShell>
  )
}
