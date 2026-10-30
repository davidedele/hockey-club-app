// Team numbers worked out from the final scores of a season's games.

export interface Result {
  event_id: string
  starts_at: string
  opponent: string | null
  home_away: string | null
  score_for: number
  score_against: number
}

export type Outcome = 'W' | 'D' | 'L'

export const outcome = (r: Pick<Result, 'score_for' | 'score_against'>): Outcome =>
  r.score_for > r.score_against ? 'W' : r.score_for === r.score_against ? 'D' : 'L'

export interface Streak {
  length: number
  // The day of the last game of the streak, as an ISO moment, or null when there is no streak.
  endedAt: string | null
}

export interface TeamSummary {
  games: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  avgFor: number
  avgAgainst: number
  last: { outcome: Outcome; result: Result }[]
  bestWin: Streak
  bestUnbeaten: Streak
  worstLoss: Streak
  worstWinless: Streak
}

const byTime = (a: Result, b: Result) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : 0)

// The longest run of games for which `counts` is true. A longer run wins, and of two equal runs the later one.
function longest(sorted: Result[], counts: (o: Outcome) => boolean): Streak {
  let best: Streak = { length: 0, endedAt: null }
  let run = 0
  for (const r of sorted) {
    if (counts(outcome(r))) {
      run += 1
      if (run >= best.length) best = { length: run, endedAt: r.starts_at }
    } else {
      run = 0
    }
  }
  return best
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10

export function summarize(results: Result[], lastCount = 5): TeamSummary {
  const sorted = [...results].sort(byTime)
  const wins = sorted.filter((r) => outcome(r) === 'W').length
  const draws = sorted.filter((r) => outcome(r) === 'D').length
  const goalsFor = sorted.reduce((sum, r) => sum + r.score_for, 0)
  const goalsAgainst = sorted.reduce((sum, r) => sum + r.score_against, 0)
  const games = sorted.length
  return {
    games,
    wins,
    draws,
    losses: games - wins - draws,
    goalsFor,
    goalsAgainst,
    avgFor: games ? oneDecimal(goalsFor / games) : 0,
    avgAgainst: games ? oneDecimal(goalsAgainst / games) : 0,
    last: sorted.slice(-lastCount).map((result) => ({ outcome: outcome(result), result })),
    bestWin: longest(sorted, (o) => o === 'W'),
    bestUnbeaten: longest(sorted, (o) => o !== 'L'),
    worstLoss: longest(sorted, (o) => o === 'L'),
    worstWinless: longest(sorted, (o) => o !== 'W'),
  }
}

// How many games ended with each goal difference, from the worst to the best, with at least three on each side of a draw.
export function differenceBars(results: Result[], reach = 3): { diff: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const r of results) {
    const d = r.score_for - r.score_against
    counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  const keys = [...counts.keys()]
  const low = Math.min(-reach, ...keys)
  const high = Math.max(reach, ...keys)
  return Array.from({ length: high - low + 1 }, (_, i) => ({ diff: low + i, count: counts.get(low + i) ?? 0 }))
}
