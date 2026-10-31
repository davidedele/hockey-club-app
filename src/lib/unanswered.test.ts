import { describe, expect, it } from 'vitest'
import { unanswered, weekEnd } from './unanswered'

const at = (iso: string) => new Date(iso)

describe('weekEnd', () => {
  it('is the next Monday 00:00 in Italian time', () => {
    // Wednesday 28 October 2026, winter time (UTC+1): Monday 2 November 00:00 is Sunday 23:00 UTC.
    expect(weekEnd(at('2026-10-28T10:00:00Z')).toISOString()).toBe('2026-11-01T23:00:00.000Z')
  })
  it('changes at Sunday midnight, not before', () => {
    // Sunday 1 November 2026 23:30 in Italy (22:30 UTC): the week ends in 30 minutes.
    expect(weekEnd(at('2026-11-01T22:30:00Z')).toISOString()).toBe('2026-11-01T23:00:00.000Z')
    // Monday 2 November 00:00 in Italy (23:00 UTC): a whole new week.
    expect(weekEnd(at('2026-11-01T23:00:00Z')).toISOString()).toBe('2026-11-08T23:00:00.000Z')
    // One minute before.
    expect(weekEnd(at('2026-11-01T22:59:00Z')).toISOString()).toBe('2026-11-01T23:00:00.000Z')
  })
  it('follows Italian time on Sunday evening, whatever the phone says', () => {
    // 23:30 on Sunday in Italy is already Monday in Tokyo, but the window uses the club clock.
    expect(weekEnd(at('2026-11-01T22:30:00Z')).getTime()).toBeLessThan(weekEnd(at('2026-11-01T23:30:00Z')).getTime())
  })
  it('handles the clock change of late October (25 October 2026, 03:00 to 02:00)', () => {
    // Sunday 25 October 12:00: the week ends Monday 26 October 00:00, which is already winter time (23:00 UTC).
    expect(weekEnd(at('2026-10-25T11:00:00Z')).toISOString()).toBe('2026-10-25T23:00:00.000Z')
    // Wednesday 21 October, summer time: the same Monday midnight, one week of 7 days and an extra hour.
    expect(weekEnd(at('2026-10-21T09:00:00Z')).toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })
  it('handles the clock change of late March (29 March 2026, 02:00 to 03:00)', () => {
    // Monday 30 March 00:00 is summer time (UTC+2), so 22:00 UTC on Sunday.
    expect(weekEnd(at('2026-03-25T09:00:00Z')).toISOString()).toBe('2026-03-29T22:00:00.000Z')
    expect(weekEnd(at('2026-03-29T00:30:00Z')).toISOString()).toBe('2026-03-29T22:00:00.000Z')
  })
})

describe('unanswered', () => {
  const group = [{ group_id: 1 }]
  const base = { cancelled_at: null, event_groups: group }
  const events = [
    { ...base, id: 'start', starts_at: '2026-10-26T17:00:00Z', ends_at: '2026-10-26T18:00:00Z' }, // Monday
    { ...base, id: 'end', starts_at: '2026-11-01T17:00:00Z', ends_at: '2026-11-01T18:00:00Z' }, // Sunday evening
    { ...base, id: 'next', starts_at: '2026-11-02T17:00:00Z', ends_at: '2026-11-02T18:00:00Z' }, // next Monday
    { ...base, id: 'other', event_groups: [{ group_id: 2 }], starts_at: '2026-10-28T17:00:00Z', ends_at: '2026-10-28T18:00:00Z' },
    { ...base, id: 'cancelled', cancelled_at: '2026-10-20T00:00:00Z', starts_at: '2026-10-29T17:00:00Z', ends_at: '2026-10-29T18:00:00Z' },
    { ...base, id: 'answered', starts_at: '2026-10-30T17:00:00Z', ends_at: '2026-10-30T18:00:00Z' },
    { ...base, id: 'off', starts_at: '2026-10-30T18:00:00Z', ends_at: '2026-10-30T19:00:00Z' },
  ]
  const facts = { events, answers: new Map([['answered', 'present' as const]]), notCalledUp: new Set(['off']), myGroups: [1] }
  it('counts the events of the week and puts the later ones apart', () => {
    const r = unanswered(facts, at('2026-10-26T08:00:00Z'))
    expect(r.inWindow.map((e) => e.id)).toEqual(['start', 'end'])
    expect(r.later.map((e) => e.id)).toEqual(['next'])
  })
  it('leaves out events that are over', () => {
    const r = unanswered(facts, at('2026-10-26T19:00:00Z'))
    expect(r.inWindow.map((e) => e.id)).toEqual(['end'])
  })
  it('is empty on Sunday evening after the last event and full again on Monday', () => {
    expect(unanswered(facts, at('2026-11-01T18:30:00Z')).inWindow).toEqual([])
    expect(unanswered(facts, at('2026-11-01T23:00:00Z')).inWindow.map((e) => e.id)).toEqual(['next'])
  })
})
