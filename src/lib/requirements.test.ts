import { describe, expect, it } from 'vitest'
import { appliesTo, canSubmit, requirementStatus, type Requirement, type RequirementAnswer } from './requirements'

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
