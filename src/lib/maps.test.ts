import { describe, expect, it } from 'vitest'
import { isApple, mapsUrl, placeQuery } from './maps'

describe('maps link', () => {
  it('uses Apple Maps on an iPhone and Google Maps elsewhere', () => {
    expect(mapsUrl('Via Roma 1, Milano', true)).toBe('https://maps.apple.com/?q=Via%20Roma%201%2C%20Milano')
    expect(mapsUrl('Via Roma 1, Milano', false)).toBe('https://www.google.com/maps/search/?api=1&query=Via%20Roma%201%2C%20Milano')
  })
  it('knows an iPhone and an iPad that calls itself a Mac', () => {
    expect(isApple('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true)
    expect(isApple('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isApple('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isApple('Mozilla/5.0 (Linux; Android 14)', 5)).toBe(false)
  })
  it('prefers the address, then the rink name, then the free text venue', () => {
    expect(placeQuery({ address: 'Via Roma 1', rink: 'Grande', venue: 'Agorà' })).toBe('Via Roma 1')
    expect(placeQuery({ address: null, rink: 'Grande', venue: 'Agorà' })).toBe('Grande')
    expect(placeQuery({ address: null, rink: null, venue: ' Agorà ' })).toBe('Agorà')
    expect(placeQuery({})).toBe('')
  })
  it('escapes characters that would break the link', () => {
    expect(mapsUrl('A&B #1', false)).toContain('A%26B%20%231')
  })
})
