import { dayKey, isoToItaly, italyToIso } from './time'
import type { Rink, EventType } from './types'

// What the ice count needs of an event.
export interface IceEvent {
  id: string
  title: string
  type: EventType
  booking_starts_at?: string | null
  booking_ends_at?: string | null
  booking_needs_review?: boolean
  starts_at: string
  ends_at: string
  home_away?: 'home' | 'away' | null
  rink_id: number | null
  cancelled_at: string | null
}

// Hours per rink for one month. The key is the rink id, or NO_RINK for events with no rink set.
export const NO_RINK = 'none'
export interface IceMonth {
  month: string
  used: Record<string, number>
  cancelled: Record<string, number>
}

const round = (n: number) => Math.round(n * 100) / 100

// Explicit reservations take precedence; older ice events retain their existing duration.
export const hoursOf = (e: Pick<IceEvent, 'starts_at' | 'ends_at' | 'booking_starts_at' | 'booking_ends_at'>) => round((Date.parse(e.booking_ends_at ?? e.ends_at) - Date.parse(e.booking_starts_at ?? e.starts_at)) / 3600000)

export const countsAsIce = (e: IceEvent) => !!e.booking_starts_at || e.type === 'training' || (e.type === 'game' && e.home_away !== 'away')

const key = (e: IceEvent) => String(e.rink_id ?? NO_RINK)

// Split a reservation at Italian month boundaries. Sum elapsed time before rounding.
export function iceMonths(events: IceEvent[]): IceMonth[] {
  const months = new Map<string, IceMonth>()
  for (const e of events.filter(countsAsIce)) {
    let start = Date.parse(e.booking_starts_at ?? e.starts_at)
    const end = Date.parse(e.booking_ends_at ?? e.ends_at)
    while (start < end) {
      const month = dayKey(new Date(start).toISOString()).slice(0, 7)
      const [year, number] = month.split('-').map(Number)
      const next = `${number === 12 ? year + 1 : year}-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}-01`
      const stop = Math.min(end, Date.parse(italyToIso(next, '00:00')))
      const row = months.get(month) ?? { month, used: {}, cancelled: {} }
      const into = e.cancelled_at ? row.cancelled : row.used
      into[key(e)] = (into[key(e)] ?? 0) + (stop - start) / 3600000
      months.set(month, row)
      start = stop
    }
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export function totals(months: IceMonth[], which: 'used' | 'cancelled'): Record<string, number> {
  const sum: Record<string, number> = {}
  for (const m of months) for (const [k, v] of Object.entries(m[which])) sum[k] = (sum[k] ?? 0) + v
  return sum
}

export const sumOf = (hours: Record<string, number>) => round(Object.values(hours).reduce((a, b) => a + b, 0))

// Cost of hours that took place, for the rinks that have a price (cents per hour). Null when none has one.
export function cost(hours: Record<string, number>, prices: Map<number, number>): number | null {
  let cents = 0
  let any = false
  for (const [k, h] of Object.entries(hours)) {
    const price = prices.get(Number(k))
    if (k !== NO_RINK && price !== undefined) {
      cents += h * price
      any = true
    }
  }
  return any ? Math.round(cents) / 100 : null
}

const decimal = (n: number) => String(n).replace('.', ',')
// A value that starts like a formula is kept as text, and quotes, semicolons and line breaks are escaped.
const field = (v: string) => {
  const safe = /^[=+@\t\r-]/.test(v) && Number.isNaN(Number(v)) ? `'${v}` : v
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

// A spreadsheet file for Italian Excel: semicolons between columns, decimal commas, and a mark that says UTF-8.
export function iceCsv(events: IceEvent[], rinks: Rink[], prices: Map<number, number>, labels: { header: string[]; cancelled: string; took: string; noRink: string; training: string; game: string; other?: (type: EventType) => string; range?: {start:string;end:string}; endDate?: string; review?: string; confirmed?: string }): string {
  const name = new Map(rinks.map((r) => [r.id, r.name]))
  const headers=[...labels.header,...(labels.endDate?[labels.endDate]:[]),...(labels.review?[labels.review]:[])]
  const lines = [headers.map(field).join(';')]
  for (const original of events.filter(countsAsIce).sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const e={...original}
    if(labels.range){
      const from=Math.max(Date.parse(e.booking_starts_at??e.starts_at),Date.parse(labels.range.start))
      const to=Math.min(Date.parse(e.booking_ends_at??e.ends_at),Date.parse(labels.range.end))
      if(from>=to)continue
      e.booking_starts_at=new Date(from).toISOString();e.booking_ends_at=new Date(to).toISOString()
    }
    const start = isoToItaly(e.booking_starts_at ?? e.starts_at)
    const hours = Math.round((Date.parse(e.booking_ends_at ?? e.ends_at)-Date.parse(e.booking_starts_at ?? e.starts_at))/3600000*1000000)/1000000
    const price = e.rink_id !== null && !e.cancelled_at ? prices.get(e.rink_id) : undefined
    lines.push([
      start.date.split('-').reverse().join('/'),
      start.time,
      isoToItaly(e.booking_ends_at ?? e.ends_at).time,
      e.title,
      e.type === 'game' ? labels.game : e.type==='training'?labels.training:labels.other?.(e.type)??e.type,
      e.rink_id === null ? labels.noRink : name.get(e.rink_id) ?? '',
      decimal(hours),
      e.cancelled_at ? labels.cancelled : labels.took,
      price === undefined ? '' : decimal(Math.round(hours * price) / 100),
      ...(labels.endDate?[isoToItaly(e.booking_ends_at??e.ends_at).date.split('-').reverse().join('/')]:[]),
      ...(labels.review?[e.booking_needs_review?labels.review:labels.confirmed??'']:[]),
    ].map(field).join(';'))
  }
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// "150", "150,5" or "150.50" in euros to cents. Empty means no price (null); anything else that is not an amount is NaN.
export function euroToCents(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (clean === '') return null
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(clean)) return NaN
  return Math.round(Number(clean) * 100)
}

export const centsToEuro = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace('.', ','))
