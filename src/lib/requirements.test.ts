import { describe, expect, it } from 'vitest'
import { appliesTo, canSubmit, itemsFor, personSummary, staffFigures, staffItemsFor, requirementStatus, type Requirement, type RequirementAnswer } from './requirements'

const req = (over: Partial<Requirement> = {}): Requirement => ({
  id: 'r1', slug: null, title: 'Foto', reason: 'Per le foto', group_ids: [], deadline: null, expiry_block: null, expiry_months: null,
  review: 'none', visibility: 'staff', blocking: true, staff_can_submit: false, active: true, current_version: 1, ...over,
})
const answer = (over: Partial<RequirementAnswer> = {}): RequirementAnswer => ({
  requirement_id: 'r1', user_id: 'u1', version: 1, answers: {}, sources: {}, status: 'complete', submitted_at: '2026-11-01T10:00:00Z',
  valid_until: null, reviewed_at: null, review_note: '', ...over,
})
const today = '2026-11-14'

describe('requirementStatus', () => {
  it('is missing without an answer, bad when it blocks and soon when it does not', () => {
    expect(requirementStatus(req(), undefined, today)).toMatchObject({ state: 'missing', level: 'bad' })
    expect(requirementStatus(req({ blocking: false }), undefined, today)).toMatchObject({ state: 'missing', level: 'soon' })
  })
  it('is done for a complete or approved answer', () => {
    expect(requirementStatus(req(), answer(), today)).toMatchObject({ state: 'done', level: 'ok' })
    expect(requirementStatus(req(), answer({ status: 'approved' }), today)).toMatchObject({ state: 'done', level: 'ok' })
  })
  it('waits for staff while pending and asks again when rejected', () => {
    expect(requirementStatus(req(), answer({ status: 'pending' }), today)).toMatchObject({ state: 'pending', level: 'soon' })
    expect(requirementStatus(req(), answer({ status: 'rejected', review_note: 'Foto sfocata' }), today)).toMatchObject({ state: 'rejected', level: 'bad' })
  })
  it('counts an answer to an older version as outdated, before anything else', () => {
    const r = req({ current_version: 3 })
    expect(requirementStatus(r, answer({ version: 2 }), today).state).toBe('outdated')
    expect(requirementStatus(r, answer({ version: 2, status: 'pending' }), today).state).toBe('outdated')
    expect(requirementStatus(r, answer({ version: 3 }), today).state).toBe('done')
  })
  it('follows the end date: expired the day after, expiring within thirty days', () => {
    const r = req({ expiry_block: 'issued', expiry_months: 12 })
    expect(requirementStatus(r, answer({ valid_until: '2026-11-13' }), today).state).toBe('expired')
    expect(requirementStatus(r, answer({ valid_until: '2026-11-14' }), today).state).toBe('expiring')
    expect(requirementStatus(r, answer({ valid_until: '2026-12-14' }), today).state).toBe('expiring')
    expect(requirementStatus(r, answer({ valid_until: '2026-12-15' }), today).state).toBe('done')
  })
  it('keeps pending ahead of expiring but expired ahead of pending', () => {
    const r = req({ expiry_block: 'issued', expiry_months: 12 })
    expect(requirementStatus(r, answer({ status: 'pending', valid_until: '2026-11-20' }), today).state).toBe('pending')
    expect(requirementStatus(r, answer({ status: 'pending', valid_until: '2026-11-01' }), today).state).toBe('expired')
  })
  it('marks a missed deadline only while the person still has to act', () => {
    const r = req({ deadline: '2026-11-10' })
    expect(requirementStatus(r, undefined, today).overdue).toBe(true)
    expect(requirementStatus(r, answer(), today).overdue).toBe(false)
    expect(requirementStatus(req({ deadline: '2026-11-14' }), undefined, today).overdue).toBe(false)
  })
})

describe('canSubmit', () => {
  it('lets a member answer when nothing is on record, after a rejection and after a new version', () => {
    expect(canSubmit(req(), undefined)).toBe(true)
    expect(canSubmit(req(), answer({ status: 'rejected' }))).toBe(true)
    expect(canSubmit(req({ current_version: 2 }), answer())).toBe(true)
  })
  it('refuses a second answer to the same version unless the requirement expires', () => {
    expect(canSubmit(req(), answer())).toBe(false)
    expect(canSubmit(req(), answer({ status: 'pending' }))).toBe(false)
    expect(canSubmit(req({ expiry_block: 'issued', expiry_months: 12 }), answer())).toBe(true)
  })
  it('refuses an archived requirement', () => {
    expect(canSubmit(req({ active: false }), undefined)).toBe(false)
  })
})

describe('appliesTo', () => {
  it('applies to everybody when no group is chosen, otherwise to the people of those groups', () => {
    expect(appliesTo(req(), [])).toBe(true)
    expect(appliesTo(req({ group_ids: [1, 2] }), [2, 5])).toBe(true)
    expect(appliesTo(req({ group_ids: [1, 2] }), [5])).toBe(false)
  })
})

describe('itemsFor and personSummary', () => {
  const a = req({ id: 'a', title: 'Certificato' })
  const b = req({ id: 'b', title: 'Foto', group_ids: [2] })
  it('keeps requirements for the groups of the person and those already answered', () => {
    const items = itemsFor([a, b, req({ id: 'c', active: false })], [answer({ requirement_id: 'c' })], [1], today)
    expect(items.map((i) => i.req.id)).toEqual(['a', 'c'])
  })
  it('says in order when everything is fine', () => {
    const items = itemsFor([a], [answer({ requirement_id: 'a' })], [], today)
    expect(personSummary(items)).toMatchObject({ level: 'ok', todo: 0, waiting: 0, text: 'In regola' })
  })
  it('names the one thing to do, or counts several', () => {
    const one = personSummary(itemsFor([a], [], [], today))
    expect(one).toMatchObject({ level: 'bad', todo: 1 })
    expect(one.text).toContain('Certificato')
    const two = personSummary(itemsFor([a, req({ id: 'd' })], [], [], today))
    expect(two).toMatchObject({ level: 'bad', todo: 2, text: '2 documenti da completare' })
  })
  it('puts what waits for staff after what the person must do', () => {
    const items = itemsFor([a, req({ id: 'd', title: 'Altro' })], [answer({ requirement_id: 'a', status: 'pending' })], [], today)
    expect(personSummary(items)).toMatchObject({ level: 'bad', todo: 1, waiting: 1 })
    const waitingOnly = personSummary(itemsFor([a], [answer({ requirement_id: 'a', status: 'pending' })], [], today))
    expect(waitingOnly).toMatchObject({ level: 'soon', todo: 0, waiting: 1 })
  })
})

describe('staffItemsFor', () => {
  it('hides what the board keeps to itself from a coach', () => {
    const rs = [req({ id: 'a' }), req({ id: 'b', visibility: 'board' })]
    expect(staffItemsFor(rs, [], [], today, false).map((i) => i.req.id)).toEqual(['a'])
    expect(staffItemsFor(rs, [], [], today, true).map((i) => i.req.id)).toEqual(['a', 'b'])
  })
})

describe('staffFigures', () => {
  it('counts people, not documents, and keeps the three figures apart', () => {
    const rs = [req({ id: 'a' }), req({ id: 'b', title: 'Altro' })]
    const answers = [
      answer({ requirement_id: 'a', user_id: 'u1' }),
      answer({ requirement_id: 'b', user_id: 'u1', status: 'pending' }),
      answer({ requirement_id: 'a', user_id: 'u2', valid_until: '2026-11-20' }),
      answer({ requirement_id: 'b', user_id: 'u2' }),
    ]
    // u1 has everything in, one waiting; u2 has one ending soon; u3 answered nothing.
    expect(staffFigures(['u1', 'u2', 'u3'], [], rs, answers, today, true)).toEqual({ todo: 1, toVerify: 1, expiring: 1 })
  })
})
