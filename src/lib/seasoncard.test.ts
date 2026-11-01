import { describe, expect, it } from 'vitest'
import { cardFacts } from './seasoncard'
import type { MySeason } from './myseason'

const labels = { attendance: 'Presenze', games: 'Partite', goals: 'Gol', assists: 'Assist', mvp: 'Volte MVP', trainings: 'Allenamenti' }
const season = (o: Partial<MySeason>): MySeason => ({ events_total: 20, answered_present: 0, answered_absent: 0, no_answer: 0, on_time: 14, late: 2, excused: 1, unexcused: 1, injured: 0, not_called_up: 2, games: 8, goals: 5, assists: 3, penalty_minutes: 4, mvp: 1, rating_avg: null, rated_games: 0, ...o })

describe('the season card numbers', () => {
  it('uses the same attendance percentage as La mia stagione', () => {
    const f = cardFacts(season({}), labels)
    expect(f[0]).toEqual({ label: 'Presenze', value: '89%' })
    expect(f.map((x) => x.value)).toEqual(['89%', '16', '8', '5', '3', '1'])
  })
  it('shows a dash when the person was called to nothing', () => {
    expect(cardFacts(season({ events_total: 2, not_called_up: 2, on_time: 0, late: 0 }), labels)[0].value).toBe('–')
  })
})
