// The short texts of the push notifications. Pure functions, no network. A push shows on the lock
// screen, so it never carries health data (no certificate dates), other people's names, or the text of
// an announcement: only what is needed to know that the app has something for the person.

export type PushMessage = { title: string; body: string; url: string }

const day = (iso: string) =>
  new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Rome' }).format(new Date(iso))

const clip = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1).trim()}…` : text)

// Events without an answer. One event opens its page, with the answer buttons.
export function reminderPush(events: { event_id: string; title: string; starts_at: string }[], last: boolean): PushMessage {
  if (events.length === 1) {
    const e = events[0]
    return { title: `${last ? 'Promemoria: ' : ''}${clip(e.title)}, ${day(e.starts_at)}`, body: 'Ci sei? Rispondi.', url: `/events/${e.event_id}` }
  }
  return { title: `${last ? 'Promemoria: ' : ''}Eventi senza risposta`, body: `Hai ${events.length} eventi senza risposta.`, url: '/events' }
}

// New events, changes and cancellations.
export function noticePush(news: number, changes: { title: string; what: 'cancelled' | 'restored' | 'changed' }[], firstEventId: string | null): PushMessage {
  if (news + changes.length === 1 && changes.length === 1) {
    const c = changes[0]
    const word = c.what === 'cancelled' ? 'Annullato' : c.what === 'restored' ? 'Ripristinato' : 'Cambiato'
    return { title: `${word}: ${clip(c.title)}`, body: 'Apri per i dettagli.', url: firstEventId ? `/events/${firstEventId}` : '/events' }
  }
  return { title: 'Aggiornamenti del calendario', body: 'Apri per vedere cosa è cambiato.', url: firstEventId && news + changes.length === 1 ? `/events/${firstEventId}` : '/events' }
}

export function announcementPush(): PushMessage {
  return { title: 'Nuovo avviso dal club', body: 'Aprilo nell\'app.', url: '/announcements' }
}

export function certificatePush(): PushMessage {
  return { title: 'Certificato medico', body: 'Controlla il tuo certificato nell\'app.', url: '/profile/documents' }
}
