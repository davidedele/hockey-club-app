import type { EventRow } from './types'

export interface EventOverlap {
  first: EventRow
  second: EventRow
  groups: number[]
}

// Only live events sharing an assigned group. Adjacent sessions and different teams are valid.
export function eventOverlaps(events: readonly EventRow[], now = Date.now()): EventOverlap[] {
  const live = events.filter((e) => !e.cancelled_at && Date.parse(e.ends_at) > now)
    .slice().sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  const overlaps: EventOverlap[] = []
  for (let i = 0; i < live.length; i++) {
    const first = live[i]
    for (let j = i + 1; j < live.length; j++) {
      const second = live[j]
      if (Date.parse(second.starts_at) >= Date.parse(first.ends_at)) break
      if (first.id === second.id) continue
      const groups = first.event_groups.map((g) => g.group_id).filter((id) => second.event_groups.some((g) => g.group_id === id))
      if (groups.length) overlaps.push({ first, second, groups: [...new Set(groups)] })
    }
  }
  return overlaps
}
