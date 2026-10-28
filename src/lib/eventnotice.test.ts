import { describe, expect, it } from 'vitest'
import { buildEventNotice, type NoticeRow } from '../../supabase/functions/send-reminders/eventnotice'

const base = {
  event_id: 'e1', change_id: null, title: 'Allenamento', type: 'training' as const, series_id: null,
  starts_at: '2026-11-05T19:30:00Z', ends_at: '2026-11-05T21:00:00Z', meetup_at: null, venue: 'Pista grande',
  cancelled: false, old_starts_at: null, old_ends_at: null, old_meetup_at: null, old_venue: null, old_cancelled: null,
}
const row = (over: Partial<NoticeRow>): NoticeRow => ({ kind: 'new', ...base, ...over })
const change = (over: Partial<NoticeRow>): NoticeRow =>
  row({ kind: 'changed', change_id: 1, old_starts_at: base.starts_at, old_ends_at: base.ends_at, old_venue: 'Pista grande', old_cancelled: false, ...over })

describe('calendar email', () => {
  it('announces one new event with a clear subject', () => {
    const m = buildEventNotice('Pia', [row({})], 'https://app.example.it/')
    expect(m.subject).toBe('Nuovo allenamento: Allenamento, giovedì 5 novembre, 20:30')
    expect(m.text).toContain('Ciao Pia,')
    expect(m.text).toContain('1. giovedì 5 novembre, 20:30: Allenamento (Pista grande)')
    expect(m.text).toContain('https://app.example.it/events')
    expect(m.text).toContain('https://app.example.it/profile')
    expect(m.newEvents).toEqual(['e1'])
    expect(m.changes).toEqual([])
  })

  it('says game for a game', () => {
    expect(buildEventNotice('Pia', [row({ type: 'game', title: 'Partita' })], 'https://a.it').subject).toMatch(/^Nuova partita: /)
  })

  it('turns a weekly series into one line', () => {
    const rows = [0, 1, 2].map((i) => row({ event_id: `s${i}`, series_id: 's', starts_at: `2026-11-${String(5 + i * 7).padStart(2, '0')}T19:30:00Z` }))
    const m = buildEventNotice('Pia', rows, 'https://a.it')
    expect(m.text).toContain('1. Allenamento, ogni settimana, da giovedì 5 novembre, 20:30 (3 date) (Pista grande)')
    expect(m.text).not.toContain('2. ')
    expect(m.subject).toBe('Novità dal calendario')
    expect(m.newEvents).toEqual(['s0', 's1', 's2'])
  })

  it('keeps long lists short', () => {
    const rows = Array.from({ length: 13 }, (_, i) => row({ event_id: `x${i}`, starts_at: `2026-11-${String(1 + i).padStart(2, '0')}T19:30:00Z` }))
    const m = buildEventNotice('Pia', rows, 'https://a.it')
    expect(m.text).toContain('11. e altri 3')
    expect(m.text).not.toContain('12. ')
  })

  it('tells what moved, with old and new values', () => {
    const m = buildEventNotice('Pia', [change({ starts_at: '2026-11-05T20:00:00Z', venue: 'Pista B', meetup_at: '2026-11-05T19:00:00Z' })], 'https://a.it')
    expect(m.subject).toBe('Cambio: Allenamento')
    expect(m.text).toContain('orario: era giovedì 5 novembre, 20:30, ora giovedì 5 novembre, 21:00')
    expect(m.text).toContain('ritrovo: era non indicato, ora 20:00')
    expect(m.text).toContain('luogo: era Pista grande, ora Pista B')
    expect(m.changes).toEqual([1])
  })

  it('joins two changes in a row and drops what came back', () => {
    const m = buildEventNotice('Pia', [
      change({ change_id: 1, starts_at: '2026-11-05T20:00:00Z', venue: 'Pista B' }),
      change({ change_id: 2, old_starts_at: '2026-11-05T20:00:00Z', starts_at: '2026-11-05T20:30:00Z', old_venue: 'Pista B', venue: 'Pista grande' }),
    ], 'https://a.it')
    expect(m.text).toContain('orario: era giovedì 5 novembre, 20:30, ora giovedì 5 novembre, 21:30')
    expect(m.text).not.toContain('luogo')
    expect(m.changes).toEqual([1, 2])
  })

  it('says cancelled and back on', () => {
    expect(buildEventNotice('Pia', [change({ cancelled: true })], 'https://a.it').subject).toBe('Annullato: Allenamento')
    expect(buildEventNotice('Pia', [change({ cancelled: true })], 'https://a.it').text).toContain('ANNULLATO: Allenamento, giovedì 5 novembre, 20:30')
    const back = buildEventNotice('Pia', [change({ old_cancelled: true, cancelled: false })], 'https://a.it')
    expect(back.subject).toBe('Di nuovo in programma: Allenamento')
  })

  it('does not repeat changes of an event that is new for the person', () => {
    const m = buildEventNotice('Pia', [row({}), change({ starts_at: '2026-11-05T20:00:00Z' })], 'https://a.it')
    expect(m.text).not.toContain('Cambiamenti')
    expect(m.changes).toEqual([1])
    expect(m.newEvents).toEqual(['e1'])
  })

  it('is empty when everything changed back, but still lists what to mark as sent', () => {
    const m = buildEventNotice('Pia', [change({})], 'https://a.it')
    expect(m.empty).toBe(true)
    expect(m.changes).toEqual([1])
  })

  it('does not let a title inject html', () => {
    const m = buildEventNotice('<b>Pia</b>', [row({ title: '<script>x</script>', venue: 'A & B' })], 'https://a.it')
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('A &amp; B')
    expect(m.html).toContain('&lt;b&gt;Pia&lt;/b&gt;')
  })
})
