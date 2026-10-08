'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError, apiRequest } from '../../../lib/api-client'
import styles from './page.module.css'

type Employee = {
  id: string
  corporateEmail: string
  displayName: string
  department?: string | null
  employeeNumber?: string | null
  isActive: boolean
  vehicles?: { vehicleIdentifier: string; make?: string | null; model?: string | null }[]
}
type ProfileDraft = { corporateEmail: string; displayName: string; department: string; employeeNumber: string }
type FieldErrors = Partial<Record<keyof ProfileDraft, string>>

const emptyDraft: ProfileDraft = { corporateEmail: '', displayName: '', department: '', employeeNumber: '' }
const emailPattern = /^[^\s@]+@folio3\.com$/i

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}

function getFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== 'object') return {}
  const body = error.details as { message?: unknown }
  if (!Array.isArray(body.message)) return {}
  const errors: FieldErrors = {}
  for (const issue of body.message) {
    if (typeof issue !== 'string') continue
    const match = issue.match(/^(corporateEmail|displayName|department|employeeNumber)\s/)
    if (match) errors[match[1] as keyof ProfileDraft] = issue
  }
  return errors
}

function vehicleSummary(employee: Employee) {
  if (employee.vehicles?.length) return employee.vehicles.map((vehicle) => [vehicle.vehicleIdentifier, vehicle.make, vehicle.model].filter(Boolean).join(' · ')).join(', ')
  return 'Vehicle details are not included in this directory record.'
}

export default function EmployeeDirectoryPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Employee | null>(null)
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState('')
  const [accessDenied, setAccessDenied] = useState(false)
  const [deactivating, setDeactivating] = useState('')

  const loadEmployees = useCallback(async (term: string) => {
    setLoading(true)
    setLoadError('')
    setAccessDenied(false)
    try {
      const params = term ? `?search=${encodeURIComponent(term)}` : ''
      const result = await apiRequest<Employee[]>(`/admin/employees${params}`)
      setEmployees(Array.isArray(result) ? result : [])
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) setAccessDenied(true)
      else setLoadError(getMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadEmployees('') }, [loadEmployees])
  const activeCount = useMemo(() => employees.filter((employee) => employee.isActive).length, [employees])

  function beginCreate() {
    setEditing(null)
    setDraft(emptyDraft)
    setFieldErrors({})
    setSaveError('')
    setSuccess('')
  }

  async function beginEdit(employee: Employee) {
    setSuccess('')
    setSaveError('')
    try {
      const details = await apiRequest<Employee>(`/admin/employees/${encodeURIComponent(employee.id)}`)
      setEditing(details)
      setDraft({ corporateEmail: details.corporateEmail, displayName: details.displayName, department: details.department ?? '', employeeNumber: details.employeeNumber ?? '' })
      setFieldErrors({})
    } catch (error) {
      setSaveError(`Couldn't retrieve this employee profile. ${getMessage(error)}`)
    }
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!emailPattern.test(draft.corporateEmail.trim())) errors.corporateEmail = 'Enter a valid Folio3 corporate email (name@folio3.com).'
    if (!draft.displayName.trim()) errors.displayName = 'Employee name is required.'
    return errors
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    setSaveError('')
    if (Object.keys(errors).length) return
    setSaving(true)
    const payload = {
      corporateEmail: draft.corporateEmail.trim().toLowerCase(),
      displayName: draft.displayName.trim(),
      department: draft.department.trim() || null,
      employeeNumber: draft.employeeNumber.trim() || null,
    }
    try {
      const updated = editing
        ? await apiRequest<Employee>(`/admin/employees/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await apiRequest<Employee>('/admin/employees', { method: 'POST', body: JSON.stringify(payload) })
      setSuccess(`Employee profile saved for ${updated.corporateEmail}. ${updated.displayName} · ${updated.department || 'Department not specified'} · ${vehicleSummary(updated)}`)
      setEditing(updated)
      setDraft({ corporateEmail: updated.corporateEmail, displayName: updated.displayName, department: updated.department ?? '', employeeNumber: updated.employeeNumber ?? '' })
      const term = query.trim()
      setSearch(term)
      await loadEmployees(term)
    } catch (error) {
      setFieldErrors(getFieldErrors(error))
      setSaveError(`Employee profile couldn't be saved. ${getMessage(error)}`)
    } finally {
      setSaving(false)
    }
  }

  async function deactivateEmployee(employee: Employee) {
    if (!window.confirm(`Deactivate the employee record for ${employee.corporateEmail}?`)) return
    setDeactivating(employee.id)
    setSuccess('')
    setLoadError('')
    try {
      await apiRequest<void>(`/admin/employees/${encodeURIComponent(employee.id)}`, { method: 'DELETE' })
      setSuccess(`Employee record deactivated for ${employee.corporateEmail}.`)
      await loadEmployees(search)
    } catch (error) {
      setLoadError(`Employee record couldn't be deactivated. ${getMessage(error)}`)
    } finally {
      setDeactivating('')
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = query.trim()
    setSearch(term)
    void loadEmployees(term)
  }

  function clearSearch() {
    setQuery('')
    setSearch('')
    void loadEmployees('')
  }

  if (accessDenied) return <main className={styles.access}><section role="alert"><h1>Administrator access required</h1><p>This employee directory is available to authorized parking administrators only.</p></section></main>

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <a href="/admin" className={styles.brand}><span className={styles.brandIcon} aria-hidden="true">P</span>Parking operations</a>
        <nav aria-label="Administrator navigation" className={styles.nav}><a href="/admin">Overview</a><a href="/admin/assignments">Assignments</a><a href="/admin/employees" aria-current="page">Employees</a><a href="/admin/configuration">Configuration</a><a href="/admin/reports">Reports</a></nav>
        <span className={styles.role}>Administrator</span>
      </header>
      <div className={styles.content}>
        <div className={styles.breadcrumbs}><a href="/admin">Administration</a><span aria-hidden="true">/</span><strong>Employees</strong></div>
        <div className={styles.heading}>
          <div><h1>Employee records</h1><p>Manage employee identities and profile details for parking access.</p></div>
          <button type="button" className={styles.primary} onClick={beginCreate}>＋ <span>Add employee</span></button>
        </div>
        {success && <div className={styles.success} role="status"><span aria-hidden="true">✓</span><div><strong>Employee profile saved.</strong> {success.replace('Employee profile saved for ', '')}</div><button type="button" aria-label="Dismiss success message" onClick={() => setSuccess('')}>×</button></div>}
        {loadError && <div className={styles.error} role="alert"><span>{loadError}</span><button type="button" className={styles.textButton} onClick={() => void loadEmployees(search)}>Retry</button></div>}

        <form className={styles.toolbar} onSubmit={submitSearch} aria-label="Employee search">
          <div className={styles.searchBox}><label htmlFor="employee-search">Search employees</label><input id="employee-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by corporate email" /><p>Use the employee's corporate email as the identity key.</p></div>
          <div className={styles.toolbarActions}><span className={styles.count}>{loading ? 'Loading records…' : `${employees.length} ${employees.length === 1 ? 'employee' : 'employees'} · ${activeCount} active`}</span><button className={styles.secondary} type="submit">Search</button>{search && <button className={styles.textButton} type="button" onClick={clearSearch}>Clear search</button>}</div>
        </form>

        <div className={styles.layout}>
          <section className={styles.panel} aria-labelledby="directory-title">
            <header className={styles.panelHeader}><div><h2 id="directory-title">Employee directory</h2><p>Corporate identity, employee details, vehicle profile summary and record status</p></div></header>
            {loading ? <div className={styles.skeletons} role="status" aria-label="Loading employee records" aria-busy="true">{[1, 2, 3, 4].map((item) => <div className={styles.skeleton} key={item}><span /><span /><span /></div>)}</div>
              : employees.length === 0 ? <div className={styles.empty} role="status"><span className={styles.emptyIcon} aria-hidden="true">⌕</span><h3>{search ? 'No employee records match this search.' : 'No employee records yet.'}</h3><p>{search ? 'Try another corporate email or clear your search.' : 'Create an employee record to add a corporate identity.'}</p><div>{search && <button type="button" className={styles.secondary} onClick={clearSearch}>Clear search</button>}<button type="button" className={styles.primary} onClick={beginCreate}>＋ Add employee</button></div></div>
                : <>
                  <div className={styles.tableWrap}><table><thead><tr><th scope="col">Employee</th><th scope="col">Department / employee number</th><th scope="col">Vehicle profile</th><th scope="col">Record status</th><th scope="col"><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}>
                    <td><strong className={styles.email}>{employee.corporateEmail}</strong><span className={styles.name}>{employee.displayName}</span></td>
                    <td>{employee.department || '—'}<span className={styles.secondaryLine}>{employee.employeeNumber ? `Employee no. ${employee.employeeNumber}` : 'No employee number'}</span></td>
                    <td>{vehicleSummary(employee)}</td>
                    <td><span className={`${styles.status} ${employee.isActive ? styles.active : styles.inactive}`}><span aria-hidden="true">{employee.isActive ? '✓' : '!'}</span>{employee.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td className={styles.actions}><button type="button" className={styles.textButton} onClick={() => void beginEdit(employee)}>Edit profile</button>{employee.isActive && <button type="button" className={styles.deactivate} disabled={deactivating === employee.id} onClick={() => void deactivateEmployee(employee)}>{deactivating === employee.id ? 'Deactivating…' : 'Deactivate'}</button>}</td>
                  </tr>)}</tbody></table></div>
                  <div className={styles.mobileCards}>{employees.map((employee) => <article className={styles.employeeCard} key={employee.id}><div className={styles.cardIdentity}><strong>{employee.corporateEmail}</strong><span>{employee.displayName}</span></div><span className={`${styles.status} ${employee.isActive ? styles.active : styles.inactive}`}>{employee.isActive ? 'Active' : 'Inactive'}</span><dl><div><dt>Department</dt><dd>{employee.department || 'Not specified'}</dd></div><div><dt>Employee number</dt><dd>{employee.employeeNumber || 'Not provided'}</dd></div><div><dt>Vehicle profile</dt><dd>{vehicleSummary(employee)}</dd></div></dl><div className={styles.cardActions}><button type="button" className={styles.textButton} onClick={() => void beginEdit(employee)}>Edit profile</button>{employee.isActive && <button type="button" className={styles.deactivate} onClick={() => void deactivateEmployee(employee)}>Deactivate</button>}</div></article>)}</div>
                  <footer className={styles.footer}>Showing {employees.length} employee {employees.length === 1 ? 'record' : 'records'}</footer>
                </>}
          </section>

          <aside className={styles.panel} aria-labelledby="profile-title">
            <header className={styles.panelHeader}><div><h2 id="profile-title">{editing ? 'Edit employee profile' : 'Employee profile'}</h2><p>{editing ? editing.corporateEmail : 'Add a record or select an employee to edit.'}</p></div>{editing && <button className={styles.textButton} type="button" onClick={beginCreate}>New</button>}</header>
            {saveError && <div className={styles.formError} role="alert">{saveError}<button type="button" className={styles.textButton} onClick={() => { if (editing) void beginEdit(editing); else (document.getElementById('employee-profile-form') as HTMLFormElement | null)?.requestSubmit() }}>Retry</button></div>}
            <form id="employee-profile-form" className={styles.profileForm} onSubmit={saveEmployee} noValidate>
              <p className={styles.formNote}>Corporate email is the employee's identity key. Only profile details needed for parking operations are requested.</p>
              <label htmlFor="corporate-email">Corporate email <span aria-hidden="true">*</span></label><input id="corporate-email" type="email" autoComplete="email" value={draft.corporateEmail} onChange={(event) => setDraft({ ...draft, corporateEmail: event.target.value })} aria-invalid={Boolean(fieldErrors.corporateEmail)} aria-describedby={fieldErrors.corporateEmail ? 'email-error' : 'email-hint'} />{fieldErrors.corporateEmail ? <small id="email-error" className={styles.fieldError}>{fieldErrors.corporateEmail}</small> : <small id="email-hint">Use the authorized Folio3 work email (name@folio3.com).</small>}
              <label htmlFor="display-name">Employee name <span aria-hidden="true">*</span></label><input id="display-name" value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? 'name-error' : undefined} />{fieldErrors.displayName && <small id="name-error" className={styles.fieldError}>{fieldErrors.displayName}</small>}
              <label htmlFor="department">Department <span className={styles.optional}>(optional)</span></label><input id="department" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })} />
              <label htmlFor="employee-number">Employee number <span className={styles.optional}>(optional)</span></label><input id="employee-number" value={draft.employeeNumber} onChange={(event) => setDraft({ ...draft, employeeNumber: event.target.value })} />
              {fieldErrors.department && <small className={styles.fieldError}>{fieldErrors.department}</small>}{fieldErrors.employeeNumber && <small className={styles.fieldError}>{fieldErrors.employeeNumber}</small>}
              <div className={styles.vehicleNote}><strong>Vehicle profile</strong><span>Vehicle details are maintained separately and are not returned by the administrator employee-record API.</span></div>
              <div className={styles.formActions}><button type="button" className={styles.secondary} onClick={beginCreate}>Clear form</button><button type="submit" className={styles.primary} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}</button></div>
            </form>
          </aside>
        </div>
      </div>
    </main>
  )
}
