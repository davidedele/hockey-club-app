import type { Answer, EventRow } from './types'
import { addDays, dayKey, italyToIso } from './time'

// The window of "events without an answer" is the calendar week in Italian time: from now until the
// next Monday 00:00 (decision 92). On Monday it holds the whole new week; on Sunday evening it can be
// empty. The banner, the bell, the Home tile and the Eventi heading all use this one function.
export function weekEnd(now: Date = new Date()): Date {
  const today = dayKey(now.toISOString())
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() // 0 is Sunday
  const daysToMonday = 8 - (weekday === 0 ? 7 : weekday) // Monday 7, Sunday 1
  return new Date(italyToIso(addDays(today, daysToMonday), '00:00'))
}

type Needed = Pick<EventRow, 'id' | 'starts_at' | 'ends_at' | 'cancelled_at' | 'event_groups'>
type Facts<E extends Needed> = {
  events: E[]
  answers: ReadonlyMap<string, Answer> | ReadonlySet<string>
  // Events the staff did not call the person up for: nobody waits for an answer.
  notCalledUp: ReadonlySet<string>
  myGroups: readonly number[]
}

const has = (set: ReadonlyMap<string, Answer> | ReadonlySet<string>, id: string) => set.has(id)

// Events the person has to answer: not cancelled, not over, in one of their groups, no answer yet
// and not called up. `inWindow` keeps the ones that start before the end of the week; the rest are the
// later ones.
export function unanswered<E extends Needed>(f: Facts<E>, now: Date = new Date()): { inWindow: E[]; later: E[]; end: Date } {
  const open = f.events.filter(
    (e) => e.cancelled_at === null && new Date(e.ends_at) > now && e.event_groups.some((g) => f.myGroups.includes(g.group_id)) && !has(f.answers, e.id) && !f.notCalledUp.has(e.id),
  )
  const end = weekEnd(now)
  return {
    inWindow: open.filter((e) => new Date(e.starts_at) < end),
    later: open.filter((e) => new Date(e.starts_at) >= end),
    end,
  }
}
