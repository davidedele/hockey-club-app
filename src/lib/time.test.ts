import { describe, expect, it } from 'vitest'
import { addDays, dayKey, endIso, formatTime, isoToItaly, italyToIso, meetupIso, shiftClock, dayParts } from './time'

describe('Italian time', () => {
  it('converts summer time to UTC', () => {
    expect(italyToIso('2026-10-22', '22:30')).toBe('2026-10-22T20:30:00.000Z')
  })
  it('converts winter time to UTC', () => {
    expect(italyToIso('2026-10-29', '22:30')).toBe('2026-10-29T21:30:00.000Z')
  })
  it('keeps the same clock time on both sides of the change', () => {
    expect(isoToItaly(italyToIso('2026-10-22', '22:30'))).toEqual({ date: '2026-10-22', time: '22:30' })
    expect(isoToItaly(italyToIso('2026-10-29', '22:30'))).toEqual({ date: '2026-10-29', time: '22:30' })
    expect(isoToItaly(italyToIso('2027-03-28', '12:00'))).toEqual({ date: '2027-03-28', time: '12:00' })
  })
  it('puts a late evening time on the right calendar day', () => {
    expect(dayKey('2026-10-22T22:30:00.000Z')).toBe('2026-10-23')
    expect(formatTime('2026-10-22T20:30:00.000Z')).toBe('22:30')
  })
  it('adds days across a month end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('moves an end time after midnight to the next day', () => {
    expect(endIso('2026-10-22', '22:30', '23:55')).toBe(italyToIso('2026-10-22', '23:55'))
    expect(endIso('2026-10-22', '23:00', '00:30')).toBe(italyToIso('2026-10-23', '00:30'))
  })
  it('moves a meetup after the start to the day before', () => {
    expect(meetupIso('2026-10-22', '22:30', '21:30')).toBe(italyToIso('2026-10-22', '21:30'))
    expect(meetupIso('2026-10-22', '00:15', '23:15')).toBe(italyToIso('2026-10-21', '23:15'))
  })
  it('shifts a clock time past midnight in both directions', () => {
    expect(shiftClock('22:30', 90)).toBe('00:00')
    expect(shiftClock('22:30', -60)).toBe('21:30')
    expect(shiftClock('00:30', -60)).toBe('23:30')
  })
  it('gives the date column of a day in Italian time', () => {
    expect(dayParts('2026-10-22T20:30:00.000Z')).toEqual({ num: '22', dow: 'gio', mon: 'ott' })
    expect(dayParts('2026-10-22T22:30:00.000Z')).toEqual({ num: '23', dow: 'ven', mon: 'ott' })
  })
})
