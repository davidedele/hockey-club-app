import { describe, expect, it } from 'vitest'
import { closedReason } from './predictions'
import { t } from '../i18n'

describe('why a guess is refused', () => {
  it('names the groups when the person is in none of the game groups', () => {
    expect(closedReason({ cancelled: false, started: false, inGroups: false })).toBe('predict.closedGroups')
    expect(t('predict.closedGroups')).toBe('Non fai parte dei gruppi di questa partita.')
  })
  it('names a cancelled or started game first', () => {
    expect(closedReason({ cancelled: true, started: false, inGroups: false })).toBe('predict.closedCancelled')
    expect(closedReason({ cancelled: false, started: true, inGroups: true })).toBe('predict.closedStarted')
  })
  it('falls back to a plain Italian sentence, never the code', () => {
    const key = closedReason({ cancelled: false, started: false, inGroups: true })
    expect(key).toBe('error.prediction_closed')
    expect(t(key)).not.toMatch(/prediction_closed/)
  })
})
