import { describe, expect, it } from 'vitest'
import { certificateState, consentState, summary } from './documents'
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
