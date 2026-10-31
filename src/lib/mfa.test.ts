import { describe, expect, it } from 'vitest'
import { cleanCode, validCode } from './mfa'

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
