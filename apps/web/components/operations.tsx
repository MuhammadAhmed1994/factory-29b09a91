'use client'

import { useMemo, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import Link from 'next/link'
import type { SessionRole } from '../lib/session'
import styles from './operations.module.css'

export type ShellAuthState = 'authenticated' | 'session-expired' | 'unauthenticated'

export interface ApplicationShellProps {
  role?: SessionRole
  identity?: { displayName?: string; corporateEmail: string }
  authState: ShellAuthState
  children: ReactNode
}

const roleNames: Record<SessionRole, string> = {
  employee: 'Employee',
  security: 'Security',
  administrator: 'Administrator',
}

const navigation: { label: string; href: string; roles: SessionRole[] }[] = [
  { label: 'Home', href: '/parking', roles: ['employee'] },
  { label: 'Available parking', href: '/parking/available', roles: ['employee'] },
  { label: 'My releases', href: '/parking/my-releases', roles: ['employee'] },
  { label: 'My vehicles', href: '/parking/vehicles', roles: ['employee'] },
  { label: 'Verify vehicle', href: '/security/verify', roles: ['security'] },
  { label: 'Overview', href: '/admin', roles: ['administrator'] },
  { label: 'Assignments', href: '/admin/assignments', roles: ['administrator'] },
  { label: 'Employees', href: '/admin/employees', roles: ['administrator'] },
  { label: 'Configuration', href: '/admin/configuration', roles: ['administrator'] },
  { label: 'Reports', href: '/admin/reports', roles: ['administrator'] },
  { label: 'Utilization', href: '/admin/utilization', roles: ['administrator'] },
  { label: 'Entrance log', href: '/security/entry-log', roles: ['security'] },
]

/** Reusable workspace chrome; protected APIs and routes must still enforce authorization server-side. */
export function ApplicationShell({ role, identity, authState, children }: ApplicationShellProps) {
  const authenticated = authState === 'authenticated' && Boolean(role && identity)
  const visibleNavigation = authenticated && role
    ? navigation.filter((item) => item.roles.includes(role))
    : []

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href={authenticated && role === 'administrator' ? '/admin' : '/parking'}>
          <span aria-hidden="true" className={styles.brandMark}>P</span>
          <span>Parking operations</span>
        </Link>
        {authenticated && role && identity ? (
          <div className={styles.identity}>
            <span className={styles.identityName}>{identity.displayName || identity.corporateEmail}</span>
            {identity.displayName && <span className={styles.identityEmail}>{identity.corporateEmail}</span>}
            <span className={styles.roleLabel}>{roleNames[role]}</span>
          </div>
        ) : (
          <span className={styles.sessionLabel}>
            {authState === 'session-expired' ? 'Session expired' : 'Not signed in'}
          </span>
        )}
      </header>
      {authState === 'session-expired' && (
        <div className={styles.sessionNotice} role="status">
          Your session has expired. <Link href="/sign-in?reason=session-expired">Sign in again</Link> to continue.
        </div>
      )}
      {authState === 'unauthenticated' && (
        <div className={styles.sessionNotice} role="status">
          Sign in with your Folio3 account to access parking operations. <Link href="/sign-in">Sign in</Link>
        </div>
      )}
      <div className={styles.workspace}>
        {authenticated && visibleNavigation.length > 0 && (
          <nav className={styles.navigation} aria-label={`${roleNames[role as SessionRole]} navigation`}>
            {visibleNavigation.map((item) => (
              <Link className={styles.navLink} href={item.href} key={item.href}>{item.label}</Link>
            ))}
          </nav>
        )}
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  )
}

export type StatusVariant = 'scheduled' | 'available' | 'claimed' | 'cancelled' | 'authorized' | 'not-authorized' | 'success' | 'warning' | 'info' | 'error'

const statusLabels: Record<StatusVariant, string> = {
  scheduled: 'Scheduled',
  available: 'Available',
  claimed: 'Claimed',
  cancelled: 'Cancelled',
  authorized: 'Authorized',
  'not-authorized': 'Not authorized',
  success: 'Success',
  warning: 'Warning',
  info: 'Information',
  error: 'Error',
}

export function StatusBadge({ status, label }: { status: StatusVariant; label?: string }) {
  return <span className={`${styles.badge} ${styles[`badge_${status.replace('-', '_')}`]}`}>
    <span aria-hidden="true" className={styles.badgeMark}>{status === 'authorized' || status === 'available' || status === 'success' ? '✓' : status === 'not-authorized' || status === 'error' ? '!' : '•'}</span>
    {label ?? statusLabels[status]}
  </span>
}

export type ResultVariant = 'success' | 'unavailable' | 'authorized' | 'not-authorized' | 'info' | 'error'

export function ResultPanel({
  variant,
  title,
  children,
  loading = false,
  date,
}: {
  variant: ResultVariant
  title: string
  children?: ReactNode
  loading?: boolean
  date?: string
}) {
  if (loading) {
    return <section className={`${styles.result} ${styles.result_loading}`} aria-live="polite" aria-busy="true">
      <span className={styles.resultIcon} aria-hidden="true">…</span>
      <div><h2>Checking result</h2><p>Please wait while we retrieve the latest information.</p></div>
    </section>
  }
  const good = variant === 'success' || variant === 'authorized'
  const negative = variant === 'unavailable' || variant === 'not-authorized' || variant === 'error'
  const icon = good ? '✓' : negative ? '!' : 'i'
  return <section className={`${styles.result} ${styles[`result_${negative ? 'negative' : good ? 'positive' : 'info'}`]}`} aria-live="polite" role="status">
    <span className={styles.resultIcon} aria-hidden="true">{icon}</span>
    <div className={styles.resultBody}>
      <h2>{title}</h2>
      {date && <p className={styles.resultDate}>Date: <time>{date}</time></p>}
      {children && <div className={styles.resultDetail}>{children}</div>}
    </div>
  </section>
}

export interface OperationsColumn<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => ReactNode
  searchableValue?: (row: T) => string
}

export interface OperationsTableProps<T> {
  columns: OperationsColumn<T>[]
  rows: T[]
  getRowKey: (row: T) => string | number
  loading?: boolean
  error?: string
  emptyMessage?: string
  filterPlaceholder?: string
  filterLabel?: string
  actions?: (row: T) => ReactNode
}

/** Client-side text filter and semantic table with explicit loading, error, empty, and data states. */
export function OperationsTable<T extends object>({
  columns,
  rows,
  getRowKey,
  loading = false,
  error,
  emptyMessage = 'No records to show yet.',
  filterPlaceholder = 'Search records',
  filterLabel = 'Filter records',
  actions,
}: OperationsTableProps<T>) {
  const [query, setQuery] = useState('')
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return rows
    return rows.filter((row) => columns.some((column) => {
      const value = column.searchableValue
        ? column.searchableValue(row)
        : String((row as Record<string, unknown>)[String(column.key)] ?? '')
      return value.toLocaleLowerCase().includes(needle)
    }))
  }, [columns, query, rows])

  return <section className={styles.tableCard} aria-label="Operations records">
    <div className={styles.tableToolbar}>
      <label className={styles.filterLabel}>
        <span>{filterLabel}</span>
        <input className={styles.control} type="search" value={query} placeholder={filterPlaceholder} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {!loading && !error && <span className={styles.recordCount}>{filteredRows.length} {filteredRows.length === 1 ? 'record' : 'records'}</span>}
    </div>
    {loading ? (
      <div className={styles.tableState} role="status" aria-live="polite"><span className={styles.loadingDot} aria-hidden="true" />Loading records…</div>
    ) : error ? (
      <div className={`${styles.tableState} ${styles.tableError}`} role="alert"><strong>Unable to load records</strong><span>{error}</span></div>
    ) : filteredRows.length === 0 ? (
      <div className={styles.tableState} role="status">{query ? 'No records match your filter.' : emptyMessage}</div>
    ) : (
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead><tr>{columns.map((column) => <th scope="col" key={String(column.key)}>{column.header}</th>)}{actions && <th scope="col"><span className={styles.visuallyHidden}>Actions</span></th>}</tr></thead>
          <tbody>{filteredRows.map((row) => <tr key={getRowKey(row)}>
            {columns.map((column) => <td key={String(column.key)}>{column.render ? column.render(row) : String((row as Record<string, unknown>)[String(column.key)] ?? '—')}</td>)}
            {actions && <td className={styles.rowActions} aria-label="Row actions">{actions(row)}</td>}
          </tr>)}</tbody>
        </table>
      </div>
    )}
  </section>
}

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id: string
  label: string
  error?: string
  hint?: string
}

export function FormField({ id, label, error, hint, className, ...inputProps }: FieldProps) {
  const helpId = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return <div className={styles.field}>
    <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
    <input {...inputProps} className={`${styles.control} ${error ? styles.controlInvalid : ''} ${className ?? ''}`} id={id} aria-invalid={Boolean(error)} aria-describedby={helpId} />
    {error && <span className={styles.fieldError} id={`${id}-error`}>{error}</span>}
    {!error && hint && <span className={styles.fieldHint} id={`${id}-hint`}>{hint}</span>}
  </div>
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  id: string
  label: string
  error?: string
  hint?: string
  children: ReactNode
}

export function SelectField({ id, label, error, hint, className, children, ...selectProps }: SelectFieldProps) {
  const helpId = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return <div className={styles.field}>
    <label className={styles.fieldLabel} htmlFor={id}>{label}</label>
    <select {...selectProps} className={`${styles.control} ${styles.selectControl} ${error ? styles.controlInvalid : ''} ${className ?? ''}`} id={id} aria-invalid={Boolean(error)} aria-describedby={helpId}>{children}</select>
    {error && <span className={styles.fieldError} id={`${id}-error`}>{error}</span>}
    {!error && hint && <span className={styles.fieldHint} id={`${id}-hint`}>{hint}</span>}
  </div>
}

export function AccessDenied({ title = 'Access denied', message = 'You do not have permission to view this page.' }: { title?: string; message?: string }) {
  return <section className={styles.accessDenied} role="alert" aria-labelledby="access-denied-heading">
    <span className={styles.deniedIcon} aria-hidden="true">!</span>
    <div><h1 id="access-denied-heading">{title}</h1><p>{message}</p><p className={styles.deniedHint}>If you believe this is a mistake, contact your parking administrator.</p></div>
  </section>
}
