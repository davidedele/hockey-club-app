import { describe, expect, it } from 'vitest'
import { canAnswerEvent, detailAllowed, EVENT_DETAILS, invitedTo } from './eventaccess'
import type { EventRow } from './types'
const now = Date.parse('2026-11-08T15:00:00Z')
const event = { event_groups: [{ group_id: 1 }], cancelled_at: null, ends_at: '2026-11-09T20:00:00Z' } as EventRow

describe('calendar consultation and participation', () => {
  it('uses actual group membership rather than visibility or the answer', () => {
    expect(invitedTo(event, [1, 2])).toBe(true)
    expect(invitedTo(event, [2])).toBe(false)
    expect(canAnswerEvent(event, [1], false, now)).toBe(true)
    expect(canAnswerEvent(event, [2], false, now)).toBe(false)
    expect(canAnswerEvent({ ...event, observer_details: EVENT_DETAILS }, [2], false, now)).toBe(false)
  })
  it('does not promote cancelled, finished, unassigned or not called up events', () => {
    expect(canAnswerEvent({ ...event, cancelled_at: '2026-11-08' }, [1], false, now)).toBe(false)
    expect(canAnswerEvent({ ...event, ends_at: new Date(now).toISOString() }, [1], false, now)).toBe(false)
    expect(canAnswerEvent({ ...event, event_groups: [], groups_pending: true }, [1], false, now)).toBe(false)
    expect(canAnswerEvent(event, [1], true, now)).toBe(false)
  })
  it('keeps existing participant details and observer defaults separate', () => {
    for (const section of EVENT_DETAILS) {
      expect(detailAllowed(event, section, false, true)).toBe(true)
      expect(detailAllowed(event, section, false, false)).toBe(false)
      expect(detailAllowed({ ...event, participant_details: [] }, section, false, true)).toBe(false)
      expect(detailAllowed({ ...event, observer_details: [section] }, section, false, false)).toBe(true)
      expect(detailAllowed({ ...event, participant_details: [], observer_details: [] }, section, true, false)).toBe(true)
    }
  })
})
