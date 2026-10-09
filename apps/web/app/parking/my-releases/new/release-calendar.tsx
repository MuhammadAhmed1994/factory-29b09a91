'use client'

import { useMemo, useState } from 'react'
import styles from './calendar.module.css'

export interface ReleaseCalendarProps {
  /** Office-local first and last selectable dates (today .. today + 30). */
  min: string
  max: string
  selected: string[]
  /** Dates already released, shown as unavailable. */
  unavailable?: Record<string, string>
  disabled?: boolean
  onToggle: (date: string) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function monthLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00.000Z`))
}

/** Calendar days grouped by month, aligned to a Monday-first grid. */
function buildMonths(min: string, max: string) {
  const months: { key: string; label: string; leading: number; days: string[] }[] = []
  for (let day = min; day <= max; day = addDays(day, 1)) {
    const key = day.slice(0, 7)
    let month = months.find((entry) => entry.key === key)
    if (!month) {
      const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay()
      month = { key, label: monthLabel(day), leading: (weekday + 6) % 7, days: [] }
      months.push(month)
    }
    month.days.push(day)
  }
  return months
}

/**
 * Month grid for scheduling releases. The Spec asks for a calendar where a holder picks one date
 * or several, so selection is multi-select and the 30-day window bounds what is rendered.
 */
export function ReleaseCalendar({ min, max, selected, unavailable = {}, disabled, onToggle }: ReleaseCalendarProps) {
  const months = useMemo(() => buildMonths(min, max), [min, max])
  const chosen = useMemo(() => new Set(selected), [selected])

  return (
    <div className={styles.calendar}>
      {months.map((month) => (
        <section key={month.key} className={styles.month} aria-label={month.label}>
          <h3 className={styles.monthLabel}>{month.label}</h3>
          <div className={styles.weekdays} aria-hidden="true">
            {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className={styles.grid} role="group" aria-label={`Dates in ${month.label}`}>
            {Array.from({ length: month.leading }, (_, index) => (
              <span key={`pad-${index}`} className={styles.pad} aria-hidden="true" />
            ))}
            {month.days.map((day) => {
              const blockedReason = unavailable[day]
              const isSelected = chosen.has(day)
              return (
                <button
                  key={day}
                  type="button"
                  className={`${styles.day} ${isSelected ? styles.selected : ''} ${blockedReason ? styles.blocked : ''}`}
                  aria-pressed={isSelected}
                  aria-label={`${day}${blockedReason ? ` (${blockedReason})` : ''}`}
                  disabled={disabled || Boolean(blockedReason)}
                  title={blockedReason}
                  onClick={() => onToggle(day)}
                >
                  {Number(day.slice(8, 10))}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
