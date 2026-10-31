import { describe, expect, it } from 'vitest'
import { formatPhone, isPhoneValid, phoneLink } from './phone'

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

describe('isPhoneValid', () => {
  it('accepts mobile numbers, landlines and foreign numbers', () => {
    for (const n of ['333 123 4567', '+39 333 123 4567', '02/1234567', '0039 333 1234567', '+44 20 7946 0958']) expect(isPhoneValid(n)).toBe(true)
  })
  it('accepts an empty number', () => {
    expect(isPhoneValid('')).toBe(true)
    expect(isPhoneValid(null)).toBe(true)
  })
  it('refuses letters, markup, too few and too many digits, a plus in the middle', () => {
    for (const n of ['abc', '333 12x 4567', '<b>3331234567</b>', '12345', '123456789012345678', '333+1234567']) expect(isPhoneValid(n)).toBe(false)
  })
})
