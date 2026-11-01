import { describe, expect, it } from 'vitest'
import { cleanCode, deadlineParts, validCode } from './mfa'

describe('authenticator code', () => {
  it('accepts six digits, with or without spaces', () => {
    expect(validCode('123456')).toBe(true)
    expect(validCode('123 456')).toBe(true)
    expect(cleanCode(' 123 456 ')).toBe('123456')
  })
  it('refuses anything else', () => {
    for (const bad of ['', '12345', '1234567', '12345a', 'abcdef']) expect(validCode(bad)).toBe(false)
  })
})

describe('deadline of the second step', () => {
  it('names the day and the hour in Italian time', () => {
    // 23:43 UTC on 30 November is 00:43 on 1 December in Italy (winter time).
    expect(deadlineParts('2026-11-30T23:43:00Z')).toEqual({ date: '1 dicembre 2026', time: '00:43' })
  })
  it('follows summer time', () => {
    expect(deadlineParts('2026-07-14T21:30:00Z')).toEqual({ date: '14 luglio 2026', time: '23:30' })
  })
})
