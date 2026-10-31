import { describe, expect, it } from 'vitest'
import { readableInk } from './colour'

describe('readableInk', () => {
  it('uses white on dark colours', () => {
    expect(readableInk('#000000')).toBe('#ffffff')
    expect(readableInk('#0b4ea2')).toBe('#ffffff')
    expect(readableInk('#111111')).toBe('#ffffff')
  })
  it('uses dark text on light colours', () => {
    expect(readableInk('#fffb00')).toBe('#111111')
    expect(readableInk('#ffd400')).toBe('#111111')
    expect(readableInk('#ffffff')).toBe('#111111')
  })
  it('falls back to white when the colour is missing or not a hex colour', () => {
    expect(readableInk(null)).toBe('#ffffff')
    expect(readableInk('red')).toBe('#ffffff')
  })
})
