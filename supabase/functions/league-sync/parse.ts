// Reading the league website's pages. Kept free of anything server specific, so the same code
// can be tried on the real pages in a browser.

export interface LeagueMatch {
  id: number
  championship: string
  startsAt: string
  home: string
  away: string
  homeScore: number | null
  awayScore: number | null
  venue: string | null
}

export interface LeagueChampionship {
  id: number
  name: string
  position: number
}

export interface StandingRow {
  position: number
  team: string
  played: number
  points: number
  goalDiff: number
}

// Minutes that Italian time is ahead of UTC at a moment (60 in winter, 120 in summer).
function offsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - at.getTime()) / 60000)
}

// "24/10/2026" and "18:00" on an Italian clock to a UTC timestamp.
export function italyToIso(date: string, time: string): string {
  const [d, m, y] = date.split('/').map(Number)
  const [h, mi] = time.split(':').map(Number)
  if (![d, m, y, h, mi].every(Number.isFinite)) throw new Error(`data non valida: ${date} ${time}`)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const first = guess - offsetMinutes(new Date(guess)) * 60000
  return new Date(guess - offsetMinutes(new Date(first)) * 60000).toISOString()
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

// The rows of a /matches page. Future matches show 0 : 0, so their scores are left empty.
export function readMatches(doc: Document, played: boolean): LeagueMatch[] {
  const out: LeagueMatch[] = []
  for (const row of Array.from(doc.querySelectorAll('a.match-row'))) {
    const id = Number((row.getAttribute('href') ?? '').match(/\/matches\/(\d+)/)?.[1])
    const teams = Array.from(row.querySelectorAll('.match-row-team-name')).map(text)
    const score = text(row.querySelector('.match-row-score')).match(/(\d+)\s*:\s*(\d+)/)
    const date = text(row.querySelector('.match-row-date-value'))
    const time = text(row.querySelector('.match-row-time-value'))
    if (!id || teams.length !== 2 || !date || !time) continue
    out.push({
      id,
      championship: text(row.querySelector('.match-row-championship')),
      startsAt: italyToIso(date, time),
      home: teams[0],
      away: teams[1],
      homeScore: played && score ? Number(score[1]) : null,
      awayScore: played && score ? Number(score[2]) : null,
      venue: text(row.querySelector('.match-row-location')) || null,
    })
  }
  return out
}

// "Pagina 2 di 10" gives 10; a page without the line has just one page.
export function pageCount(doc: Document): number {
  const m = text(doc.querySelector('.pagination-info')).match(/(\d+)\s*di\s*(\d+)/)
  return m ? Number(m[2]) : 1
}

// The competitions and the current season, from the two selects of the standings page.
export function readChampionships(doc: Document): { seasonId: number | null; championships: LeagueChampionship[] } {
  const season = doc.querySelector('select[aria-label="Seleziona stagione"]')
  const chosen = season?.querySelector('option[selected]') ?? season?.querySelector('option')
  const list = doc.querySelector('select[aria-label="Seleziona campionato"]')
  const championships = Array.from(list?.querySelectorAll('option') ?? [])
    .map((o, i) => ({ id: Number(o.getAttribute('value')), name: text(o), position: i + 1 }))
    .filter((c) => Number.isInteger(c.id) && c.id > 0 && c.name)
  const seasonId = Number(chosen?.getAttribute('value'))
  return { seasonId: Number.isInteger(seasonId) && seasonId > 0 ? seasonId : null, championships }
}

// The standings table: team, games played, points, goal difference, in the order shown.
export function readStandings(doc: Document): StandingRow[] {
  return Array.from(doc.querySelectorAll('table.data-table tbody tr')).flatMap((tr, i) => {
    const cells = Array.from(tr.querySelectorAll('td')).map(text)
    if (cells.length < 5 || !cells[1]) return []
    const [played, points, goalDiff] = [cells[2], cells[3], cells[4]].map((c) => Number(c.replace('+', '')))
    if (![played, points, goalDiff].every(Number.isFinite)) return []
    return [{ position: i + 1, team: cells[1], played, points, goalDiff }]
  })
}
