// Builds the text of one reminder email. Pure functions, no network.

export type ReminderEvent = {
  title: string
  type: 'training' | 'game'
  starts_at: string
  venue: string | null
}

export const words = {
  hello: 'Ciao',
  oneSubject: 'Ci sei? Rispondi per',
  manySubject: 'Eventi senza la tua risposta',
  lastPrefix: 'Promemoria:',
  intro: 'Non hai ancora risposto per questo evento:',
  introMany: 'Non hai ancora risposto per questi eventi:',
  answer: 'Rispondi nell\'app',
  off: 'Non vuoi più ricevere i promemoria? Puoi disattivarli dal tuo profilo:',
  game: 'Partita',
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// "giovedì 5 novembre, 20:30" in Italian time
export function when(iso: string): string {
  const d = new Date(iso)
  const day = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  const clock = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(d)
  return `${day}, ${clock}`
}

export function line(e: ReminderEvent): string {
  const place = e.venue && e.venue.trim() ? ` (${e.venue.trim()})` : ''
  return `${when(e.starts_at)}: ${e.title}${place}`
}

export function buildReminder(
  firstName: string,
  events: ReminderEvent[],
  last: boolean,
  appUrl: string,
): { subject: string; text: string; html: string } {
  const base = appUrl.replace(/\/+$/, '')
  const subject =
    events.length === 1
      ? `${last ? words.lastPrefix + ' ' : ''}${words.oneSubject} ${events[0].title.toLowerCase()}, ${when(events[0].starts_at)}`
      : `${last ? words.lastPrefix + ' ' : ''}${words.manySubject}`
  const intro = events.length === 1 ? words.intro : words.introMany
  const lines = events.map(line)
  const text = [
    `${words.hello} ${firstName},`,
    '',
    intro,
    ...lines.map((l, i) => `${i + 1}. ${l}`),
    '',
    `${words.answer}: ${base}/events`,
    '',
    `${words.off} ${base}/profile`,
    '',
  ].join('\n')
  const html =
    `<p>${escapeHtml(words.hello)} ${escapeHtml(firstName)},</p>` +
    `<p>${escapeHtml(intro)}</p>` +
    `<ol>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ol>` +
    `<p><a href="${escapeHtml(base)}/events">${escapeHtml(words.answer)}</a></p>` +
    `<p style="color:#666;font-size:13px">${escapeHtml(words.off)} <a href="${escapeHtml(base)}/profile">${escapeHtml(base)}/profile</a></p>`
  return { subject, text, html }
}
