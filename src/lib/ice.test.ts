import { describe, expect, it } from 'vitest'
import { NO_RINK, centsToEuro, cost, euroToCents, hoursOf, iceCsv, iceMonths, sumOf, totals, type IceEvent } from './ice'

const ev = (id: string, start: string, end: string, rink: number | null, cancelled = false): IceEvent => ({
  id, title: id, type: 'training', starts_at: start, ends_at: end, rink_id: rink, cancelled_at: cancelled ? '2026-10-01T00:00:00Z' : null,
})

describe('ice hours', () => {
  it('counts the event times as the booked ice', () => {
    expect(hoursOf(ev('a', '2026-11-03T13:00:00Z', '2026-11-03T14:30:00Z', 1))).toBe(1.5)
  })

  it('groups by month on the Italian calendar', () => {
    // 23:30 UTC on 31 October is already 1 November in Italy.
    const months = iceMonths([
      ev('a', '2026-10-31T23:30:00Z', '2026-11-01T00:30:00Z', 1),
      ev('b', '2026-10-20T19:00:00Z', '2026-10-20T20:00:00Z', 1),
    ])
    expect(months.map((m) => m.month)).toEqual(['2026-10', '2026-11'])
    expect(months[1].used).toEqual({ '1': 1 })
  })

  it('keeps cancelled hours apart, and events with no rink under their own key', () => {
    const months = iceMonths([
      ev('a', '2026-11-03T19:00:00Z', '2026-11-03T20:30:00Z', 1),
      ev('b', '2026-11-05T19:00:00Z', '2026-11-05T20:00:00Z', 2, true),
      ev('c', '2026-11-07T19:00:00Z', '2026-11-07T20:00:00Z', null),
    ])
    expect(months[0].used).toEqual({ '1': 1.5, [NO_RINK]: 1 })
    expect(months[0].cancelled).toEqual({ '2': 1 })
    expect(sumOf(totals(months, 'used'))).toBe(2.5)
    expect(sumOf(totals(months, 'cancelled'))).toBe(1)
  })

  it('prices only the rinks that have a price, and only hours that took place', () => {
    const prices = new Map([[1, 15000]])
    expect(cost({ '1': 2, '2': 3, [NO_RINK]: 1 }, prices)).toBe(300)
    expect(cost({ '2': 3 }, prices)).toBeNull()
  })

  it('writes a file for Italian Excel', () => {
    const labels = { header: ['Data', 'Ora'], cancelled: 'Annullato', took: 'Svolto', noRink: 'Senza pista', training: 'Allenamento', game: 'Partita' }
    const csv = iceCsv(
      [ev('Giovedì; "tardi"', '2026-11-05T21:30:00Z', '2026-11-05T23:00:00Z', 1), ev('b', '2026-11-03T19:00:00Z', '2026-11-03T20:00:00Z', null, true)],
      [{ id: 1, name: 'Pista grande' }],
      new Map([[1, 15000]]),
      labels,
    )
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(lines[0]).toBe('Data;Ora')
    // Sorted by date, and a cancelled event costs nothing.
    expect(lines[1]).toBe('03/11/2026;20:00;21:00;b;Allenamento;Senza pista;1;Annullato;')
    expect(lines[2]).toBe('05/11/2026;22:30;00:00;"Giovedì; ""tardi""";Allenamento;Pista grande;1,5;Svolto;225')
  })

  it('keeps a title that looks like a formula as text', () => {
    const labels = { header: ['Data'], cancelled: 'Annullato', took: 'Svolto', noRink: 'Senza pista', training: 'Allenamento', game: 'Partita' }
    const csv = iceCsv([ev('=SOMMA(1;2)', '2026-11-05T21:30:00Z', '2026-11-05T23:00:00Z', 1)], [{ id: 1, name: 'Pista' }], new Map([[1, 15000]]), labels)
    expect(csv).toContain(";\"'=SOMMA(1;2)\";")
  })

  it('reads prices in euros', () => {
    expect(euroToCents('150')).toBe(15000)
    expect(euroToCents(' 150,5 ')).toBe(15050)
    expect(euroToCents('99.99')).toBe(9999)
    expect(euroToCents('')).toBeNull()
    expect(euroToCents('abc')).toBeNaN()
    expect(euroToCents('-5')).toBeNaN()
    expect(euroToCents('1,234')).toBeNaN()
    expect(centsToEuro(15000)).toBe('150')
    expect(centsToEuro(15050)).toBe('150,50')
  })
})
