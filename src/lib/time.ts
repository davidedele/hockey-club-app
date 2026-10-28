// The club lives in Italy. Event times are always entered and shown in Italian time,
// whatever time zone the phone is set to. Only the words around them follow the chosen language.
import { locale } from '../i18n'
const TZ = 'Europe/Rome'

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function parts(at: Date) {
  const p = partsFormat.formatToParts(at)
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') }
}

// Minutes that Italian time is ahead of UTC at the given moment (60 in winter, 120 in summer).
function offsetMinutes(at: Date): number {
  const p = parts(at)
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - at.getTime()) / 60000)
}

const pad = (n: number) => String(n).padStart(2, '0')

// "2026-10-22" and "22:30" in Italian time to a UTC timestamp string.
export function italyToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  // Two passes settle the answer around the clock changes.
  const first = guess - offsetMinutes(new Date(guess)) * 60000
  const second = guess - offsetMinutes(new Date(first)) * 60000
  return new Date(second).toISOString()
}

// A timestamp to the date and time as shown on an Italian clock.
export function isoToItaly(iso: string): { date: string; time: string } {
  const p = parts(new Date(iso))
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` }
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString()
}

// Adds whole days to a calendar date such as "2026-10-22".
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`
}

// The end time may fall after midnight. If the end clock time is not later than the start, it is the next day.
export function endIso(date: string, startTime: string, endTime: string): string {
  return italyToIso(endTime > startTime ? date : addDays(date, 1), endTime)
}

// The meetup is before the start. If its clock time is later than the start, it was the day before.
export function meetupIso(date: string, startTime: string, meetupTime: string): string {
  return italyToIso(meetupTime <= startTime ? date : addDays(date, -1), meetupTime)
}

const dayFormat = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
const shortDayFormat = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat(locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export const formatDay = (iso: string) => dayFormat.format(new Date(iso))
export const formatShortDay = (iso: string) => shortDayFormat.format(new Date(iso))
export const formatTime = (iso: string) => timeFormat.format(new Date(iso))
export const dayKey = (iso: string) => isoToItaly(iso).date

// Moves a clock time such as "22:30" by some minutes, wrapping around midnight.
export function shiftClock(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

const dayPartsFormat = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })

// The day of the month, the short weekday and the short month, for the date column of the events list.
export function dayParts(iso: string): { num: string; dow: string; mon: string } {
  const p = dayPartsFormat.formatToParts(new Date(iso))
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? ''
  return { num: get('day'), dow: get('weekday').replace('.', ''), mon: get('month').replace('.', '') }
}

export const isToday = (iso: string) => dayKey(iso) === dayKey(new Date().toISOString())

const narrowDayFormat = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'narrow' })

// The seven days, Monday to Sunday, of the week that holds the given moment, in Italian time.
export function weekOf(iso: string): { date: string; dow: string; num: string }[] {
  const today = dayKey(iso)
  const [y, m, d] = today.split('-').map(Number)
  const fromMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  const monday = addDays(today, -fromMonday)
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const [yy, mm, dd] = date.split('-').map(Number)
    return { date, dow: narrowDayFormat.format(new Date(Date.UTC(yy, mm - 1, dd, 12))), num: String(dd) }
  })
}

const monthFormat = new Intl.DateTimeFormat(locale, { timeZone: TZ, month: 'long', year: 'numeric' })

// "Ottobre 2026", for the heading of the events home.
export function formatMonth(iso: string): string {
  const text = monthFormat.format(new Date(iso))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Seasons start on 1 September. The season of a moment is named by the year it started in.
export function seasonOf(iso: string): number {
  const [y, m] = dayKey(iso).split('-').map(Number)
  return m >= 9 ? y : y - 1
}

// 2026 to "2026/27".
export const seasonLabel = (year: number) => `${year}/${pad((year + 1) % 100)}`

const dayMonth = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' })

// A calendar date such as "2026-12-02" as "2 dicembre".
export const formatDate = (date: string) => dayMonth.format(new Date(`${date}T12:00:00Z`))

// The two ends of a date range, for "dal 19 al 25 ottobre" or "dal 28 settembre al 4 ottobre".
export function rangeParts(from: string, to: string): { from: string; to: string } {
  const a = new Date(`${from}T12:00:00Z`)
  const b = new Date(`${to}T12:00:00Z`)
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear()
  return { from: sameMonth ? String(a.getUTCDate()) : dayMonth.format(a), to: dayMonth.format(b) }
}

// Whole days from one calendar date to another.
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000)
}

const dayMonthYear = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })

// "14 marzo 2027", for dates that may fall in another year.
export const formatDateYear = (date: string) => dayMonthYear.format(new Date(`${date}T12:00:00Z`))
