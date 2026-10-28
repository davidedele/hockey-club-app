import { dayKey, isoToItaly } from './time'
import type { Rink } from './types'

// What the ice count needs of an event.
export interface IceEvent {
  id: string
  title: string
  type: 'training' | 'game'
  starts_at: string
  ends_at: string
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

// The booked ice is the event's own start and end.
export const hoursOf = (e: Pick<IceEvent, 'starts_at' | 'ends_at'>) => round((Date.parse(e.ends_at) - Date.parse(e.starts_at)) / 3600000)

const key = (e: IceEvent) => String(e.rink_id ?? NO_RINK)

// Months run on the Italian calendar. Cancelled events are counted apart from the ones that took place.
export function iceMonths(events: IceEvent[]): IceMonth[] {
  const months = new Map<string, IceMonth>()
  for (const e of events) {
    const month = dayKey(e.starts_at).slice(0, 7)
    const m = months.get(month) ?? { month, used: {}, cancelled: {} }
    const into = e.cancelled_at ? m.cancelled : m.used
    into[key(e)] = round((into[key(e)] ?? 0) + hoursOf(e))
    months.set(month, m)
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month))
}

export function totals(months: IceMonth[], which: 'used' | 'cancelled'): Record<string, number> {
  const sum: Record<string, number> = {}
  for (const m of months) for (const [k, v] of Object.entries(m[which])) sum[k] = round((sum[k] ?? 0) + v)
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
const field = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

// A spreadsheet file for Italian Excel: semicolons between columns, decimal commas, and a mark that says UTF-8.
export function iceCsv(events: IceEvent[], rinks: Rink[], prices: Map<number, number>, labels: { header: string[]; cancelled: string; took: string; noRink: string; training: string; game: string }): string {
  const name = new Map(rinks.map((r) => [r.id, r.name]))
  const lines = [labels.header.map(field).join(';')]
  for (const e of [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const start = isoToItaly(e.starts_at)
    const hours = hoursOf(e)
    const price = e.rink_id !== null && !e.cancelled_at ? prices.get(e.rink_id) : undefined
    lines.push([
      start.date.split('-').reverse().join('/'),
      start.time,
      isoToItaly(e.ends_at).time,
      e.title,
      e.type === 'game' ? labels.game : labels.training,
      e.rink_id === null ? labels.noRink : name.get(e.rink_id) ?? '',
      decimal(hours),
      e.cancelled_at ? labels.cancelled : labels.took,
      price === undefined ? '' : decimal(Math.round(hours * price) / 100),
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
