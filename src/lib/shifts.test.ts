import { describe, expect, it } from 'vitest'
import { clock, emptyShifts, putOn, shiftMs, stop, totalMs } from './shifts'

describe('shifts', () => {
  it('adds the time of a line each time it comes off', () => {
    let s = putOn(emptyShifts(), 'f1', 0)
    s = putOn(s, 'f2', 40_000)
    s = putOn(s, 'f1', 100_000)
    expect(totalMs(s, 'f1', 130_000)).toBe(40_000 + 30_000)
    expect(totalMs(s, 'f2', 130_000)).toBe(60_000)
    expect(shiftMs(s, 'f1', 130_000)).toBe(30_000)
    expect(shiftMs(s, 'f2', 130_000)).toBe(0)
  })
  it('does nothing when the line already on is tapped', () => {
    const s = putOn(emptyShifts(), 'f1', 0)
    expect(putOn(s, 'f1', 5000)).toBe(s)
  })
  it('stops the clock and keeps the totals', () => {
    const s = stop(putOn(emptyShifts(), 'd1', 1000), 31_000)
    expect(s.onIce).toBeNull()
    expect(totalMs(s, 'd1', 99_000)).toBe(30_000)
  })
  it('writes minutes and seconds', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(65_900)).toBe('1:05')
  })
})
