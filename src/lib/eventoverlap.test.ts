import { describe, expect, it } from 'vitest'
import { eventOverlaps } from './eventoverlap'
import type { EventRow } from './types'
const now = Date.parse('2026-11-08T12:00:00Z')
const event = (id: string, start: string, end: string, groups = [1], extra: Partial<EventRow> = {}) => ({ id, starts_at: `2026-11-12T${start}:00Z`, ends_at: `2026-11-12T${end}:00Z`, event_groups: groups.map((group_id) => ({group_id})), cancelled_at:null, ...extra } as EventRow)
describe('staff overlap notice', () => {
  it('reports a shared group once, regardless of event order', () => {
    const a = event('a','21:00','22:30',[1,2])
    const b = event('b','22:00','23:30',[2,3])
    expect(eventOverlaps([b,a],now)).toEqual([{first:a,second:b,groups:[2]}])
  })
  it('allows adjacent events and parallel sessions for other groups', () => {
    expect(eventOverlaps([event('a','21:00','22:30'),event('b','22:30','23:30')],now)).toEqual([])
    expect(eventOverlaps([event('a','21:00','22:30'),event('b','21:00','22:30',[2])],now)).toEqual([])
  })
  it('ignores cancelled, historical and unassigned events', () => {
    const a=event('a','21:00','22:30')
    expect(eventOverlaps([a,event('b','21:00','22:30',[],{}),event('c','21:00','22:30',[1],{cancelled_at:'2026-11-08'})],now)).toEqual([])
    expect(eventOverlaps([a,event('b','21:00','22:30')],Date.parse('2026-11-13'))).toEqual([])
  })
  it('handles containment, overnight events and multiple conflicts without duplicate pairs', () => {
    const a=event('a','22:00','23:00', [1], {ends_at:'2026-11-13T01:00:00Z'})
    const b=event('b','22:30','23:30')
    const c=event('c','22:40','22:50')
    const d=event('d','22:00','23:00',[1],{starts_at:'2026-11-13T00:30:00Z',ends_at:'2026-11-13T01:30:00Z'})
    expect(eventOverlaps([a,b,c,d],now).map((p) => p.first.id+p.second.id)).toEqual(['ab','ac','ad','bc'])
  })
})
