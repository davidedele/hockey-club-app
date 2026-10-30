import { useState } from 'react'
import { locale } from '../i18n'

export type Dir = 'asc' | 'desc'
export type Cell = string | number | null | undefined

const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })

// Numbers sort as numbers, text the way the language sorts it, and empty values always come last.
export function compare(a: Cell, b: Cell): number {
  const emptyA = a === null || a === undefined || a === ''
  const emptyB = b === null || b === undefined || b === ''
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

export function sortRows<T>(rows: T[], get: (row: T) => Cell, dir: Dir): T[] {
  const sign = dir === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => {
      const a = get(x.row)
      const b = get(y.row)
      const emptyA = a === null || a === undefined || a === ''
      const emptyB = b === null || b === undefined || b === ''
      // An empty value is last whichever way the column is sorted.
      if (emptyA || emptyB) return emptyA === emptyB ? x.index - y.index : emptyA ? 1 : -1
      return compare(a, b) * sign || x.index - y.index
    })
    .map((x) => x.row)
}

export function pageOf<T>(rows: T[], page: number, size: number): T[] {
  return rows.slice((page - 1) * size, page * size)
}

export const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size))

// A column and a direction. Pressing the same column again reverses it.
export function useSort<K extends string>(initial: K, dir: Dir = 'asc') {
  const [state, setState] = useState<{ key: K; dir: Dir }>({ key: initial, dir })
  return {
    ...state,
    toggle: (key: K) => setState((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })),
  }
}

// A CSV that Italian spreadsheets open directly: semicolons, quoted text, and a marker for the encoding.
export function toCsv(rows: Cell[][]): string {
  const quote = (value: Cell) => {
    const text = value === null || value === undefined ? '' : String(value)
    // A cell that starts like a formula is kept as text.
    const safe = /^[=+@\t\r-]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  return '﻿' + rows.map((r) => r.map(quote).join(';')).join('\r\n') + '\r\n'
}

export function downloadCsv(name: string, rows: Cell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name.endsWith('.csv') ? name : `${name}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
