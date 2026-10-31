import { describe, expect, it } from 'vitest'
import { announcementPush, certificatePush, noticePush, reminderPush } from '../../supabase/functions/send-reminders/push'

const ev = (n: number) => ({ event_id: `e${n}`, title: 'Allenamento', starts_at: '2026-11-05T19:30:00Z' })

describe('push texts', () => {
  it('opens the event for one reminder and the list for several', () => {
    expect(reminderPush([ev(1)], false)).toEqual({ title: 'Allenamento, gio 5 nov', body: 'Ci sei? Rispondi.', url: '/events/e1' })
    expect(reminderPush([ev(1), ev(2)], false)).toMatchObject({ title: 'Eventi senza risposta', body: 'Hai 2 eventi senza risposta.', url: '/events' })
    expect(reminderPush([ev(1)], true).title.startsWith('Promemoria: ')).toBe(true)
  })
  it('says what happened to one event, and keeps the rest short', () => {
    expect(noticePush(0, [{ title: 'Partita', what: 'cancelled' }], 'e1')).toMatchObject({ title: 'Annullato: Partita', url: '/events/e1' })
    expect(noticePush(2, [], null)).toMatchObject({ title: 'Aggiornamenti del calendario', url: '/events' })
  })
  it('carries no health data, names or announcement text', () => {
    const all = [announcementPush(), certificatePush()].map((m) => `${m.title} ${m.body}`).join(' ').toLowerCase()
    expect(all).not.toMatch(/\d{1,2}[/.]\d{1,2}|scad|visita|idone/)
    expect(certificatePush().url).toBe('/profile/documents')
  })
  it('keeps the lock screen text short', () => {
    const long = 'x'.repeat(200)
    expect(reminderPush([{ ...ev(1), title: long }], false).title.length).toBeLessThan(90)
  })
  it('never needs more than a title, a short line and a path', () => {
    for (const m of [reminderPush([ev(1)], false), noticePush(3, [], null), announcementPush(), certificatePush()]) {
      expect(m.body.length).toBeLessThan(60)
      expect(m.url.startsWith('/')).toBe(true)
    }
  })
})
