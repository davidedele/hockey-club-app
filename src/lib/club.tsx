import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

// The club's own name, logo and game day colours, set by staff in the app.
export interface Club {
  name: string
  logoPath: string | null
  logoUrl: string | null
  gameDark: string
  gameLight: string
}

interface ClubState extends Club {
  reload: () => Promise<void>
}

const DEFAULT: Club = { name: '', logoPath: null, logoUrl: null, gameDark: '#111111', gameLight: '#ffd400' }
const Ctx = createContext<ClubState | null>(null)

export function logoUrl(path: string | null): string | null {
  return path ? supabase.storage.from('club').getPublicUrl(path).data.publicUrl : null
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const [club, setClub] = useState<Club>(DEFAULT)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('club_settings').select('name, logo_path, game_dark, game_light').maybeSingle()
    const row = data as { name: string; logo_path: string | null; game_dark: string; game_light: string } | null
    if (!row) return
    setClub({ name: row.name, logoPath: row.logo_path, logoUrl: logoUrl(row.logo_path), gameDark: row.game_dark, gameLight: row.game_light })
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--team-dark', club.gameDark)
    root.setProperty('--team-light', club.gameLight)
    if (club.name) document.title = club.name
  }, [club])

  return <Ctx.Provider value={{ ...club, reload }}>{children}</Ctx.Provider>
}

export function useClub(): ClubState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useClub must be used inside ClubProvider')
  return value
}
