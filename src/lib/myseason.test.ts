import { describe, expect, it } from 'vitest'
import { attendancePercent, isEmptySeason, type MySeason } from './myseason'

const base: MySeason = { events_total: 0, answered_present: 0, answered_absent: 0, no_answer: 0, on_time: 0, late: 0, excused: 0, unexcused: 0, injured: 0, not_called_up: 0, games: 0, goals: 0, assists: 0, penalty_minutes: 0, mvp: 0, rating_avg: null, rated_games: 0 }

describe('my season', () => {
  it('counts the share of the events the person was called to, like the Presenze page', () => {
    expect(attendancePercent({ ...base, events_total: 10, not_called_up: 2, on_time: 5, late: 1 })).toBe(75)
    expect(attendancePercent({ ...base, events_total: 3, not_called_up: 3 })).toBeNull()
    expect(attendancePercent(base)).toBeNull()
  })
  it('knows an empty season', () => {
    expect(isEmptySeason(base)).toBe(true)
    expect(isEmptySeason({ ...base, events_total: 1 })).toBe(false)
    expect(isEmptySeason({ ...base, goals: 1 })).toBe(false)
  })
})
