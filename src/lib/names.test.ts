import { describe, expect, it } from 'vitest'
import { nameHasDigits, tidyName } from './names'

describe('names', () => {
  it('raises the initials of a name typed all in lower or upper case', () => {
    expect(tidyName('pansini mattia')).toBe('Pansini Mattia')
    expect(tidyName('  DE   LUCA ')).toBe('De Luca')
    expect(tidyName("d'angelo")).toBe("D'Angelo")
    expect(tidyName('niccolò')).toBe('Niccolò')
  })

  it('keeps the capitals of a name typed with its own mix', () => {
    expect(tidyName('McKenzie')).toBe('McKenzie')
    expect(tidyName('van DerBerg')).toBe('Van DerBerg')
  })

  it('finds digits', () => {
    expect(nameHasDigits('3 Prova')).toBe(true)
    expect(nameHasDigits('Rossi')).toBe(false)
  })
})
