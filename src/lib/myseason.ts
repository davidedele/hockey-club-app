import { useEffect, useState } from 'react'
import { useSession } from './session'
import { supabase } from './supabase'

// One row from my_season(): the signed in person's own numbers, from the same functions as the
// Presenze and Statistiche pages, so the numbers agree.
export interface MySeason {
  events_total: number
  answered_present: number
  answered_absent: number
  no_answer: number
  on_time: number
  late: number
  excused: number
  unexcused: number
  injured: number
  not_called_up: number
  games: number
  goals: number
  assists: number
  penalty_minutes: number
  mvp: number
  rating_avg: number | null
  rated_games: number
}

// The share of the events a person was called to that they came to, as on the Presenze page.
export function attendancePercent(r: Pick<MySeason, 'events_total' | 'not_called_up' | 'on_time' | 'late'>): number | null {
  const called = r.events_total - r.not_called_up
  return called > 0 ? Math.round(((r.on_time + r.late) * 100) / called) : null
}

// Nothing happened yet: no events, no games, no numbers. The page then says so instead of showing zeros.
export const isEmptySeason = (r: MySeason) => r.events_total === 0 && r.games === 0 && r.goals === 0 && r.assists === 0 && r.penalty_minutes === 0

export function useMySeason(season: number): { data: MySeason | null; error: boolean; loaded: boolean } {
  const { profile } = useSession()
  const [data, setData] = useState<MySeason | null>(null)
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!profile) return
    setLoaded(false)
    void supabase.rpc('my_season', { p_season: season }).then(({ data: rows, error: e }) => {
      const row = ((rows ?? []) as Record<string, unknown>[])[0]
      setError(Boolean(e))
      // The database sends big counts as text; every number is turned into a number here.
      setData(row ? (Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null ? null : Number(v)])) as unknown as MySeason) : null)
      setLoaded(true)
    })
  }, [profile, season])
  return { data, error, loaded }
}
