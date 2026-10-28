// Builds the text of one calendar email: new events and changes to events. Pure functions, no network.
import { escapeHtml, when } from './reminder.ts'

export type NoticeRow = {
  kind: 'new' | 'changed'
  event_id: string
  change_id: number | null
  title: string
  type: 'training' | 'game'
  series_id: string | null
  starts_at: string
  ends_at: string
  meetup_at: string | null
  venue: string | null
  cancelled: boolean
  old_starts_at: string | null
  old_ends_at: string | null
  old_meetup_at: string | null
  old_venue: string | null
  old_cancelled: boolean | null
}

export const noticeWords = {
  hello: 'Ciao',
  newTraining: 'Nuovo allenamento',
  newGame: 'Nuova partita',
  newMany: 'Novità dal calendario',
  changed: 'Cambio',
  cancelled: 'Annullato',
  restored: 'Di nuovo in programma',
  introNew: 'Nuovi eventi:',
  introChanged: 'Cambiamenti:',
  weekly: 'ogni settimana, da',
  dates: 'date',
  more: 'e altri',
  time: 'orario',
  end: 'fine',
  meetup: 'ritrovo',
  venue: 'luogo',
  was: 'era',
  now: 'ora',
  unset: 'non indicato',
  open: 'Vedi il calendario nell\'app',
  off: 'Non vuoi più ricevere le email del club? Puoi disattivarle dal tuo profilo:',
}

const MAX_LINES = 10

export function clock(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function place(venue: string | null): string {
  return venue && venue.trim() ? ` (${venue.trim()})` : ''
}

export type Notice = {
  subject: string
  text: string
  html: string
  newEvents: string[]
  changes: number[]
  empty: boolean
}

// New events: a weekly series made at once is one line, not twenty.
function newLines(rows: NoticeRow[]): string[] {
  const w = noticeWords
  const lines: string[] = []
  const seen = new Set<string>()
  const sorted = [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  for (const r of sorted) {
    if (r.series_id) {
      if (seen.has(r.series_id)) continue
      seen.add(r.series_id)
      const same = sorted.filter((x) => x.series_id === r.series_id)
      lines.push(
        same.length > 1
          ? `${r.title}, ${w.weekly} ${when(r.starts_at)} (${same.length} ${w.dates})${place(r.venue)}`
          : `${when(r.starts_at)}: ${r.title}${place(r.venue)}`,
      )
    } else {
      lines.push(`${when(r.starts_at)}: ${r.title}${place(r.venue)}`)
    }
  }
  return lines
}

// Changes: the oldest old values against the newest new values of each event, so two changes in a
// row read as one. Something changed back to what it was is not mentioned.
function changeLines(rows: NoticeRow[], hide: Set<string>): { lines: string[]; kinds: Set<'cancelled' | 'restored' | 'changed'> } {
  const w = noticeWords
  const lines: string[] = []
  const kinds = new Set<'cancelled' | 'restored' | 'changed'>()
  const byEvent = new Map<string, NoticeRow[]>()
  for (const r of rows) {
    if (hide.has(r.event_id)) continue
    byEvent.set(r.event_id, [...(byEvent.get(r.event_id) ?? []), r])
  }
  const events = [...byEvent.values()]
    .map((list) => [...list].sort((a, b) => (a.change_id ?? 0) - (b.change_id ?? 0)))
    .sort((a, b) => a[a.length - 1].starts_at.localeCompare(b[b.length - 1].starts_at))
  for (const list of events) {
    const first = list[0]
    const last = list[list.length - 1]
    if (last.cancelled && !first.old_cancelled) {
      lines.push(`${w.cancelled.toUpperCase()}: ${last.title}, ${when(first.old_starts_at ?? last.starts_at)}`)
      kinds.add('cancelled')
      continue
    }
    const parts: string[] = []
    if (first.old_starts_at && first.old_starts_at !== last.starts_at) {
      parts.push(`${w.time}: ${w.was} ${when(first.old_starts_at)}, ${w.now} ${when(last.starts_at)}`)
    } else if (first.old_ends_at && first.old_ends_at !== last.ends_at) {
      parts.push(`${w.end}: ${w.was} ${clock(first.old_ends_at)}, ${w.now} ${clock(last.ends_at)}`)
    }
    if ((first.old_meetup_at ?? null) !== (last.meetup_at ?? null)) {
      parts.push(`${w.meetup}: ${w.was} ${first.old_meetup_at ? clock(first.old_meetup_at) : w.unset}, ${w.now} ${last.meetup_at ? clock(last.meetup_at) : w.unset}`)
    }
    if ((first.old_venue?.trim() || null) !== (last.venue?.trim() || null)) {
      parts.push(`${w.venue}: ${w.was} ${first.old_venue?.trim() || w.unset}, ${w.now} ${last.venue?.trim() || w.unset}`)
    }
    if (first.old_cancelled && !last.cancelled) {
      lines.push(`${w.restored}: ${last.title}, ${when(last.starts_at)}${parts.length ? ` (${parts.join('; ')})` : ''}`)
      kinds.add('restored')
    } else if (parts.length) {
      lines.push(`${last.title}, ${when(last.starts_at)}: ${parts.join('; ')}`)
      kinds.add('changed')
    }
  }
  return { lines, kinds }
}

function cap(lines: string[]): string[] {
  if (lines.length <= MAX_LINES) return lines
  return [...lines.slice(0, MAX_LINES), `${noticeWords.more} ${lines.length - MAX_LINES}`]
}

export function buildEventNotice(firstName: string, rows: NoticeRow[], appUrl: string): Notice {
  const w = noticeWords
  const base = appUrl.replace(/\/+$/, '')
  const news = rows.filter((r) => r.kind === 'new')
  const changed = rows.filter((r) => r.kind === 'changed')
  // An event this person hears about as new is shown as it is now, so its changes are not repeated.
  const hide = new Set(news.map((r) => r.event_id))
  const created = newLines(news)
  const edits = changeLines(changed, hide)
  const empty = created.length === 0 && edits.lines.length === 0

  let subject = w.newMany
  if (created.length === 1 && edits.lines.length === 0) {
    subject = `${news[0].type === 'game' ? w.newGame : w.newTraining}: ${news[0].title}, ${when(news[0].starts_at)}`
  } else if (created.length === 0 && edits.lines.length === 1) {
    const only = [...edits.kinds][0]
    const ev = changed.find((r) => !hide.has(r.event_id))!
    subject = `${only === 'cancelled' ? w.cancelled : only === 'restored' ? w.restored : w.changed}: ${ev.title}`
  }
  subject = subject.replace(/\s+/g, ' ').trim()

  const sections: { head: string; lines: string[] }[] = []
  if (created.length) sections.push({ head: w.introNew, lines: cap(created) })
  if (edits.lines.length) sections.push({ head: w.introChanged, lines: cap(edits.lines) })

  const text = [
    `${w.hello} ${firstName},`,
    '',
    ...sections.flatMap((s) => [s.head, ...s.lines.map((l, i) => `${i + 1}. ${l}`), '']),
    `${w.open}: ${base}/events`,
    '',
    `${w.off} ${base}/profile`,
    '',
  ].join('\n')
  const html =
    `<p>${escapeHtml(w.hello)} ${escapeHtml(firstName)},</p>` +
    sections.map((s) => `<p>${escapeHtml(s.head)}</p><ol>${s.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ol>`).join('') +
    `<p><a href="${escapeHtml(base)}/events">${escapeHtml(w.open)}</a></p>` +
    `<p style="color:#666;font-size:13px">${escapeHtml(w.off)} <a href="${escapeHtml(base)}/profile">${escapeHtml(base)}/profile</a></p>`
  return {
    subject,
    text,
    html,
    newEvents: [...new Set(news.map((r) => r.event_id))],
    changes: changed.map((r) => r.change_id).filter((x): x is number => x !== null),
    empty,
  }
}
