// Fantahockey: the picks of one round as the database lists them (a row per pick), grouped by person with the total.
export interface RoundPick {
  user_id: string
  first_name: string
  last_name: string
  player_id: string
  player_first_name: string
  player_last_name: string
  points: number
}

export interface RoundPerson {
  user_id: string
  first_name: string
  last_name: string
  picks: RoundPick[]
  total: number
}

// Best total first; the same total is ordered by surname and name. Each person's picks, best first.
export function groupRound(rows: readonly RoundPick[]): RoundPerson[] {
  const by = new Map<string, RoundPerson>()
  for (const r of rows) {
    const p = by.get(r.user_id) ?? { user_id: r.user_id, first_name: r.first_name, last_name: r.last_name, picks: [], total: 0 }
    p.picks.push(r)
    p.total += r.points
    by.set(r.user_id, p)
  }
  for (const p of by.values()) p.picks.sort((a, b) => b.points - a.points || a.player_last_name.localeCompare(b.player_last_name, 'it'))
  return [...by.values()].sort((a, b) => b.total - a.total || a.last_name.localeCompare(b.last_name, 'it') || a.first_name.localeCompare(b.first_name, 'it'))
}
