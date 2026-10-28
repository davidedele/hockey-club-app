import { describe, expect, it } from 'vitest'
import { buildFeed, escapeText, fold, location, summary, utc, type FeedEvent } from '../../supabase/functions/calendar-feed/ics'

const base: FeedEvent = {
  id: '11111111-1111-1111-1111-111111111111',
  type: 'training',
  title: 'Allenamento',
  starts_at: '2026-11-05T20:30:00+01:00',
  ends_at: '2026-11-05T22:00:00+01:00',
  meetup_at: null,
  venue: null,
  rink: null,
  opponent: null,
  home_away: null,
  cancelled_at: null,
}
const now = new Date('2026-11-01T10:00:00Z')

describe('calendar feed text', () => {
  it('writes times in UTC', () => {
    expect(utc('2026-11-05T20:30:00+01:00')).toBe('20261105T193000Z')
    expect(utc('2026-07-05T20:30:00+02:00')).toBe('20260705T183000Z')
  })

  it('escapes the characters that have a meaning', () => {
    expect(escapeText('A, B; C\\D\nE')).toBe('A\\, B\\; C\\\\D\\nE')
  })

  it('folds long lines at 75 bytes without cutting a character', () => {
    const line = 'SUMMARY:' + 'è'.repeat(80)
    const folded = fold(line).split('\r\n')
    expect(folded.length).toBeGreaterThan(1)
    for (const [i, part] of folded.entries()) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
      if (i > 0) expect(part.startsWith(' ')).toBe(true)
    }
    expect(folded.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line)
  })

  it('builds one event with CRLF line ends', () => {
    const text = buildFeed([base], now)
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(text).toContain('UID:11111111-1111-1111-1111-111111111111@sgularat-milano')
    expect(text).toContain('DTSTART:20261105T193000Z')
    expect(text).toContain('DTEND:20261105T210000Z')
    expect(text).toContain('DTSTAMP:20261101T100000Z')
    expect(text).toContain('STATUS:CONFIRMED')
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('marks a cancelled event as cancelled', () => {
    const e = { ...base, cancelled_at: '2026-11-02T08:00:00Z' }
    expect(summary(e)).toBe('ANNULLATO: Allenamento')
    expect(buildFeed([e], now)).toContain('STATUS:CANCELLED')
  })

  it('names the opponent of a game, with home or away and the meetup in Italian time', () => {
    const game: FeedEvent = {
      ...base, type: 'game', title: 'Partita', opponent: 'HC Varese', home_away: 'away',
      meetup_at: '2026-11-05T18:30:00+01:00', venue: 'Palasesto',
    }
    const text = buildFeed([game], now)
    expect(text).toContain('SUMMARY:Partita: HC Varese')
    expect(text).toContain('DESCRIPTION:In trasferta\\nRitrovo alle 18:30')
    expect(text).toContain('LOCATION:Palasesto')
  })

  it('puts the rink and the venue in the location once', () => {
    expect(location({ ...base, rink: 'Pista grande', venue: 'Agorà' })).toBe('Pista grande, Agorà')
    expect(location({ ...base, rink: 'Agorà', venue: 'Agorà' })).toBe('Agorà')
    expect(location(base)).toBe('')
  })

  it('shows nothing about people', () => {
    const text = buildFeed([base], now)
    expect(text).not.toMatch(/ATTENDEE|ORGANIZER/)
  })

  it('is a valid empty calendar with no events', () => {
    const text = buildFeed([], now)
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).not.toContain('BEGIN:VEVENT')
  })
})
