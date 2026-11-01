import { supabase } from './supabase'
import type { LeagueSync } from './types'

// The league's website is read at most every three hours. Any page can ask; the server decides.
const STALE_MS = 3 * 3600 * 1000

export async function leagueSync(): Promise<LeagueSync | null> {
  const { data } = await supabase.from('league_sync').select('started_at, finished_at, ok, message').maybeSingle()
  return (data as LeagueSync | null) ?? null
}

// Asks the server to read the league's website when the stored data is old, or now when staff force it.
// Returns true when something was read, so the caller can load the data again.
export async function refreshLeague(force = false): Promise<boolean> {
  if (!force) {
    const sync = await leagueSync()
    if (sync?.finished_at && Date.now() - Date.parse(sync.finished_at) < STALE_MS) return false
  }
  const { data, error } = await supabase.functions.invoke('league-sync', { body: { force } })
  if (error) return false
  return Boolean((data as { ok?: boolean } | null)?.ok)
}

// Asks the server to read the next finished games for the player statistics (ten at most, ten minutes apart; the server
// decides). Returns how many games were read.
export async function refreshLeagueDetails(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('league-details', { body: {} })
  if (error) return 0
  return Number((data as { read?: number } | null)?.read ?? 0)
}

const UPPER = new Set(['hc', 'lhl', 'asd', 'ssd'])
const SMALL = new Set(['di', 'del', 'della', 'delle', 'dei', 'degli', 'e', 'al', 'alla'])

// "HC VARESE KILLER BEES" as "HC Varese Killer Bees", "COPPA DELLE REGIONI" as "Coppa delle Regioni".
export function prettyName(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).map((w, i) => {
    // Acronyms and category letters such as A, B and C stay in capitals.
    if (UPPER.has(w) || (w.length === 1 && w !== 'e')) return w.toUpperCase()
    if (i > 0 && SMALL.has(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1)
  }).join(' ')
}
