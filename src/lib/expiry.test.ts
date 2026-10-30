import { describe, expect, it } from 'vitest'
import { dates, findExpiry, flatten } from './expiry'

const today = '2026-10-28'

describe('reading the expiry date', () => {
  it('takes the date announced by the word scadenza', () => {
    expect(findExpiry('CERTIFICATO DI IDONEITA\nScadenza: 12/03/2027', today)).toBe('2027-03-12')
  })

  it('ignores the date of birth and the day it was issued', () => {
    const text = 'Nato il 04/07/1994 a Trento. Rilasciato il 12/03/2026. Valido fino al 12/03/2027.'
    expect(findExpiry(text, today)).toBe('2027-03-12')
  })

  it('does not let a later date elsewhere win over the announced one', () => {
    const text = 'Scadenza 01/02/2027 ... prossimo controllo consigliato 01/09/2027'
    expect(findExpiry(text, today)).toBe('2027-02-01')
  })

  it('takes the furthest date ahead when nothing announces it', () => {
    expect(findExpiry('12/03/2026 e poi 09/09/2027', today)).toBe('2027-09-09')
  })

  it('reads dots, dashes and a short year', () => {
    expect(findExpiry('scadenza 09.09.2027', today)).toBe('2027-09-09')
    expect(findExpiry('scadenza 09-09-27', today)).toBe('2027-09-09')
    expect(findExpiry('scadenza 2027-09-09', today)).toBe('2027-09-09')
  })

  it('survives the accents and the spacing the reading adds', () => {
    expect(findExpiry('VALIDITÀ   FINO   AL   09 / 09 / 2027', today)).toBe('2027-09-09')
  })

  it('refuses a day that does not exist', () => {
    expect(dates(flatten('31/02/2027'))).toEqual([])
    expect(findExpiry('scadenza 31/02/2027', today)).toBe(null)
  })

  it('gives nothing back when there is no date, or only old ones', () => {
    expect(findExpiry('Nessuna data qui', today)).toBe(null)
    expect(findExpiry('Nato il 04/07/1994', today)).toBe(null)
  })

  it('accepts a certificate that runs out today', () => {
    expect(findExpiry('scadenza 28/10/2026', today)).toBe('2026-10-28')
  })

  it('reads a date written with the month in words', () => {
    expect(findExpiry('Il certificato è valido fino al 30 gennaio 2027', today)).toBe('2027-01-30')
    expect(findExpiry('scadenza 5 mar. 2027', today)).toBe('2027-03-05')
  })

  it('fixes an O or an l that the reading took for a digit', () => {
    expect(findExpiry('Scadenza: 3O/Ol/2027', today)).toBe('2027-01-30')
    expect(findExpiry('scadenza l2/03/2O27', today)).toBe('2027-03-12')
  })
})
