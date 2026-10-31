import { describe, expect, it } from 'vitest'
import { tally, type Meeting } from './opponent'

const m = (a: number, b: number): Meeting => ({ starts_at: '2026-01-01T10:00:00Z', home_away: 'home', score_for: a, score_against: b, source: 'club' })

describe('tally', () => {
  it('counts wins, draws and losses from the club side', () => {
    expect(tally([m(5, 2), m(3, 3), m(1, 4), m(2, 0)])).toEqual({ wins: 2, draws: 1, losses: 1 })
  })
  it('is zero without meetings', () => {
    expect(tally([])).toEqual({ wins: 0, draws: 0, losses: 0 })
  })
})
