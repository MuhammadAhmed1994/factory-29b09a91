'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { AccessDenied, ApplicationShell, StatusBadge } from '../../../components/operations'
import { ApiError, apiRequest } from '../../../lib/api-client'
import type { EmployeeIdentity, EmployeeSession, SessionRole } from '../../../lib/session'
import { normalizeRoles } from '../../../lib/roles'
import styles from './page.module.css'

type Assignment = {
  id: string
  employeeId: string
  parkingSpaceId: string
  effectiveFrom: string
  effectiveTo?: string | null
  employee?: { id: string; corporateEmail: string; displayName?: string }
  parkingSpace?: {
    id: string
    spaceCode?: string
    parkingFloor?: { floorNumber?: string | number; name?: string }
  }
  status?: string
}

type Employee = { id: string; corporateEmail: string; displayName?: string; isActive?: boolean }
type FormValues = { employeeId: string; parkingSpaceId: string; effectiveFrom: string; effectiveTo: string }
type FieldErrors = Partial<Record<keyof FormValues, string>>

const emptyForm: FormValues = { employeeId: '', parkingSpaceId: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '' }

function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Something went wrong. Please try again.'
}

function inlineErrors(error: unknown): { fields: FieldErrors; message: string } {
  if (!(error instanceof ApiError) || typeof error.details !== 'object' || error.details === null) {
    return { fields: {}, message: errorMessage(error) }
  }
  const details = error.details as { fieldErrors?: Record<string, unknown>; message?: unknown }
  const serverFields = details.fieldErrors ?? {}
  const fields: FieldErrors = {}
  for (const key of ['employeeId', 'parkingSpaceId', 'effectiveFrom', 'effectiveTo'] as const) {
    if (typeof serverFields[key] === 'string') fields[key] = serverFields[key] as string
  }
  return { fields, message: typeof details.message === 'string' ? details.message : errorMessage(error) }
}

function dateOnly(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

function AssignmentWorkspace({ role, identity }: { role: SessionRole; identity: EmployeeSession['employee'] }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editing, setEditing] = useState<Assignment | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormValues>(emptyForm)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Assignment | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const loadAssignments = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [records, people] = await Promise.all([
        apiRequest<Assignment[]>('/admin/parking-assignments'),
        apiRequest<Employee[]>('/admin/employees'),
      ])
      setAssignments(Array.isArray(records) ? records : [])
      setEmployees(Array.isArray(people) ? people : [])
    } catch (error) {
      setLoadError(errorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadAssignments() }, [loadAssignments])

  const rows = useMemo(() => assignments.filter((row) => {
    const employee = row.employee?.corporateEmail ?? ''
    const space = row.parkingSpace?.spaceCode ?? row.parkingSpaceId
    const floor = row.parkingSpace?.parkingFloor?.name ?? String(row.parkingSpace?.parkingFloor?.floorNumber ?? '')
    const needle = query.trim().toLowerCase()
    const status = row.status ?? (row.effectiveTo && dateOnly(row.effectiveTo) < new Date().toISOString().slice(0, 10) ? 'inactive' : 'active')
    return (!needle || `${employee} ${space} ${floor}`.toLowerCase().includes(needle)) && (statusFilter === 'all' || status.toLowerCase() === statusFilter)
  }), [assignments, query, statusFilter])

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setFieldErrors({})
    setFormError('')
    setFormOpen(true)
  }

  async function openEdit(assignment: Assignment) {
    setFormError('')
    setFieldErrors({})
    try {
      const fresh = await apiRequest<Assignment>(`/admin/parking-assignments/${encodeURIComponent(assignment.id)}`)
      setEditing(fresh)
      setForm({
        employeeId: fresh.employeeId,
        parkingSpaceId: fresh.parkingSpaceId,
        effectiveFrom: dateOnly(fresh.effectiveFrom),
        effectiveTo: dateOnly(fresh.effectiveTo),
      })
      setFormOpen(true)
    } catch (error) {
      setAnnouncement(`Could not open assignment: ${errorMessage(error)}`)
    }
  }

  function requestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: FieldErrors = {}
    if (!form.employeeId) errors.employeeId = 'Choose an employee.'
    if (!form.parkingSpaceId.trim()) errors.parkingSpaceId = 'Enter a parking space.'
    if (!form.effectiveFrom) errors.effectiveFrom = 'Choose an effective date.'
    setFieldErrors(errors)
    setFormError('')
    if (Object.keys(errors).length) return
    setConfirmSave(true)
  }

  async function saveAssignment() {
    setSaving(true)
    setFormError('')
    setFieldErrors({})
    const body = {
      employeeId: form.employeeId,
      parkingSpaceId: form.parkingSpaceId.trim(),
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
    }
    try {
      const saved = editing
        ? await apiRequest<Assignment>(`/admin/parking-assignments/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiRequest<Assignment>('/admin/parking-assignments', { method: 'POST', body: JSON.stringify(body) })
      const refreshed = await apiRequest<Assignment>(`/admin/parking-assignments/${encodeURIComponent(saved.id)}`)
      setAssignments((current) => editing
        ? current.map((row) => row.id === refreshed.id ? refreshed : row)
        : [refreshed, ...current.filter((row) => row.id !== refreshed.id)])
      setFormOpen(false)
      setConfirmSave(false)
      setAnnouncement(editing ? 'Assignment saved. The updated record is shown in the list.' : 'Assignment added. The new record is shown in the list.')
    } catch (error) {
      const parsed = inlineErrors(error)
      setFieldErrors(parsed.fields)
      setFormError(parsed.message)
      setConfirmSave(false)
      setAnnouncement(`Assignment could not be saved. ${parsed.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function deleteAssignment() {
    if (!pendingDelete) return
    const target = pendingDelete
    try {
      await apiRequest<void>(`/admin/parking-assignments/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      setAssignments((current) => current.filter((row) => row.id !== target.id))
      setPendingDelete(null)
      setAnnouncement('Assignment deleted.')
    } catch (error) {
      setPendingDelete(null)
      setAnnouncement(`Assignment could not be deleted. ${errorMessage(error)}`)
    }
  }

  const fullName = identity.displayName || identity.corporateEmail

  return <ApplicationShell role={role} identity={identity} authState="authenticated">
    <div className={styles.page}>
      <div className={styles.breadcrumb}>Administration <span aria-hidden="true">›</span> <strong>Parking assignments</strong></div>
      <section className={styles.pageHeading} aria-labelledby="assignments-title">
        <div><p className={styles.eyebrow}>Administration / Parking</p><h1 id="assignments-title">Parking assignments</h1><p className={styles.description}>Manage who parks where across your office.</p></div>
        <button className={styles.primaryButton} type="button" onClick={openNew}>＋ Add assignment</button>
      </section>
      <section className={styles.summary} aria-label="Allocation overview">
        <div><span className={styles.summaryKicker}>Allocation overview</span><strong>Employee parking records</strong><span>Review active assignments and update employee space allocations.</span></div>
        <div className={styles.summaryStat}><strong>{assignments.length}</strong><span>Total assignments</span></div>
      </section>
      <div className={styles.announcement} aria-live="polite" role="status">{announcement}</div>

      <section className={styles.tableCard} aria-labelledby="records-title">
        <div className={styles.tableHeader}>
          <div><h2 id="records-title">Assignment records</h2><p>Review employee space allocations and their current status.</p></div>
          <div className={styles.controls}>
            <label className={styles.searchLabel} htmlFor="assignment-search">Search assignments</label>
            <input id="assignment-search" className={styles.input} type="search" placeholder="Search email or space" value={query} onChange={(event) => setQuery(event.target.value)} />
            <label className={styles.filterLabel} htmlFor="status-filter">Status</label>
            <select id="status-filter" className={styles.select} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        {loading ? <div className={styles.state} role="status" aria-busy="true">Loading assignments…</div> : loadError ? <div className={styles.errorState} role="alert"><p>Assignments couldn’t be loaded. {loadError}</p><button className={styles.secondaryButton} type="button" onClick={() => void loadAssignments()}>Retry</button></div> : rows.length === 0 ? <div className={styles.state} role="status"><strong>No assignments match this view.</strong><span>Clear the search or filters, or add an assignment.</span><button className={styles.secondaryButton} type="button" onClick={() => { setQuery(''); setStatusFilter('all') }}>Clear filters</button></div> : (
          <div className={styles.tableScroll} tabIndex={0} aria-label="Assignment records. Scroll horizontally to view all columns.">
            <table><thead><tr><th scope="col">Employee corporate email</th><th scope="col">Assigned space</th><th scope="col">Floor</th><th scope="col">Status</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead>
              <tbody>{rows.map((assignment) => {
                const email = assignment.employee?.corporateEmail || employees.find((person) => person.id === assignment.employeeId)?.corporateEmail || 'Employee email unavailable'
                const space = assignment.parkingSpace?.spaceCode || assignment.parkingSpaceId
                const floorInfo = assignment.parkingSpace?.parkingFloor
                const floor = floorInfo?.name || (floorInfo?.floorNumber !== undefined ? `Level ${floorInfo.floorNumber}` : '—')
                const status = assignment.status || (assignment.effectiveTo && dateOnly(assignment.effectiveTo) < new Date().toISOString().slice(0, 10) ? 'inactive' : 'active')
                return <tr key={assignment.id}><td className={styles.emailCell}>{email}</td><td className={styles.spaceCell}>{space}</td><td>{floor}</td><td><StatusBadge status={status === 'inactive' ? 'cancelled' : 'available'} label={status === 'inactive' ? 'Inactive' : 'Active'} /></td><td className={styles.rowActions}><button type="button" className={styles.rowButton} aria-label={`Edit assignment for ${email}, space ${space}`} onClick={() => void openEdit(assignment)}>Edit</button><button type="button" className={styles.deleteButton} aria-label={`Delete assignment for ${email}, space ${space}`} onClick={() => setPendingDelete(assignment)}>Delete</button></td></tr>
              })}</tbody>
            </table>
          </div>
        )}
        {!loading && !loadError && <footer className={styles.tableFooter}>Showing {rows.length} of {assignments.length} assignments</footer>}
      </section>

      {formOpen && <div className={styles.overlay} role="presentation"><section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="form-title">
        <div className={styles.dialogHeader}><div><h2 id="form-title">{editing ? 'Edit assignment' : 'Add assignment'}</h2><p>Changes affect parking records; confirm the employee and space before saving.</p></div><button className={styles.closeButton} type="button" aria-label="Close form" onClick={() => setFormOpen(false)}>×</button></div>
        <form onSubmit={requestSave} noValidate>
          <label className={styles.formField}>Employee <span className={styles.required}>Required</span>
            <select className={styles.input} value={form.employeeId} aria-invalid={Boolean(fieldErrors.employeeId)} aria-describedby={fieldErrors.employeeId ? 'employee-error' : undefined} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))}>
              <option value="">Select employee</option>{employees.filter((person) => person.isActive !== false).map((person) => <option key={person.id} value={person.id}>{person.corporateEmail}{person.displayName ? ` · ${person.displayName}` : ''}</option>)}
            </select>{fieldErrors.employeeId && <span className={styles.fieldError} id="employee-error">{fieldErrors.employeeId}</span>}
          </label>
          <label className={styles.formField}>Parking space ID <span className={styles.required}>Required</span><input className={styles.input} value={form.parkingSpaceId} aria-invalid={Boolean(fieldErrors.parkingSpaceId)} aria-describedby={fieldErrors.parkingSpaceId ? 'space-error' : undefined} placeholder="Parking space identifier" onChange={(event) => setForm((current) => ({ ...current, parkingSpaceId: event.target.value }))} />{fieldErrors.parkingSpaceId && <span className={styles.fieldError} id="space-error">{fieldErrors.parkingSpaceId}</span>}</label>
          <div className={styles.dateFields}><label className={styles.formField}>Effective from <input className={styles.input} type="date" value={form.effectiveFrom} aria-invalid={Boolean(fieldErrors.effectiveFrom)} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} />{fieldErrors.effectiveFrom && <span className={styles.fieldError}>{fieldErrors.effectiveFrom}</span>}</label><label className={styles.formField}>Effective to <span className={styles.optional}>Optional</span><input className={styles.input} type="date" value={form.effectiveTo} aria-invalid={Boolean(fieldErrors.effectiveTo)} onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value }))} />{fieldErrors.effectiveTo && <span className={styles.fieldError}>{fieldErrors.effectiveTo}</span>}</label></div>
          {formError && <p className={styles.formError} role="alert">{formError}</p>}
          <div className={styles.formActions}><button className={styles.secondaryButton} type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className={styles.primaryButton} type="submit">Review and save</button></div>
        </form>
      </section></div>}

      {confirmSave && <div className={styles.overlay} role="presentation"><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-copy"><h2 id="confirm-title">Confirm assignment changes</h2><p id="confirm-copy">Save this parking assignment for {employees.find((person) => person.id === form.employeeId)?.corporateEmail || 'the selected employee'} in space {form.parkingSpaceId}?</p>{formError && <p className={styles.formError} role="alert">{formError}</p>}<div className={styles.formActions}><button className={styles.secondaryButton} type="button" disabled={saving} onClick={() => setConfirmSave(false)}>Go back</button><button className={styles.primaryButton} type="button" disabled={saving} onClick={() => void saveAssignment()}>{saving ? 'Saving…' : 'Confirm save'}</button></div></section></div>}

      {pendingDelete && <div className={styles.overlay} role="presentation"><section className={styles.confirmDialog} role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete assignment?</h2><p>This permanently removes the assignment for {pendingDelete.employee?.corporateEmail || pendingDelete.employeeId} from space {pendingDelete.parkingSpace?.spaceCode || pendingDelete.parkingSpaceId}.</p><div className={styles.formActions}><button className={styles.secondaryButton} type="button" onClick={() => setPendingDelete(null)}>Keep assignment</button><button className={styles.deleteConfirm} type="button" onClick={() => void deleteAssignment()}>Delete assignment</button></div></section></div>}
    </div>
  </ApplicationShell>
}

export default function AssignmentsPage() {
  const [session, setSession] = useState<EmployeeSession | null>(null)
  const [authError, setAuthError] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    apiRequest<Partial<EmployeeSession> & Partial<EmployeeIdentity> & { roles?: unknown }>('/employees/me')
      // /employees/me returns the profile unwrapped; older callers sent a { employee, roles } envelope.
      .then((result) => setSession({ employee: result.employee ?? (result as EmployeeIdentity), roles: normalizeRoles(result.roles) }))
      .catch((error: unknown) => setAuthError(error instanceof ApiError && error.status === 401 ? 'Your session has expired. Sign in again to continue.' : 'We could not verify your administrator access.'))
      .finally(() => setChecking(false))
  }, [])

  if (checking) return <main className={styles.authState} role="status" aria-busy="true">Checking administrator access…</main>
  if (authError) return <main className={styles.authState}><AccessDenied message={authError} /></main>
  if (!session?.roles.includes('administrator')) return <ApplicationShell role={session?.roles[0] || 'employee'} identity={session?.employee} authState="authenticated"><AccessDenied /></ApplicationShell>
  return <AssignmentWorkspace role="administrator" identity={session.employee} />
}
