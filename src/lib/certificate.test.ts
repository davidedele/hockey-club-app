import { describe, expect, it } from 'vitest'
import { buildCertificate, day } from '../../supabase/functions/send-reminders/certificate'

const url = 'https://app.example.test'

describe('certificate email', () => {
  it('writes the date in Italian', () => {
    expect(day('2027-03-12')).toBe('12 marzo 2027')
  })

  it('names the date in the subject when there is still time', () => {
    const m = buildCertificate('Pia', { valid_until: '2027-03-12', stage: 60, days: 45 }, url)
    expect(m.subject).toBe('Il certificato medico scade il 12 marzo 2027')
    expect(m.text).toContain('Ciao Pia,')
    expect(m.text).toContain('scade il 12 marzo 2027')
    expect(m.text).toContain(`${url}/documents`)
  })

  it('says tomorrow and today instead of the date', () => {
    expect(buildCertificate('Pia', { valid_until: '2027-03-12', stage: 7, days: 1 }, url).subject)
      .toBe('Il certificato medico scade domani')
    expect(buildCertificate('Pia', { valid_until: '2027-03-12', stage: 0, days: 0 }, url).subject)
      .toBe('Il certificato medico scade oggi')
  })

  it('speaks in the past once it has run out', () => {
    const m = buildCertificate('Pia', { valid_until: '2027-03-12', stage: -30, days: -40 }, url)
    expect(m.subject).toBe('Il certificato medico è scaduto')
    expect(m.text).toContain('è scaduto il 12 marzo 2027')
  })

  it('always offers the way to switch the emails off', () => {
    const m = buildCertificate('Pia', { valid_until: '2027-03-12', stage: 30, days: 20 }, url)
    expect(m.text).toContain(`${url}/profile`)
    expect(m.html).toContain(`${url}/profile`)
  })

  it('does not let a name carry html into the email', () => {
    const m = buildCertificate('<b>Pia</b>', { valid_until: '2027-03-12', stage: 30, days: 20 }, url)
    expect(m.html).toContain('&lt;b&gt;Pia&lt;/b&gt;')
    expect(m.html).not.toContain('<b>Pia</b>')
  })
})
