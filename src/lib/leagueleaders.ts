import type { LeaguePlayerTotal } from './types'

// The four tables of the championship statistics. Each one ranks the players by one number; the others break a tie.
export type LeaderKind = 'goals' | 'assists' | 'points' | 'penalties'
export const LEADER_KINDS: LeaderKind[] = ['goals', 'assists', 'points', 'penalties']

const key: Record<LeaderKind, (r: LeaguePlayerTotal) => number> = {
  goals: (r) => r.goals,
  assists: (r) => r.assists,
  points: (r) => r.points,
  penalties: (r) => r.penalty_minutes,
}

const ties: Record<LeaderKind, (keyof LeaguePlayerTotal)[]> = {
  goals: ['assists', 'pp_goals'],
  assists: ['goals'],
  points: ['goals'],
  penalties: ['penalties'],
}

export interface RankedPlayer extends LeaguePlayerTotal {
  rank: number
}

// Players with something to show in this table, best first. A tie on the ranked number is a shared place (1, 2, 2, 4);
// the order inside a tie follows the other numbers, then fewer games (the same total in fewer games is better), then the name.
export function rankLeaders(rows: readonly LeaguePlayerTotal[], kind: LeaderKind): RankedPlayer[] {
  const main = key[kind]
  const sorted = rows.filter((r) => main(r) > 0).sort((a, b) => {
    if (main(b) !== main(a)) return main(b) - main(a)
    for (const k of ties[kind]) {
      const d = (b[k] as number) - (a[k] as number)
      if (d !== 0) return d
    }
    if (a.games !== b.games) return a.games - b.games
    return a.player_name.localeCompare(b.player_name, 'it')
  })
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || main(r) !== main(sorted[i - 1])) rank = i + 1
    return { ...r, rank }
  })
}
