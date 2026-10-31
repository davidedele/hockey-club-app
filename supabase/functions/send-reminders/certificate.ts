// Builds the email that warns a member about the medical certificate. Pure functions, no network.
import { escapeHtml } from './reminder.ts'

export type CertificateRow = {
  valid_until: string
  stage: number
  days: number
}

export const words = {
  hello: 'Ciao',
  expiresOn: 'Il certificato medico scade il',
  expiresTomorrow: 'Il certificato medico scade domani',
  expiresToday: 'Il certificato medico scade oggi',
  expired: 'Il certificato medico è scaduto',
  introSoon: 'Il tuo certificato medico di idoneità sportiva scade il',
  introToday: 'Il tuo certificato medico di idoneità sportiva scade oggi,',
  introPast: 'Il tuo certificato medico di idoneità sportiva è scaduto il',
  bookIt: 'Se non hai ancora la visita, prenotala per tempo: senza certificato valido non puoi scendere in pista.',
  bringIt: 'Appena hai il nuovo certificato, caricalo nell\'app insieme alla nuova scadenza.',
  open: 'Apri i documenti',
  off: 'Non vuoi più ricevere le notifiche per email? Puoi cambiare le preferenze di notifica dal tuo profilo:',
}

// "12 marzo 2027" in Italian. The date arrives as a plain day, with no time of its own.
export function day(date: string): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`))
}

export function buildCertificate(
  firstName: string,
  row: CertificateRow,
  appUrl: string,
): { subject: string; text: string; html: string } {
  const base = appUrl.replace(/\/+$/, '')
  const date = day(row.valid_until)
  const subject =
    row.days > 1 ? `${words.expiresOn} ${date}`
      : row.days === 1 ? words.expiresTomorrow
        : row.days === 0 ? words.expiresToday
          : words.expired
  const first =
    row.days > 0 ? `${words.introSoon} ${date}.`
      : row.days === 0 ? `${words.introToday} ${date}.`
        : `${words.introPast} ${date}.`
  const text = [
    `${words.hello} ${firstName},`,
    '',
    first,
    words.bookIt,
    words.bringIt,
    '',
    `${words.open}: ${base}/documents`,
    '',
    `${words.off} ${base}/profile`,
    '',
  ].join('\n')
  const html =
    `<p>${escapeHtml(words.hello)} ${escapeHtml(firstName)},</p>` +
    `<p>${escapeHtml(first)}</p>` +
    `<p>${escapeHtml(words.bookIt)}</p>` +
    `<p>${escapeHtml(words.bringIt)}</p>` +
    `<p><a href="${escapeHtml(base)}/documents">${escapeHtml(words.open)}</a></p>` +
    `<p style="color:#666;font-size:13px">${escapeHtml(words.off)} <a href="${escapeHtml(base)}/profile">${escapeHtml(base)}/profile</a></p>`
  return { subject, text, html }
}
