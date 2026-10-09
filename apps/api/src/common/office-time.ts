import { UnprocessableEntityException } from '@nestjs/common';

/**
 * Office-local calendar arithmetic. The api stores calendar dates as UTC-midnight `@db.Date`
 * values and instants as timestamptz, so every conversion between "the office's day" and an
 * instant goes through here rather than being re-derived per feature.
 */

/** Parses YYYY-MM-DD into the UTC-midnight Date used for `@db.Date` columns. */
export function parseCalendarDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new UnprocessableEntityException('Date must be a valid calendar date (YYYY-MM-DD)');
  }
  return date;
}

export function toCalendarString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The office-local calendar day an instant falls on. */
export function officeDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addCalendarDays(date: string, days: number): string {
  const value = parseCalendarDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return toCalendarString(value);
}

/** Converts an office-local wall-clock time to UTC while respecting the zone's DST rules. */
export function officeInstant(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
    const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    const delta = target - represented;
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}

/** Monday-to-Sunday week containing `date`, as office-local calendar strings. */
export function weekBounds(date: string): { weekStart: string; weekEnd: string } {
  const value = parseCalendarDate(date);
  const weekday = value.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (weekday + 6) % 7;
  const start = new Date(value);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { weekStart: toCalendarString(start), weekEnd: toCalendarString(end) };
}

export function eachCalendarDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addCalendarDays(day, 1)) days.push(day);
  return days;
}
