'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError, apiRequest } from '../../../lib/api-client'
import styles from './page.module.css'

type ReportType = 'employees' | 'assignments' | 'releases' | 'allocations'
type ReportRow = Record<string, unknown>
type ReportPayload = {
  reportType: ReportType
  startDate: string
  endDate: string
  data: unknown[]
}
type ViewState = 'checking-access' | 'loading' | 'ready' | 'empty' | 'error' | 'access-denied'

const reportTypes: { value: ReportType; label: string }[] = [
  { value: 'employees', label: 'Employees' },
  { value: 'assignments', label: 'Parking assignments' },
  { value: 'releases', label: 'Parking releases' },
  { value: 'allocations', label: 'Parking allocations' },
]

function dateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultDates(): { startDate: string; endDate: string } {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 30)
  return { startDate: dateString(start), endDate: dateString(end) }
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function validateRange(startDate: string, endDate: string): string | null {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) return 'Enter valid start and end dates.'
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (end < start) return 'The end date must be on or after the start date.'
  const days = (end - start) / 86_400_000 + 1
  if (days > 366) return 'Choose a date range of 366 days or less.'
  return null
}

function flattenRow(value: unknown): ReportRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { value }
  const flattened: ReportRow = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === null || item === undefined) continue
    if (item instanceof Date) {
      flattened[key] = item.toISOString()
    } else if (Array.isArray(item)) {
      flattened[key] = item.length ? `${item.length} records` : '—'
    } else if (typeof item === 'object') {
      const nested = item as Record<string, unknown>
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        if (nestedValue === null || nestedValue === undefined || typeof nestedValue === 'object') continue
        flattened[`${key}.${nestedKey}`] = String(nestedValue)
      }
    } else {
      flattened[key] = item
    }
  }
  return flattened
}

function labelFor(key: string): string {
  return key
    .replaceAll('.', ' · ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase())
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function displayDate(value: string): string {
  if (!isCalendarDate(value)) return value
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
}

function ReportsPage() {
  const initialDates = useMemo(defaultDates, [])
  const [reportType, setReportType] = useState<ReportType>('allocations')
  const [startDate, setStartDate] = useState(initialDates.startDate)
  const [endDate, setEndDate] = useState(initialDates.endDate)
  const [viewState, setViewState] = useState<ViewState>('checking-access')
  const [data, setData] = useState<ReportRow[]>([])
  const [error, setError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [hasRun, setHasRun] = useState(false)

  const requestReport = useCallback(async (type: ReportType, start: string, end: string) => {
    setViewState('loading')
    setError('')
    try {
      const response = await apiRequest<ReportPayload>(
        `/admin/reports?${new URLSearchParams({ reportType: type, startDate: start, endDate: end }).toString()}`,
      )
      const rows = Array.isArray(response.data) ? response.data.map(flattenRow) : []
      setData(rows)
      setHasRun(true)
      setViewState(rows.length ? 'ready' : 'empty')
    } catch (requestError) {
      if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) {
        setViewState('access-denied')
        return
      }
      setError('The report couldn\'t be retrieved. Try again.')
      setViewState('error')
    }
  }, [])

  useEffect(() => {
    let active = true
    async function checkAdministrator() {
      try {
        const session = await apiRequest<{ roles?: unknown[]; employee?: { roles?: unknown[] } }>('/employees/me')
        const roles = Array.isArray(session.roles) ? session.roles : session.employee?.roles
        if (!Array.isArray(roles) || !roles.some((role) => typeof role === 'string' && ['admin', 'administrator', 'parking_administrator'].includes(role.toLowerCase()))) {
          if (active) setViewState('access-denied')
          return
        }
        if (active) await requestReport('allocations', initialDates.startDate, initialDates.endDate)
      } catch (requestError) {
        if (!active) return
        if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) {
          setViewState('access-denied')
        } else {
          setError('Your administrator access couldn\'t be verified. Try again.')
          setViewState('error')
        }
      }
    }
    void checkAdministrator()
    return () => { active = false }
  }, [initialDates.endDate, initialDates.startDate, requestReport])

  const columns = useMemo(() => {
    const keys = [...new Set(data.flatMap((row) => Object.keys(row)))].filter((key) => key !== 'id')
    return keys.length ? keys : data.length ? ['value'] : []
  }, [data])

  function runReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = validateRange(startDate, endDate)
    setValidationError(problem ?? '')
    if (problem) return
    void requestReport(reportType, startDate, endDate)
  }

  function retry() {
    if (hasRun) {
      void requestReport(reportType, startDate, endDate)
      return
    }
    setViewState('checking-access')
    setError('')
    apiRequest<{ roles?: unknown[]; employee?: { roles?: unknown[] } }>('/employees/me')
      .then((session) => {
        const roles = Array.isArray(session.roles) ? session.roles : session.employee?.roles
        if (!Array.isArray(roles) || !roles.some((role) => typeof role === 'string' && ['admin', 'administrator', 'parking_administrator'].includes(role.toLowerCase()))) {
          setViewState('access-denied')
          return
        }
        void requestReport(reportType, startDate, endDate)
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof ApiError && (requestError.status === 401 || requestError.status === 403)) {
          setViewState('access-denied')
        } else {
          setError('Your administrator access couldn\'t be verified. Try again.')
          setViewState('error')
        }
      })
  }

  if (viewState === 'access-denied') {
    return <main className={styles.page}>
      <section className={styles.denied} role="alert" aria-labelledby="denied-title">
        <span className={styles.deniedMark} aria-hidden="true">!</span>
        <div><p className={styles.eyebrow}>Administrator access</p><h1 id="denied-title">Access denied</h1><p>You do not have permission to view parking reports. This area is limited to authorized parking administrators.</p></div>
      </section>
    </main>
  }

  return <main className={styles.page}>
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><span>Administration</span><span aria-hidden="true">/</span><span aria-current="page">Reports</span></nav>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Administration / Parking</p><h1>Parking reports</h1><p className={styles.intro}>Review parking activity for a selected report and date range.</p></div>
    </header>

    <form className={styles.filterCard} onSubmit={runReport} noValidate>
      <div className={styles.filterIntro}><h2>Report filters</h2><p>Choose a report and date range to retrieve parking operations data.</p></div>
      <div className={styles.filters}>
        <label className={styles.field} htmlFor="report-type">
          <span>Report type</span>
          <select id="report-type" value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)} disabled={viewState === 'loading'}>
            {reportTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className={styles.field} htmlFor="start-date"><span>Start date</span><input id="start-date" type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} disabled={viewState === 'loading'} /></label>
        <label className={styles.field} htmlFor="end-date"><span>End date</span><input id="end-date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} disabled={viewState === 'loading'} /></label>
        <button className={styles.primaryButton} type="submit" disabled={viewState === 'loading'}>{viewState === 'loading' ? 'Preparing…' : 'Run report'}</button>
      </div>
      {validationError && <p className={styles.validation} role="alert">{validationError}</p>}
    </form>

    <section className={styles.resultsCard} aria-labelledby="results-title">
      <header className={styles.resultsHeader}>
        <div><p className={styles.eyebrow}>Report output</p><h2 id="results-title">{reportTypes.find((item) => item.value === reportType)?.label}</h2></div>
        <p className={styles.period}>{displayDate(startDate)} – {displayDate(endDate)}</p>
      </header>
      <div className={styles.liveStatus} role="status" aria-live="polite" aria-atomic="true">
        {viewState === 'checking-access' ? 'Verifying administrator access…' : viewState === 'loading' ? 'Preparing report…' : viewState === 'ready' ? 'Report ready.' : viewState === 'empty' ? 'Report complete. No report data is available for this selection.' : viewState === 'error' ? error : ''}
      </div>
      {viewState === 'error' && <div className={styles.errorPanel} role="alert"><p>{error || 'The report couldn\'t be retrieved. Try again.'}</p><button className={styles.secondaryButton} type="button" onClick={retry}>Retry</button></div>}
      {viewState === 'empty' && <p className={styles.emptyMessage}>No report data is available for this selection.</p>}
      {viewState === 'ready' && <div className={styles.tableScroll} tabIndex={0} aria-label="Report table. Scroll horizontally to view all columns.">
        <table className={styles.reportTable}>
          <caption>{reportTypes.find((item) => item.value === reportType)?.label} report · {displayDate(startDate)} – {displayDate(endDate)}</caption>
          <thead><tr>{columns.map((key) => <th scope="col" key={key}>{labelFor(key)}</th>)}</tr></thead>
          <tbody>{data.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((key) => <td key={key}>{displayValue(row[key])}</td>)}</tr>)}</tbody>
        </table>
      </div>}
    </section>
  </main>
}

export default ReportsPage
