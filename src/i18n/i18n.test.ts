import { describe, expect, it } from 'vitest'
import texts from './it.json'
import { errorText, t } from './index'

describe('t', () => {
  it('fills in values', () => {
    expect(t('invites.status.open', { date: '1/1' })).toBe('Valido fino al 1/1')
  })
})

describe('errorText', () => {
  it('maps database error codes to Italian text', () => {
    expect(errorText({ message: 'invite_invalid' })).toBe(t('error.invite_invalid'))
    expect(errorText({ message: 'names_required' })).toBe(t('error.names_required'))
  })
  it('maps sign in error codes', () => {
    expect(errorText({ code: 'over_email_send_rate_limit', message: 'x' })).toBe(t('error.over_email_send_rate_limit'))
  })
  it('falls back to a generic message', () => {
    expect(errorText({ message: 'boom' })).toContain(t('common.error'))
    expect(errorText(null)).toBe(t('common.error'))
  })
})

describe('text file', () => {
  const keys = Object.keys(texts)
  const files = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

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

  it('has no dashes used as punctuation', () => {
    const values = texts as Record<string, string>
    expect(keys.filter((k) => /[\u2013\u2014]/.test(values[k]))).toEqual([])
  })
})
