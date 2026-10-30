import { describe, expect, it } from 'vitest'
import { compare, pageCount, pageOf, sortRows, toCsv } from './table'

describe('compare', () => {
  it('sorts numbers as numbers', () => {
    expect([10, 9, 100].sort(compare)).toEqual([9, 10, 100])
  })
  it('sorts text the way Italian does and numbers inside text in order', () => {
    expect(['Ghio', 'Àlvaro', 'Zeta', 'Barozzi'].sort(compare)).toEqual(['Àlvaro', 'Barozzi', 'Ghio', 'Zeta'])
    expect(['Squadra 10', 'Squadra 2'].sort(compare)).toEqual(['Squadra 2', 'Squadra 10'])
  })
  it('puts empty values last', () => {
    expect([null, 'b', '', 'a', undefined].sort(compare)).toEqual(['a', 'b', null, '', undefined])
  })
})

describe('sortRows', () => {
  const rows = [{ n: 'b', v: 2 }, { n: 'a', v: 3 }, { n: 'c', v: null }, { n: 'd', v: 2 }]
  it('sorts ascending and descending', () => {
    expect(sortRows(rows, (r) => r.n, 'asc').map((r) => r.n)).toEqual(['a', 'b', 'c', 'd'])
    expect(sortRows(rows, (r) => r.n, 'desc').map((r) => r.n)).toEqual(['d', 'c', 'b', 'a'])
  })
  it('keeps empty values last in both directions', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.n)).toEqual(['b', 'd', 'a', 'c'])
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.n)).toEqual(['a', 'b', 'd', 'c'])
  })
  it('keeps the order of equal values and leaves the input alone', () => {
    const copy = [...rows]
    sortRows(rows, (r) => r.v, 'asc')
    expect(rows).toEqual(copy)
  })
})

describe('paging', () => {
  it('cuts a page', () => {
    const all = Array.from({ length: 53 }, (_, i) => i)
    expect(pageOf(all, 1, 25)).toHaveLength(25)
    expect(pageOf(all, 3, 25)).toEqual([50, 51, 52])
    expect(pageOf(all, 4, 25)).toEqual([])
  })
  it('counts pages, at least one', () => {
    expect(pageCount(0, 25)).toBe(1)
    expect(pageCount(25, 25)).toBe(1)
    expect(pageCount(26, 25)).toBe(2)
  })
})

describe('toCsv', () => {
  it('uses semicolons, a marker for the encoding and line ends for spreadsheets', () => {
    expect(toCsv([['a', 'b'], [1, null]])).toBe('﻿a;b\r\n1;\r\n')
  })
  it('quotes text with separators, quotes and line breaks', () => {
    expect(toCsv([['x;y', 'say "hi"', 'two\nlines']])).toBe('﻿"x;y";"say ""hi""";"two\nlines"\r\n')
  })
  it('keeps a cell that looks like a formula as text', () => {
    expect(toCsv([['=SUM(A1)', '+39 333', '-5', '@x']])).toBe("﻿'=SUM(A1);'+39 333;-5;'@x\r\n")
  })
})
