import { describe, expect, it } from 'vitest'
import { prettyName } from './league'

describe('league names', () => {
  it('writes team names in normal case and keeps HC', () => {
    expect(prettyName('HC VARESE KILLER BEES')).toBe('HC Varese Killer Bees')
    expect(prettyName('PALASESTO')).toBe('Palasesto')
    expect(prettyName('DIAVOLI  BIANCHI')).toBe('Diavoli Bianchi')
    expect(prettyName('COPPA LHL CAT A')).toBe('Coppa LHL Cat A')
    expect(prettyName('COPPA DELLE REGIONI')).toBe('Coppa delle Regioni')
  })
})
