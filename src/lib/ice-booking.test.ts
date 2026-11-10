import { describe, expect, it } from 'vitest'
import { hoursOf, iceMonths, totals, iceCsv, type IceEvent } from './ice'
const base:IceEvent={id:'1',type:'game',title:'Partita',starts_at:'2026-11-12T21:30:00Z',ends_at:'2026-11-12T23:00:00Z',rink_id:1,cancelled_at:null,booking_starts_at:'2026-11-12T20:00:00Z',booking_ends_at:'2026-11-12T23:30:00Z'}
describe('explicit ice reservations',()=>{
 it('does not charge away games without an explicit ice reservation',()=>{expect(iceMonths([{...base,home_away:'away',booking_starts_at:null,booking_ends_at:null}])).toEqual([]);expect(totals(iceMonths([{...base,home_away:'away'}]),'used')['1']).toBe(3.5)})
 it('counts the complete reservation instead of game duration',()=>expect(hoursOf(base)).toBe(3.5))
 it('does not charge related theory unless explicitly booked',()=>{
  const theory={...base,type:'theory' as const,booking_starts_at:null,booking_ends_at:null,rink_id:null}
  expect(iceMonths([theory])).toEqual([])
  expect(totals(iceMonths([{...theory,booking_starts_at:base.booking_starts_at,booking_ends_at:base.booking_ends_at,rink_id:1}]),'used')).toEqual({'1':3.5})
 })
 it('splits at midnight on the Italian month boundary',()=>{
  const rows=iceMonths([{...base,booking_starts_at:'2026-11-30T22:00:00Z',booking_ends_at:'2026-12-01T01:00:00Z'}])
  expect(rows.map(r=>[r.month,r.used['1']])).toEqual([['2026-11',1],['2026-12',2]])
 })
 it('sums elapsed minutes before rounding',()=>{
  const events=Array.from({length:6},(_,i)=>({...base,id:String(i),booking_starts_at:'2026-11-12T20:00:00Z',booking_ends_at:'2026-11-12T20:25:00Z'}))
  expect(totals(iceMonths(events),'used')['1']).toBeCloseTo(2.5,10)
 })
 it('keeps actual elapsed hours through daylight saving changes',()=>{
  expect(hoursOf({...base,booking_starts_at:'2026-10-25T00:00:00Z',booking_ends_at:'2026-10-25T03:00:00Z'})).toBe(3)
 })
 it('exports booking times, full duration and review state',()=>{
  const csv=iceCsv([{...base,booking_needs_review:true}],[],new Map([[1,15000]]),{header:[],cancelled:'Annullato',took:'Svolto',noRink:'Nessuna',training:'Allenamento',game:'Partita',endDate:'Fine',review:'Verifica'})
  expect(csv).toContain('12/11/2026;21:00;00:30;Partita;Partita;;3,5;Svolto;525;13/11/2026;Verifica')
 })
 it('clips export hours to the selected accounting season',()=>{
  const csv=iceCsv([{...base,booking_starts_at:'2026-08-31T21:00:00Z',booking_ends_at:'2026-09-01T01:00:00Z'}],[],new Map(),{header:[],cancelled:'Annullato',took:'Svolto',noRink:'Nessuna',training:'Allenamento',game:'Partita',range:{start:'2026-08-31T22:00:00Z',end:'2027-08-31T22:00:00Z'}})
  expect(csv).toContain('01/09/2026;00:00;03:00;Partita;Partita;;3;')
 })
})
