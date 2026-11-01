import { describe, expect, it } from 'vitest'
import { visibleIn } from './groupfilter'

describe('what shows with the group choice and the view', () => {
  it('shows everything in a staff view with all groups chosen', () => {
    expect(visibleIn([3], null, null)).toBe(true)
  })
  it('shows only the chosen group in a staff view', () => {
    expect(visibleIn([1], 1, null)).toBe(true)
    expect(visibleIn([3], 1, null)).toBe(false)
  })
  it('shows only the own groups in the Giocatore view with "I miei gruppi"', () => {
    expect(visibleIn([1], null, [1, 2])).toBe(true)
    expect(visibleIn([2, 3], null, [1, 2])).toBe(true)
    expect(visibleIn([3], null, [1, 2])).toBe(false)
    expect(visibleIn([3], null, [])).toBe(false)
  })
})
