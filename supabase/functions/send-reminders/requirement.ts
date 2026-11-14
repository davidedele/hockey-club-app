// Builds the email that warns a member that a required document runs out. Pure functions, no network.
import { escapeHtml } from './reminder.ts'
import { day } from './certificate.ts'

export type RequirementDue = {
  slug: string | null
  title: string
  valid_until: string
  stage: number
  days: number
}

export const words = {
  hello: 'Ciao',
  expiresOn: 'scade il',
  expiresTomorrow: 'scade domani',
  expiresToday: 'scade oggi',
  expired: 'è scaduto',
  introSoon: 'scade il',
  introToday: 'scade oggi,',
  introPast: 'è scaduto il',
  documentPrefix: 'Il documento',
  ownPrefix: 'Il tuo documento',
  bookIt: 'Se non hai ancora la visita, prenotala per tempo: senza certificato valido non puoi scendere in pista.',
  renewIt: 'Controlla cosa serve e rinnovalo per tempo.',
  sendIt: 'Appena hai la nuova versione, inviala dall\'app.',
  open: 'Apri i documenti',
  off: 'Non vuoi più ricevere le notifiche per email? Puoi cambiare le preferenze di notifica dal tuo profilo:',
}

export function buildRequirement(
  firstName: string,
  row: RequirementDue,
  appUrl: string,
): { subject: string; text: string; html: string } {
  const base = appUrl.replace(/\/+$/, '')
  const date = day(row.valid_until)
  const name = `${words.documentPrefix} «${row.title}»`
  const subject =
    row.days > 1 ? `${name} ${words.expiresOn} ${date}`
      : row.days === 1 ? `${name} ${words.expiresTomorrow}`
        : row.days === 0 ? `${name} ${words.expiresToday}`
          : `${name} ${words.expired}`
  const own = `${words.ownPrefix} «${row.title}»`
  const first =
    row.days > 0 ? `${own} ${words.introSoon} ${date}.`
      : row.days === 0 ? `${own} ${words.introToday} ${date}.`
        : `${own} ${words.introPast} ${date}.`
  const hint = row.slug === 'medical_certificate' ? words.bookIt : words.renewIt
  const text = [
    `${words.hello} ${firstName},`,
    '',
    first,
    hint,
    words.sendIt,
    '',
    `${words.open}: ${base}/profile/documents`,
    '',
    `${words.off} ${base}/profile`,
    '',
  ].join('\n')
  const html =
    `<p>${escapeHtml(words.hello)} ${escapeHtml(firstName)},</p>` +
    `<p>${escapeHtml(first)}</p>` +
    `<p>${escapeHtml(hint)}</p>` +
    `<p>${escapeHtml(words.sendIt)}</p>` +
    `<p><a href="${escapeHtml(base)}/profile/documents">${escapeHtml(words.open)}</a></p>` +
    `<p style="color:#666;font-size:13px">${escapeHtml(words.off)} <a href="${escapeHtml(base)}/profile">${escapeHtml(base)}/profile</a></p>`
  return { subject, text, html }
}
