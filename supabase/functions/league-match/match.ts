// Reading one game's page on the league website: teams, score, line-ups, goals and penalties.
// Kept free of anything server specific, so the same code can be tried on the real page in a browser.

export interface Person {
  number: string | null
  name: string
}

export interface RosterGroup {
  role: string
  players: Person[]
}

export interface Goal {
  side: 'home' | 'away'
  time: string
  scorer: Person
  assists: Person[]
  kind: string | null
}

export interface Penalty {
  side: 'home' | 'away'
  time: string
  player: Person
  infraction: string
  minutes: string
  serving: string | null
}

export interface MatchDetail {
  id: number
  status: string
  championship: string
  season: string
  date: string
  time: string
  venue: string
  home: { name: string; score: number | null; roster: RosterGroup[] }
  away: { name: string; score: number | null; roster: RosterGroup[] }
  goals: Goal[]
  penalties: Penalty[]
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()

// "#23 VINCENZO FUSCO" or "#23" plus a name in another cell.
function person(raw: string): Person {
  const m = raw.match(/^#\s*(\d+)\s*(.*)$/)
  return m ? { number: m[1], name: m[2].trim() } : { number: null, name: raw.trim() }
}

function roster(wrapper: Element): RosterGroup[] {
  const out: RosterGroup[] = []
  for (const row of Array.from(wrapper.querySelectorAll('tr'))) {
    if (row.classList.contains('role-header')) {
      out.push({ role: text(row), players: [] })
      continue
    }
    const name = text(row.querySelector('.player-name'))
    if (!name) continue
    if (!out.length) out.push({ role: '', players: [] })
    out[out.length - 1].players.push({ number: text(row.querySelector('.jersey-number')).replace('#', '').trim() || null, name })
  }
  return out
}

// The home and away cells of a row in the goals or penalties table, with what is written in them.
function sides(row: Element): { side: 'home' | 'away'; cell: Element }[] {
  const out: { side: 'home' | 'away'; cell: Element }[] = []
  const home = row.querySelector('td.home-col')
  const away = row.querySelector('td.away-col')
  if (home && home.children.length) out.push({ side: 'home', cell: home })
  if (away && away.children.length) out.push({ side: 'away', cell: away })
  return out
}

export function readMatch(doc: Document, id: number): MatchDetail {
  const scores = Array.from(doc.querySelectorAll('.scoreboard-score .score')).map((s) => Number(text(s)))
  const wrappers = Array.from(doc.querySelectorAll('.roster-table-wrapper'))
  const goals: Goal[] = []
  for (const row of Array.from(doc.querySelectorAll('table.goals-table tbody tr'))) {
    const time = text(row.querySelector('.time-col .time'))
    for (const { side, cell } of sides(row)) {
      const info = cell.querySelector('.goal-info')
      if (!info) continue
      goals.push({
        side,
        time,
        scorer: person(text(Array.from(info.children).find((c) => c.matches('a.person-link')) ?? info.querySelector('a.person-link'))),
        assists: Array.from(info.querySelectorAll('.assists a.person-link')).map((a) => person(text(a))),
        kind: text(info.querySelector('.goal-type')) || null,
      })
    }
  }
  const penalties: Penalty[] = []
  for (const row of Array.from(doc.querySelectorAll('table.penalties-table tbody tr'))) {
    const time = text(row.querySelector('.time-col .time'))
    for (const { side, cell } of sides(row)) {
      const info = cell.querySelector('.penalty-info')
      if (!info) continue
      penalties.push({
        side,
        time,
        player: person(text(info.querySelector('a.person-link'))),
        infraction: text(info.querySelector('.penalty-type')),
        minutes: text(info.querySelector('.penalty-duration')),
        serving: text(info.querySelector('.penalty-serving')).replace(/\s*–\s*/, ' – ') || null,
      })
    }
  }
  const played = scores.length === 2 && scores.every(Number.isFinite) && !/programm|sched/i.test(text(doc.querySelector('.status-badge')))
  return {
    id,
    status: text(doc.querySelector('.status-badge')),
    championship: text(doc.querySelector('.match-info .championship')),
    season: text(doc.querySelector('.match-info .season')),
    date: text(doc.querySelector('.match-datetime .date')),
    time: text(doc.querySelector('.match-datetime .time')),
    venue: text(doc.querySelector('.match-venue')),
    home: { name: text(doc.querySelector('.scoreboard-team.home .team-name')), score: played ? scores[0] : null, roster: wrappers[0] ? roster(wrappers[0]) : [] },
    away: { name: text(doc.querySelector('.scoreboard-team.away .team-name')), score: played ? scores[1] : null, roster: wrappers[1] ? roster(wrappers[1]) : [] },
    goals,
    penalties,
  }
}
