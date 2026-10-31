// Builds the text of a calendar feed (iCalendar, RFC 5545) from a person's events.
// Pure functions, no network: the server function reads the events and calls this.

export type FeedEvent = {
  id: string
  type: 'training' | 'game'
  title: string
  starts_at: string
  ends_at: string
  meetup_at: string | null
  venue: string | null
  rink: string | null
  opponent: string | null
  home_away: 'home' | 'away' | null
  cancelled_at: string | null
}

export const words = {
  calendarName: 'Sgularat Milano',
  cancelled: 'ANNULLATO',
  meetup: 'Ritrovo alle',
  home: 'In casa',
  away: 'In trasferta',
}

// Backslash, semicolon, comma and line breaks must be escaped inside a text value.
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}

// Lines longer than 75 bytes are folded: a line break and one space. Never cut inside a character.
export function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = enc.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74
    if (size + n > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

// 2026-11-05T19:30:00+00:00 becomes 20261105T193000Z
export function utc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function romeClock(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function summary(e: FeedEvent): string {
  const base = e.type === 'game' && e.opponent ? `${e.title}: ${e.opponent}` : e.title
  return e.cancelled_at ? `${words.cancelled}: ${base}` : base
}

export function location(e: FeedEvent): string {
  const parts = [e.rink, e.venue].filter((p): p is string => !!p && p.trim() !== '')
  return [...new Set(parts)].join(', ')
}

export function description(e: FeedEvent): string {
  const lines: string[] = []
  if (e.type === 'game' && e.home_away) lines.push(e.home_away === 'home' ? words.home : words.away)
  if (e.meetup_at) lines.push(`${words.meetup} ${romeClock(e.meetup_at)}`)
  return lines.join('\n')
}

export function buildFeed(events: FeedEvent[], now: Date = new Date()): string {
  const stamp = utc(now.toISOString())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sgularat Milano//Calendario//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(words.calendarName)}`,
    'X-WR-TIMEZONE:Europe/Rome',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${e.id}@sgularat-milano`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${utc(e.starts_at)}`)
    lines.push(`DTEND:${utc(e.ends_at)}`)
    lines.push(`SUMMARY:${escapeText(summary(e))}`)
    const place = location(e)
    if (place) lines.push(`LOCATION:${escapeText(place)}`)
    const desc = description(e)
    if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`)
    lines.push(`STATUS:${e.cancelled_at ? 'CANCELLED' : 'CONFIRMED'}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
