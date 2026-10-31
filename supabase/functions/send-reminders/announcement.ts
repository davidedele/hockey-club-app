// Builds the text of one announcement email. Pure functions, no network.
import { escapeHtml } from './reminder.ts'

export const announcementWords = {
  hello: 'Ciao',
  from: 'Messaggio di',
  to: 'per',
  open: 'Aprilo nell\'app',
  off: 'Non vuoi più ricevere le notifiche per email? Puoi cambiare le preferenze di notifica dal tuo profilo:',
}

export function buildAnnouncement(
  firstName: string,
  title: string,
  body: string,
  authorName: string,
  groupNames: string,
  appUrl: string,
): { subject: string; text: string; html: string } {
  const base = appUrl.replace(/\/+$/, '')
  const w = announcementWords
  const who = authorName.trim() ? `${w.from} ${authorName.trim()}` : w.from.replace(/ di$/, '')
  const meta = groupNames.trim() ? `${who}, ${w.to} ${groupNames.trim()}` : who
  const text = [`${w.hello} ${firstName},`, '', title, '', body, '', meta, '', `${w.open}: ${base}/announcements`, '', `${w.off} ${base}/profile`, ''].join('\n')
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const html =
    `<p>${escapeHtml(w.hello)} ${escapeHtml(firstName)},</p>` +
    `<h2 style="font-size:18px">${escapeHtml(title)}</h2>` +
    paragraphs +
    `<p style="color:#666;font-size:13px">${escapeHtml(meta)}</p>` +
    `<p><a href="${escapeHtml(base)}/announcements">${escapeHtml(w.open)}</a></p>` +
    `<p style="color:#666;font-size:13px">${escapeHtml(w.off)} <a href="${escapeHtml(base)}/profile">${escapeHtml(base)}/profile</a></p>`
  return { subject: title.replace(/\s+/g, ' ').trim(), text, html }
}
