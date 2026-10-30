import { describe, expect, it } from 'vitest'
import { differenceBars, outcome, summarize, type Result } from './teamstats'

let n = 0
const game = (day: number, f: number, a: number): Result => ({
  event_id: `e${n++}`,
  starts_at: `2026-10-${String(day).padStart(2, '0')}T18:00:00Z`,
  opponent: 'X',
  home_away: 'home',
  score_for: f,
  score_against: a,
})

describe('outcome', () => {
  it('tells a win, a draw and a loss', () => {
    expect(outcome({ score_for: 3, score_against: 2 })).toBe('W')
    expect(outcome({ score_for: 2, score_against: 2 })).toBe('D')
    expect(outcome({ score_for: 0, score_against: 1 })).toBe('L')
  })
})

describe('summarize', () => {
  it('counts nothing for no games', () => {
    const s = summarize([])
    expect(s).toMatchObject({ games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, avgFor: 0, avgAgainst: 0 })
    expect(s.last).toEqual([])
    expect(s.bestWin).toEqual({ length: 0, endedAt: null })
  })

  it('counts results and goals and averages to one decimal', () => {
    const s = summarize([game(1, 4, 2), game(2, 1, 1), game(3, 0, 3)])
    expect(s).toMatchObject({ games: 3, wins: 1, draws: 1, losses: 1, goalsFor: 5, goalsAgainst: 6, avgFor: 1.7, avgAgainst: 2 })
  })

  it('does not depend on the order the games come in', () => {
    const a = summarize([game(3, 0, 3), game(1, 4, 2), game(2, 1, 1)])
    expect(a.last.map((x) => x.outcome)).toEqual(['W', 'D', 'L'])
  })

  it('gives the last games, oldest first, at most five', () => {
    const results = [1, 2, 3, 4, 5, 6, 7].map((d) => game(d, d % 2, 0))
    const s = summarize(results)
    expect(s.last).toHaveLength(5)
    expect(s.last[0].result.starts_at).toContain('-03T')
    expect(s.last[4].result.starts_at).toContain('-07T')
  })

  it('finds the streaks', () => {
    // W W D L L L W : wins 2, unbeaten 3, losses 3, winless 4 (D L L L)
    const s = summarize([game(1, 1, 0), game(2, 2, 0), game(3, 1, 1), game(4, 0, 1), game(5, 0, 2), game(6, 0, 3), game(7, 1, 0)])
    expect(s.bestWin.length).toBe(2)
    expect(s.bestWin.endedAt).toContain('-02T')
    expect(s.bestUnbeaten.length).toBe(3)
    expect(s.worstLoss.length).toBe(3)
    expect(s.worstLoss.endedAt).toContain('-06T')
    expect(s.worstWinless.length).toBe(4)
  })

  it('has no streak of a kind that did not happen', () => {
    const s = summarize([game(1, 0, 1), game(2, 0, 2)])
    expect(s.bestWin).toEqual({ length: 0, endedAt: null })
    expect(s.bestUnbeaten).toEqual({ length: 0, endedAt: null })
    expect(s.worstLoss.length).toBe(2)
  })

  it('takes the later of two equal streaks', () => {
    const s = summarize([game(1, 1, 0), game(2, 0, 1), game(3, 1, 0)])
    expect(s.bestWin.length).toBe(1)
    expect(s.bestWin.endedAt).toContain('-03T')
  })
})

describe('differenceBars', () => {
  it('always shows three on each side of zero', () => {
    const bars = differenceBars([])
    expect(bars.map((b) => b.diff)).toEqual([-3, -2, -1, 0, 1, 2, 3])
    expect(bars.every((b) => b.count === 0)).toBe(true)
  })
  it('counts the games of each difference and widens for a big one', () => {
    const bars = differenceBars([game(1, 4, 2), game(2, 1, 1), game(3, 0, 3), game(4, 8, 1), game(5, 3, 1)])
    expect(bars.find((b) => b.diff === 2)?.count).toBe(2)
    expect(bars.find((b) => b.diff === 0)?.count).toBe(1)
    expect(bars.find((b) => b.diff === -3)?.count).toBe(1)
    expect(bars[bars.length - 1]).toEqual({ diff: 7, count: 1 })
    expect(bars.map((b) => b.diff)).toEqual([-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7])
  })
})
