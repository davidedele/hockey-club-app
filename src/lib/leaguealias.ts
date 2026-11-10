import { useCallback, useEffect, useState } from 'react'
import type { Group, EventRow } from './types'
import { prettyName } from './league'
import { supabase } from './supabase'
export function leagueName(groups: Group[], source: string, competition?: number | null): string {
 const matches=groups.filter(g=>g.league_team?.trim().toLowerCase()===source.trim().toLowerCase() && (competition==null||(g.league_championships??[]).includes(competition)))
 const names=[...new Set(matches.map(g=>g.league_alias?.trim()).filter(Boolean))]
 return names.length===1?names[0]!:prettyName(source)
}
export function useLeagueName(){
 const [groups,setGroups]=useState<Group[]>([])
 useEffect(()=>{let active=true;const load=()=>{void supabase.from('groups').select('*').then(r=>{if(active&&!r.error)setGroups((r.data??[]) as Group[])})};load();window.addEventListener('groups-changed',load);return()=>{active=false;window.removeEventListener('groups-changed',load)}},[])
 return useCallback((source:string,competition?:number|null)=>leagueName(groups,source,competition),[groups])
}

export function eventClubName(event: Pick<EventRow,'event_groups'>, groups: Group[], fallback: string) {
 const aliases=[...new Set(event.event_groups.map(e=>groups.find(g=>g.id===e.group_id)?.league_alias?.trim()).filter(Boolean))]
 return aliases.length===1?aliases[0]!:fallback
}
