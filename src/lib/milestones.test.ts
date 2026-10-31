import { describe, expect, it } from 'vitest'
import { milestoneKey } from './milestones'

describe('milestoneKey', () => {
  it('uses a text of its own for the first goal, assist and game', () => {
    expect(milestoneKey({ kind: 'goals', level: 1 })).toEqual({ key: 'milestone.goalsFirst', n: '1' })
    expect(milestoneKey({ kind: 'games', level: 1 })?.key).toBe('milestone.gamesFirst')
  })
  it('uses the number for the others', () => {
    expect(milestoneKey({ kind: 'goals', level: 10 })).toEqual({ key: 'milestone.goals', n: '10' })
    expect(milestoneKey({ kind: 'streak', level: 10 })).toEqual({ key: 'milestone.streak', n: '10' })
  })
  it('ignores a kind it does not know', () => {
    expect(milestoneKey({ kind: 'other', level: 1 })).toBeNull()
  })
})
