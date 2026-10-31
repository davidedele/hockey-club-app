import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Rink } from './types'

let cache: Rink[] | null = null

// The rinks with their address, loaded once and kept for the session: they hardly ever change.
export function useRinks(): Rink[] {
  const [rinks, setRinks] = useState<Rink[]>(cache ?? [])
  useEffect(() => {
    if (cache) return
    void supabase.from('rinks').select('id, name, address, note').then(({ data }) => {
      cache = (data ?? []) as Rink[]
      setRinks(cache)
    })
  }, [])
  return rinks
}

// After the board edits a rink the next read must be fresh.
export function forgetRinks() {
  cache = null
}
