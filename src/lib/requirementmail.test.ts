import { describe, expect, it } from 'vitest'
import { buildRequirement } from '../../supabase/functions/send-reminders/requirement'

const url = 'https://club.example'
const row = (over: object = {}) => ({ slug: null, title: 'Tessera federale', valid_until: '2027-03-12', stage: 60, days: 45, ...over })

describe('requirement reminder email', () => {
  it('names the document and the date', () => {
    const m = buildRequirement('Pia', row(), url)
    expect(m.subject).toBe('Il documento «Tessera federale» scade il 12 marzo 2027')
    expect(m.text).toContain('Ciao Pia,')
    expect(m.text).toContain('Il tuo documento «Tessera federale» scade il 12 marzo 2027.')
    expect(m.text).toContain('https://club.example/profile/documents')
  })
  it('says tomorrow, today and expired', () => {
    expect(buildRequirement('Pia', row({ days: 1, stage: 7 }), url).subject).toContain('scade domani')
    expect(buildRequirement('Pia', row({ days: 0, stage: 0 }), url).subject).toContain('scade oggi')
    const late = buildRequirement('Pia', row({ days: -40, stage: -30 }), url)
    expect(late.subject).toContain('è scaduto')
    expect(late.text).toContain('è scaduto il 12 marzo 2027')
  })
  it('keeps the advice about the medical visit for the certificate only', () => {
    expect(buildRequirement('Pia', row({ slug: 'medical_certificate', title: 'Certificato medico' }), url).text).toContain('prenotala')
    expect(buildRequirement('Pia', row(), url).text).not.toContain('prenotala')
  })
  it('escapes names and titles in the html part', () => {
    const m = buildRequirement('<b>Pia</b>', row({ title: '<i>x</i>' }), url)
    expect(m.html).not.toContain('<b>Pia</b>')
    expect(m.html).not.toContain('<i>x</i>')
  })
})
