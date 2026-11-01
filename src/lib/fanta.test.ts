import { describe, expect, it } from 'vitest'
import { groupRound, type RoundPick } from './fanta'

const r = (user: string, last: string, player: string, points: number): RoundPick => ({ user_id: user, first_name: 'N', last_name: last, player_id: player, player_first_name: 'P', player_last_name: player, points })

describe('groupRound', () => {
  it('adds the points of the three picks and puts the best first', () => {
    const out = groupRound([r('a', 'Rossi', 'x', 2), r('a', 'Rossi', 'y', 5), r('a', 'Rossi', 'z', 0), r('b', 'Bianchi', 'x', 9)])
    expect(out.map((p) => [p.user_id, p.total])).toEqual([['b', 9], ['a', 7]])
    expect(out[1].picks.map((k) => k.player_id)).toEqual(['y', 'x', 'z'])
  })
  it('orders a tie by surname', () => {
    expect(groupRound([r('a', 'Rossi', 'x', 3), r('b', 'Bianchi', 'x', 3)]).map((p) => p.user_id)).toEqual(['b', 'a'])
  })
  it('is empty for no picks', () => {
    expect(groupRound([])).toEqual([])
  })
})
