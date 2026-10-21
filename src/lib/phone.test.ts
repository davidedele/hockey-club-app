import { describe, expect, it } from 'vitest'
import { formatPhone, phoneLink } from './phone'

describe('phone numbers', () => {
  it('groups an Italian mobile number as 3, 3 and 4 digits', () => {
    expect(formatPhone('3331234567')).toBe('333 123 4567')
    expect(formatPhone('333 1234567')).toBe('333 123 4567')
    expect(formatPhone('333.123.4567')).toBe('333 123 4567')
  })
  it('keeps the country code in front', () => {
    expect(formatPhone('+393331234567')).toBe('+39 333 123 4567')
    expect(formatPhone('0039 333-123-4567')).toBe('+39 333 123 4567')
  })
  it('leaves other numbers as typed', () => {
    expect(formatPhone('02 1234 5678')).toBe('02 1234 5678')
    expect(formatPhone('+41 79 123  45 67')).toBe('+41 79 123 45 67')
    expect(formatPhone(' 333 123 ')).toBe('333 123')
    expect(formatPhone(null)).toBe('')
  })
  it('builds a link without spaces', () => {
    expect(phoneLink('+39 333 123 4567')).toBe('tel:+393331234567')
    expect(phoneLink('0039 320.555.1234')).toBe('tel:+393205551234')
  })
})
