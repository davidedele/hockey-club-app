import { describe, expect, it } from 'vitest'
import en from './en.json'
import texts from './it.json'
import { currentLanguage, errorText, t } from './index'

describe('t', () => {
  it('fills in values', () => {
    expect(t('invites.status.open', { date: '1/1' })).toBe('Valido fino al 1/1')
  })
})

describe('language', () => {
  it('speaks Italian until somebody chooses otherwise', () => {
    expect(currentLanguage()).toBe('it')
  })
})

describe('errorText', () => {
  it('maps database error codes to the text of the language in use', () => {
    expect(errorText({ message: 'invite_invalid' })).toBe(t('error.invite_invalid'))
    expect(errorText({ message: 'names_required' })).toBe(t('error.names_required'))
  })
  it('maps sign in error codes', () => {
    expect(errorText({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(t('error.over_email_send_rate_limit'))
  })
  it('explains a refused time or date', () => {
    expect(errorText({ code: '23514', message: 'new row violates check constraint "events_check"' })).toBe(t('error.check_violation'))
  })
  it('explains refused goalie numbers', () => {
    expect(errorText({ code: '23514', message: 'new row for relation "game_stats" violates check constraint "game_stats_check"' })).toBe(t('error.stats_check'))
  })
  it('maps the vote errors', () => {
    expect(errorText({ message: 'already_voted' })).toBe(t('error.already_voted'))
    expect(errorText({ message: 'game_not_over' })).toBe(t('error.game_not_over'))
  })
  it('falls back to a generic message', () => {
    expect(errorText({ message: 'boom' })).toContain(t('common.error'))
    expect(errorText(null)).toBe(t('common.error'))
  })
})

describe('text files', () => {
  const keys = Object.keys(texts)
  const italian = texts as Record<string, string>
  const english = en as Record<string, string>
  const files = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const holes = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort()

  it('has every text key used in the code', () => {
    const missing: string[] = []
    for (const [file, code] of Object.entries(files)) {
      if (file.endsWith('.test.ts')) continue
      for (const m of code.matchAll(/\bt\('([\w.]+)'/g)) {
        if (!keys.includes(m[1])) missing.push(`${file}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('says the same things in both languages', () => {
    expect(Object.keys(english).sort()).toEqual([...keys].sort())
  })

  it('keeps the same values inside the texts of both languages', () => {
    expect(keys.filter((k) => String(holes(italian[k])) !== String(holes(english[k])))).toEqual([])
  })

  it('leaves no text empty in either language', () => {
    expect(keys.filter((k) => !italian[k].trim() || !english[k].trim())).toEqual([])
  })

  it('has no dashes used as punctuation', () => {
    const bad = keys.filter((k) => /[–—]/.test(italian[k]) || /[–—]/.test(english[k]))
    expect(bad).toEqual([])
  })
})
