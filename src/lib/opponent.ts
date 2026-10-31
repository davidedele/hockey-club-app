export interface Meeting {
  starts_at: string
  home_away: string
  score_for: number
  score_against: number
  source: string
}

// Wins, draws and losses of the club in the meetings shown (the score is always the club's first).
export function tally(meetings: Meeting[]): { wins: number; draws: number; losses: number } {
  return {
    wins: meetings.filter((m) => m.score_for > m.score_against).length,
    draws: meetings.filter((m) => m.score_for === m.score_against).length,
    losses: meetings.filter((m) => m.score_for < m.score_against).length,
  }
}
