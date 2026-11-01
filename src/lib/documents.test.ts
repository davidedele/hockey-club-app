import { describe, expect, it } from 'vitest'
import { certificateState, confirmedBy, consentState, summary, toVerify } from './documents'
import type { MemberDocument } from './types'

const FILE = 'u/medical_certificate-2000000000.jpg'
const cert = (o: Partial<MemberDocument>): MemberDocument => ({ user_id: 'u', kind: 'medical_certificate', valid_until: null, file_path: FILE, accepted_at: null, issued_on: null, issued_source: null, verified_at: null, ...o })
// A certificate whose date of issue the reader found: valid until a year later.
const read = (issued: string, valid: string) => cert({ issued_on: issued, issued_source: 'read', valid_until: valid })
const consent = (file_path: string | null): MemberDocument => ({ user_id: 'u', kind: 'privacy_consent', valid_until: null, file_path, accepted_at: '2026-10-01T10:00:00Z' })
const now = '2026-10-22'

describe('the medical certificate', () => {
  it('is missing without a file, even with a date', () => {
    expect(certificateState(undefined, now).state).toBe('missing')
    expect(certificateState(cert({ file_path: null }), now).state).toBe('missing')
    expect(certificateState(cert({ file_path: null, valid_until: '2027-01-01' }), now).state).toBe('missing')
  })
  it('needs a date of issue when there is only a file', () => {
    expect(certificateState(cert({}), now)).toMatchObject({ state: 'needsDate', level: 'bad' })
  })
  it('is valid when the reader found the date, until a year after it', () => {
    expect(certificateState(read('2026-03-12', '2027-03-12'), now)).toMatchObject({ state: 'valid', level: 'ok' })
  })
  it('is to verify when the member typed the date, until staff confirm', () => {
    const typed = cert({ issued_on: '2026-03-12', issued_source: 'typed', valid_until: '2027-03-12' })
    expect(certificateState(typed, now)).toMatchObject({ state: 'toVerify', level: 'soon' })
    expect(certificateState({ ...typed, verified_at: '2026-10-20T10:00:00Z' }, now).state).toBe('valid')
  })
  it('keeps an old row with an end date and a file as to verify', () => {
    expect(certificateState(cert({ valid_until: '2027-01-01' }), now).state).toBe('toVerify')
  })
  it('counts down by the end date', () => {
    expect(certificateState(read('2025-10-21', '2026-10-21'), now)).toMatchObject({ state: 'expired', level: 'bad' })
    expect(certificateState(read('2025-11-21', '2026-11-21'), now)).toMatchObject({ state: 'soon', level: 'soon' })
    expect(certificateState(read('2025-11-22', '2026-11-22'), now).state).toBe('valid')
  })
})

describe('paperwork', () => {
  it('reads a consent against the current notice', () => {
    expect(consentState(undefined, null).level).toBe('none')
    expect(consentState(undefined, 'club/privacy-1.pdf').level).toBe('bad')
    expect(consentState(consent('club/privacy-1.pdf'), 'club/privacy-2.pdf').level).toBe('soon')
    expect(consentState(consent('club/privacy-2.pdf'), 'club/privacy-2.pdf').level).toBe('ok')
  })
  it('sums up with the most urgent problem', () => {
    expect(summary([read('2026-05-01', '2027-05-01'), consent('n')], 'n', now).level).toBe('ok')
    expect(summary([read('2025-11-01', '2026-11-01'), consent('n')], 'n', now).level).toBe('soon')
    expect(summary([read('2026-05-01', '2027-05-01')], 'n', now).level).toBe('bad')
    expect(summary([read('2026-05-01', '2027-05-01')], null, now).level).toBe('ok')
    expect(summary([], 'n', now).text).toBe('Manca il certificato')
    expect(summary([read('2026-05-01', '2027-05-01'), consent('old')], 'n', now).text).toBe('Consenso privacy da rinnovare')
  })
  it('names what is wrong with the certificate', () => {
    expect(summary([cert({})], null, now).text).toBe('Manca la data di rilascio')
    expect(summary([cert({ issued_on: '2026-03-12', issued_source: 'typed', valid_until: '2027-03-12' })], null, now).text).toBe('Certificato da verificare')
  })
})

describe('confirmedBy and toVerify', () => {
  const base = { user_id: 'u1', kind: 'medical_certificate' as const, valid_until: '2027-05-01', file_path: 'u1/c.jpg', accepted_at: null, issued_on: '2026-05-01', issued_source: 'typed' as const }
  it('says who confirmed, seen by the viewer', () => {
    expect(confirmedBy({ ...base, verified_at: '2026-10-01T10:00:00Z', verified_by: 'u1' }, 'u1')).toBe('you')
    expect(confirmedBy({ ...base, verified_at: '2026-10-01T10:00:00Z', verified_by: 'u1' }, 'staff1')).toBe('self')
    expect(confirmedBy({ ...base, verified_at: '2026-10-01T10:00:00Z', verified_by: 'staff2' }, 'staff1')).toBe('staff')
    expect(confirmedBy({ ...base, verified_at: '2026-10-01T10:00:00Z', verified_by: 'staff2' }, 'staff2')).toBe('you')
    expect(confirmedBy({ ...base, verified_at: null, verified_by: null }, 'staff1')).toBeNull()
    expect(confirmedBy(undefined, 'staff1')).toBeNull()
  })
  it('lists only certificates with a file and a date nobody confirmed', () => {
    const typed = { ...base }
    const confirmed = { ...base, user_id: 'u2', verified_at: '2026-10-01T10:00:00Z', verified_by: 'staff2' }
    const read = { ...base, user_id: 'u3', issued_source: 'read' as const }
    const noFile = { ...base, user_id: 'u4', file_path: null }
    const consent = { ...base, user_id: 'u5', kind: 'privacy_consent' as const }
    expect(toVerify([typed, confirmed, read, noFile, consent], '2026-10-15').map((d) => d.user_id)).toEqual(['u1'])
  })
})

describe('the review switch of the club', () => {
  it('counts a typed date at once when staff review is off, and waits for staff when it is on', async () => {
    const { setCertificateReview } = await import('./documents')
    const typed = cert({ issued_on: '2026-10-01', issued_source: 'typed', valid_until: '2027-10-01' })
    expect(certificateState(typed, now).state).toBe('toVerify')
    setCertificateReview(false)
    expect(certificateState(typed, now).state).toBe('valid')
    setCertificateReview(true)
    expect(certificateState(typed, now).state).toBe('toVerify')
  })
})
