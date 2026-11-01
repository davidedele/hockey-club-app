import { describe, expect, it } from 'vitest'
import { buildCopy, needsRenewal, usable, type OfflineCopy } from './offline'

const now = new Date('2026-11-01T12:00:00Z')
const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString()
const ev = (id: string, startsAt: string, extra: Record<string, unknown> = {}) => ({ id, type: 'training', title: id, starts_at: startsAt, ends_at: startsAt, meetup_at: null, venue: 'Pista', opponent: null, home_away: null, cancelled_at: null, ...extra })

describe('buildCopy', () => {
  const raw = {
    events: [ev('b', day(2)), ev('a', day(1), { email: 'x@y.z', phone: '333' }), ev('far', day(40)), ev('old', day(-2)), ev('gone', day(5), { cancelled_at: day(0) })],
    groups: [{ event_id: 'a', group_id: 1 }, { event_id: 'a', group_id: 2 }, { event_id: 'old', group_id: 1 }],
    answers: [{ event_id: 'a', answer: 'present' }, { event_id: 'old', answer: 'absent' }],
    lineups: [
      { event_id: 'a', slot: 'goalie', unit: 1, profiles: { first_name: 'Marco', last_name: 'Bianchi', jersey_number: 9, phone: '333', email: 'm@x.y' } },
      { event_id: 'old', slot: 'centre', unit: 1, profiles: { first_name: 'No', last_name: 'One', jersey_number: 1 } },
    ],
    plans: [{ event_id: 'a', notes: 'Riscaldamento', secret: 'x' }, { event_id: 'far', notes: 'no' }],
    planDrills: [{ event_id: 'a', step: 2, minutes: 10, drills: { title: 'Tiri', file_path: 'f.pdf' } }, { event_id: 'a', step: 1, minutes: null, drills: { title: 'Passaggi', video_url: 'v' } }],
  }
  const copy = buildCopy('me', now, raw)
  it('keeps the next weeks only, in order, and the cancelled ones marked', () => {
    expect(copy.events.map((e) => e.id)).toEqual(['a', 'b', 'gone'])
    expect(copy.events[2].cancelled).toBe(true)
  })
  it('joins groups and the own answer to their event', () => {
    expect(copy.events[0].group_ids).toEqual([1, 2])
    expect(copy.events[0].answer).toBe('present')
    expect(copy.events[1].answer).toBeNull()
  })
  it('keeps the names of a line-up and nothing else about the people', () => {
    expect(copy.lineups).toEqual([{ event_id: 'a', slot: 'goalie', unit: 1, name: 'Bianchi Marco', jersey_number: 9 }])
  })
  it('keeps the plan notes and the drill titles in step order, without files or links', () => {
    expect(copy.plans).toEqual([{ event_id: 'a', notes: 'Riscaldamento', drills: [{ step: 1, title: 'Passaggi', minutes: null }, { step: 2, title: 'Tiri', minutes: 10 }] }])
  })
  it('carries no contact, file or document field anywhere', () => {
    const text = JSON.stringify(copy)
    for (const word of ['phone', 'email', 'x@y.z', '333', 'file_path', 'f.pdf', 'video_url', 'secret', 'rating']) expect(text).not.toContain(word)
  })
  it('holds at most 40 events', () => {
    const many = Array.from({ length: 60 }, (_, i) => ev(`e${i}`, new Date(now.getTime() + (i + 1) * 3_600_000).toISOString()))
    expect(buildCopy('me', now, { ...raw, events: many }).events).toHaveLength(40)
  })
})

describe('usable and needsRenewal', () => {
  const copy: OfflineCopy = { user_id: 'me', saved_at: now.toISOString(), events: [], lineups: [], plans: [] }
  it('is good for the same person while it is young', () => {
    expect(usable(copy, 'me', new Date(now.getTime() + 3600_000))).toBe(true)
  })
  it('is never good for another person or with nobody signed in', () => {
    expect(usable(copy, 'you', now)).toBe(false)
    expect(usable(copy, undefined, now)).toBe(false)
    expect(usable(null, 'me', now)).toBe(false)
  })
  it('is refused after 28 days', () => {
    expect(usable(copy, 'me', new Date(now.getTime() + 29 * 86_400_000))).toBe(false)
  })
  it('is renewed after 30 minutes, not before', () => {
    expect(needsRenewal(copy, 'me', new Date(now.getTime() + 10 * 60_000))).toBe(false)
    expect(needsRenewal(copy, 'me', new Date(now.getTime() + 31 * 60_000))).toBe(true)
    expect(needsRenewal(null, 'me', now)).toBe(true)
  })
})
