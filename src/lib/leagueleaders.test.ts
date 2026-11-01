import { describe, expect, it } from 'vitest'
import { rankLeaders } from './leagueleaders'
import type { LeaguePlayerTotal } from './types'

const p = (name: string, o: Partial<LeaguePlayerTotal> = {}): LeaguePlayerTotal => ({
  team: 'HC X', player_name: name, player_number: null, games: 5, goals: 0, assists: 0, points: 0, pp_goals: 0, penalties: 0, penalty_minutes: 0, ...o,
})

describe('rankLeaders', () => {
  const rows = [
    p('Anna', { goals: 4, assists: 1, points: 5, pp_goals: 1 }),
    p('Berta', { goals: 4, assists: 3, points: 7 }),
    p('Carla', { goals: 2, assists: 6, points: 8, games: 3 }),
    p('Dora', { goals: 4, assists: 3, points: 7, games: 2 }),
    p('Ede', { penalties: 2, penalty_minutes: 4 }),
    p('Fede'),
  ]
  it('ranks the scorers, ties shared and broken by assists', () => {
    const r = rankLeaders(rows, 'goals')
    expect(r.map((x) => x.player_name)).toEqual(['Dora', 'Berta', 'Anna', 'Carla'])
    expect(r.map((x) => x.rank)).toEqual([1, 1, 1, 4])
  })
  it('leaves out players with nothing in that table', () => {
    expect(rankLeaders(rows, 'assists').map((x) => x.player_name)).toEqual(['Carla', 'Dora', 'Berta', 'Anna'])
    expect(rankLeaders(rows, 'penalties').map((x) => x.player_name)).toEqual(['Ede'])
    expect(rankLeaders([p('Fede')], 'points')).toEqual([])
  })
  it('ranks points', () => {
    expect(rankLeaders(rows, 'points').map((x) => [x.player_name, x.rank])).toEqual([['Carla', 1], ['Dora', 2], ['Berta', 2], ['Anna', 4]])
  })
  it('does not change the rows it was given', () => {
    const copy = [...rows]
    rankLeaders(rows, 'goals')
    expect(rows).toEqual(copy)
  })
})
