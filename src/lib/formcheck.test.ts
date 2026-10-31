import { describe, expect, it } from 'vitest'
import { problemOf, type FieldFacts } from './formcheck'

const base: FieldFacts = { type: 'text', tag: 'input', required: false, value: '', minLength: -1, maxLength: -1, typeMismatch: false, rangeUnderflow: false, rangeOverflow: false }
const key = (f: Partial<FieldFacts>) => problemOf({ ...base, ...f })?.key ?? null

describe('problemOf', () => {
  it('asks for a required empty field with a message that fits the kind', () => {
    expect(key({ required: true })).toBe('check.required')
    expect(key({ required: true, type: 'date' })).toBe('check.requiredDate')
    expect(key({ required: true, type: 'time' })).toBe('check.requiredTime')
    expect(key({ required: true, type: 'email' })).toBe('check.requiredEmail')
    expect(key({ required: true, type: 'password' })).toBe('check.requiredPassword')
    expect(key({ required: true, tag: 'select' })).toBe('check.requiredChoice')
    expect(key({ required: true, type: 'file', files: 0 })).toBe('check.requiredFile')
  })
  it('treats spaces only as empty', () => {
    expect(key({ required: true, value: '   ' })).toBe('check.required')
  })
  it('lets an optional empty field pass, whatever its limits', () => {
    expect(key({ minLength: 8 })).toBeNull()
  })
  it('checks the shortest and longest length', () => {
    expect(problemOf({ ...base, type: 'password', value: 'abc', minLength: 8 })).toEqual({ key: 'check.passwordShort', values: { n: '8' } })
    expect(problemOf({ ...base, value: 'a', minLength: 2 })?.key).toBe('check.tooShort')
    expect(problemOf({ ...base, value: 'abcd', maxLength: 3 })).toEqual({ key: 'check.tooLong', values: { n: '3' } })
    expect(key({ value: 'abc', maxLength: 3, minLength: 3 })).toBeNull()
  })
  it('checks an email address and a number range', () => {
    expect(key({ type: 'email', value: 'x', typeMismatch: true })).toBe('check.badEmail')
    expect(key({ type: 'number', value: '99', rangeOverflow: true })).toBe('check.outOfRange')
  })
  it('requires a ticked box', () => {
    expect(key({ required: true, type: 'checkbox', checked: false })).toBe('check.requiredCheck')
    expect(key({ required: true, type: 'checkbox', checked: true, value: 'on' })).toBeNull()
  })
})
