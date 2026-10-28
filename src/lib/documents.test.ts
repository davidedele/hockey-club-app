import { describe, expect, it } from 'vitest'
import { certificateState, consentState, summary } from './documents'
import type { MemberDocument } from './types'

const cert = (valid_until: string | null): MemberDocument => ({ user_id: 'u', kind: 'medical_certificate', valid_until, file_path: null, accepted_at: null })
const consent = (file_path: string | null): MemberDocument => ({ user_id: 'u', kind: 'privacy_consent', valid_until: null, file_path, accepted_at: '2026-10-01T10:00:00Z' })

describe('paperwork', () => {
  it('reads a certificate', () => {
    expect(certificateState(undefined, '2026-10-22').level).toBe('bad')
    expect(certificateState(cert('2026-10-21'), '2026-10-22').level).toBe('bad')
    expect(certificateState(cert('2026-11-21'), '2026-10-22').level).toBe('soon')
    expect(certificateState(cert('2026-11-22'), '2026-10-22').level).toBe('ok')
  })
  it('reads a consent against the current notice', () => {
    expect(consentState(undefined, null).level).toBe('none')
    expect(consentState(undefined, 'club/privacy-1.pdf').level).toBe('bad')
    expect(consentState(consent('club/privacy-1.pdf'), 'club/privacy-2.pdf').level).toBe('soon')
    expect(consentState(consent('club/privacy-2.pdf'), 'club/privacy-2.pdf').level).toBe('ok')
  })
  it('sums up with the most urgent problem', () => {
    expect(summary([cert('2027-05-01'), consent('n')], 'n', '2026-10-22').level).toBe('ok')
    expect(summary([cert('2026-11-01'), consent('n')], 'n', '2026-10-22').level).toBe('soon')
    expect(summary([cert('2027-05-01')], 'n', '2026-10-22').level).toBe('bad')
    expect(summary([cert('2027-05-01')], null, '2026-10-22').level).toBe('ok')
    expect(summary([], 'n', '2026-10-22').text).toBe('Manca il certificato')
    expect(summary([cert('2027-05-01'), consent('old')], 'n', '2026-10-22').text).toBe('Consenso privacy da rinnovare')
  })
})
