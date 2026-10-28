import { describe, expect, it } from 'vitest'
import { buildReminder, escapeHtml, line, when } from '../../supabase/functions/send-reminders/reminder'

const training = { title: 'Allenamento', type: 'training' as const, starts_at: '2026-11-05T20:30:00+01:00', venue: 'Pista grande' }
const game = { title: 'Partita', type: 'game' as const, starts_at: '2026-11-08T18:00:00+01:00', venue: null }

describe('reminder email', () => {
  it('writes the date and time in Italian time', () => {
    expect(when('2026-11-05T19:30:00Z')).toBe('giovedì 5 novembre, 20:30')
    expect(when('2026-07-05T18:30:00Z')).toBe('domenica 5 luglio, 20:30')
  })

  it('puts the place in brackets only when there is one', () => {
    expect(line(training)).toBe('giovedì 5 novembre, 20:30: Allenamento (Pista grande)')
    expect(line(game)).toBe('domenica 8 novembre, 18:00: Partita')
  })

  it('asks about one event with a clear subject', () => {
    const m = buildReminder('Pia', [training], false, 'https://app.example.it')
    expect(m.subject).toBe('Ci sei? Rispondi per allenamento, giovedì 5 novembre, 20:30')
    expect(m.text).toContain('Ciao Pia,')
    expect(m.text).toContain('1. giovedì 5 novembre, 20:30: Allenamento (Pista grande)')
    expect(m.text).toContain('https://app.example.it/events')
  })

  it('lists several events in one email and marks the last reminder', () => {
    const m = buildReminder('Pia', [training, game], true, 'https://app.example.it/')
    expect(m.subject).toBe('Promemoria: Eventi senza la tua risposta')
    expect(m.text).toContain('2. domenica 8 novembre, 18:00: Partita')
    expect(m.text).toContain('https://app.example.it/events')
    expect(m.text).not.toContain('//events')
  })

  it('says how to switch reminders off', () => {
    const m = buildReminder('Pia', [training], false, 'https://app.example.it')
    expect(m.text).toContain('https://app.example.it/profile')
    expect(m.html).toContain('https://app.example.it/profile')
  })

  it('keeps text from becoming markup', () => {
    expect(escapeHtml('<b>"A" & B</b>')).toBe('&lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;')
    const m = buildReminder('<i>Pia</i>', [{ ...training, title: '<script>x</script>' }], false, 'https://app.example.it')
    expect(m.html).not.toContain('<script>')
    expect(m.html).not.toContain('<i>')
  })

  it('has no dashes in the words it writes', () => {
    const m = buildReminder('Pia', [training, game], true, 'https://app.example.it')
    expect(m.text.replace(/\d{1,2}:\d{2}/g, '')).not.toMatch(/—|–| - /)
  })
})
