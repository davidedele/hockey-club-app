import { describe, expect, it } from 'vitest'
import { dates, findIssueDate, flatten } from './issued'

const today = '2026-10-28'

describe('reading the date of issue', () => {
  it('takes the day of the visit from a certificate that states only a validity of one year', () => {
    const text = `CERTIFICATO DI IDONEITA ALLA PRATICA SPORTIVA AGONISTICA
Si certifica che il sig. ROSSI MARIO nato a Milano il 04/07/1994 residente a Milano
ha effettuato la visita medica in data 12/03/2026 per lo sport HOCKEY SU GHIACCIO
ed e risultato IDONEO. Validita: 1 anno
Il medico  Dott. Verdi  Milano, 12/03/2026`
    expect(findIssueDate(text, today)).toBe('2026-03-12')
  })

  it('looks next to the words data, visita, rilasciato and emesso', () => {
    expect(findIssueDate('Data visita: 05/09/2026', today)).toBe('2026-09-05')
    expect(findIssueDate('Rilasciato il 05-09-2026 a Trento', today)).toBe('2026-09-05')
    expect(findIssueDate('Certificato emesso il 5 settembre 2026', today)).toBe('2026-09-05')
    expect(findIssueDate('DATA DI RILASCIO 05.09.26', today)).toBe('2026-09-05')
    expect(findIssueDate('Visita del 2026-09-05', today)).toBe('2026-09-05')
  })

  it('ignores the date of birth, which is not plausible for a certificate', () => {
    expect(findIssueDate('Nato il 04/07/1994. Data visita 12/03/2026.', today)).toBe('2026-03-12')
  })

  it('does not take an end date for the date of issue', () => {
    expect(findIssueDate('Rilasciato il 12/03/2025. Scadenza: 12/03/2026', today)).toBe('2025-03-12')
    expect(findIssueDate('Valido fino al 12/03/2026', today)).toBeNull()
  })

  it('leaves out dates in the future and dates older than three years', () => {
    expect(findIssueDate('Data visita 12/03/2027', today)).toBeNull()
    expect(findIssueDate('Data visita 12/03/2022', today)).toBeNull()
    expect(findIssueDate('Data visita 12/12/2023', today)).toBe('2023-12-12')
  })

  it('takes a lone plausible date even when nothing announces it', () => {
    expect(findIssueDate('Mario Rossi 04/07/1994 idoneo 12/03/2026', today)).toBe('2026-03-12')
  })

  it('does not guess between several unannounced dates', () => {
    expect(findIssueDate('12/03/2026 e anche 15/06/2026', today)).toBeNull()
  })

  it('does not take the letters of another word for a keyword', () => {
    expect(findIssueDate('validata il 03/04/2025 e 05/05/2026', today)).toBeNull()
  })

  it('finds nothing in a text with no date', () => {
    expect(findIssueDate('Certificato di idoneita sportiva', today)).toBeNull()
    expect(findIssueDate('', today)).toBeNull()
  })

  it('repairs digits the reader mistakes for letters inside a date', () => {
    expect(findIssueDate('Data visita: 1O/O3/2O26', today)).toBe('2026-03-10')
  })
})

describe('dates', () => {
  it('finds every notation in order', () => {
    const found = dates(flatten('a 12/03/2026 b 2026-04-01 c 3 maggio 2026')).map((d) => d.value)
    expect(found).toEqual(['2026-03-12', '2026-04-01', '2026-05-03'])
  })
  it('refuses days that do not exist', () => {
    expect(dates(flatten('31/02/2026'))).toEqual([])
  })
})
