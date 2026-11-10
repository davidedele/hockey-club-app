import { describe, expect, it } from 'vitest'
import { leagueName, eventClubName } from './leaguealias'
import type { Group } from './types'
const groups:Group[]=[{id:1,code:'CB',name:'C Black',league_team:'SGULARAT',league_alias:'C Black',league_championships:[1],game_dark:null,game_light:null,logo_path:null},{id:2,code:'CY',name:'C Yellow',league_team:'SGULARAT YELLOW',league_alias:'C Yellow',league_championships:[1],game_dark:null,game_light:null,logo_path:null}]
describe('league display aliases',()=>{
 it('maps both names without changing league identity',()=>{
  const original=JSON.stringify(groups)
  expect(leagueName(groups,'SGULARAT',1)).toBe('C Black')
  expect(leagueName(groups,'Sgularat Yellow',1)).toBe('C Yellow')
  expect(JSON.stringify(groups)).toBe(original)
 })
 it('retains official opponent names and unmapped competitions',()=>{
  expect(leagueName(groups,'HC ESEMPIO',1)).toBe('HC Esempio')
  expect(leagueName(groups,'SGULARAT',2)).toBe('Sgularat')
 })
 it('disambiguates identical source names by championship',()=>{
  const both=[...groups,{...groups[0],id:3,league_alias:'B',league_championships:[2]}]
  expect(leagueName(both,'SGULARAT',2)).toBe('B')
  expect(leagueName(both,'SGULARAT')).toBe('Sgularat')
 })
 it('uses the alias of the event group without guessing for combined teams',()=>{
  expect(eventClubName({event_groups:[{group_id:1}]},groups,'Club')).toBe('C Black')
  expect(eventClubName({event_groups:[{group_id:1},{group_id:2}]},groups,'Club')).toBe('Club')
 })
})
