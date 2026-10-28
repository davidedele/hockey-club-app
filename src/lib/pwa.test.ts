import { describe, expect, it } from 'vitest'
import { findScriptSrc } from './pwa'

describe('finding the app script', () => {
  it('reads the built script name from the app page', () => {
    const html = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-3fa9c1.js"></script></head><body></body></html>'
    expect(findScriptSrc(html)).toBe('/assets/index-3fa9c1.js')
  })

  it('gives nothing for the development page', () => {
    expect(findScriptSrc('<script type="module" src="/src/main.tsx"></script>')).toBeNull()
  })

  it('tells two versions apart', () => {
    const a = '<script type="module" src="/assets/index-aaa111.js"></script>'
    const b = '<script type="module" src="/assets/index-bbb222.js"></script>'
    expect(findScriptSrc(a)).not.toBe(findScriptSrc(b))
  })

  it('ignores other scripts', () => {
    expect(findScriptSrc('<script src="https://example.com/x.js"></script>')).toBeNull()
  })
})
