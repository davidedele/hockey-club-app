import { readableInk } from './colour'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { setCertificateReview } from './documents'
import { supabase } from './supabase'

// The club's own name, logo and game day colours, set by staff in the app.
export interface Club {
  name: string
  logoPath: string | null
  logoUrl: string | null
  gameDark: string
  gameLight: string
  privacyNoticePath: string | null
  jerseyLight: string
  jerseyDark: string
  // Phase 1 of the required documents (decision 132).
  certificateMonths: number
  certificateReview: boolean
  consentMode: 'button' | 'tick'
}

interface ClubState extends Club {
  reload: () => Promise<void>
}

const DEFAULT: Club = { name: '', logoPath: null, logoUrl: null, gameDark: '#111111', gameLight: '#ffd400', privacyNoticePath: null, jerseyLight: 'Chiara', jerseyDark: 'Scura', certificateMonths: 12, certificateReview: true, consentMode: 'button' }
const Ctx = createContext<ClubState | null>(null)

export function logoUrl(path: string | null): string | null {
  return path ? supabase.storage.from('club').getPublicUrl(path).data.publicUrl : null
}

export function ClubProvider({ children }: { children: ReactNode }) {
  const [club, setClub] = useState<Club>(DEFAULT)

  const reload = useCallback(async () => {
    const { data } = await supabase.from('club_settings').select('name, logo_path, game_dark, game_light, privacy_notice_path, jersey_light_name, jersey_dark_name, certificate_months, certificate_review, consent_mode').maybeSingle()
    const row = data as { name: string; logo_path: string | null; game_dark: string; game_light: string; privacy_notice_path: string | null; jersey_light_name: string; jersey_dark_name: string; certificate_months: number | null; certificate_review: boolean | null; consent_mode: 'button' | 'tick' | null } | null
    if (!row) return
    setClub({
      name: row.name, logoPath: row.logo_path, logoUrl: logoUrl(row.logo_path), gameDark: row.game_dark, gameLight: row.game_light,
      privacyNoticePath: row.privacy_notice_path, jerseyLight: row.jersey_light_name, jerseyDark: row.jersey_dark_name,
      certificateMonths: row.certificate_months ?? 12, certificateReview: row.certificate_review ?? true, consentMode: row.consent_mode ?? 'button',
    })
    setCertificateReview(row.certificate_review ?? true)
  }, [])

  // The club's details are only readable after signing in, so they are read again at every sign in
  // and forgotten at sign out, which keeps the sign in pages neutral.
  useEffect(() => {
    void reload()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') setTimeout(() => void reload(), 0)
      if (event === 'SIGNED_OUT') setClub(DEFAULT)
    })
    return () => data.subscription.unsubscribe()
  }, [reload])

  useEffect(() => {
    const root = document.documentElement.style
    root.setProperty('--team-dark', club.gameDark)
    root.setProperty('--band-ink', readableInk(club.gameDark))
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

// The name the board gave to one of the club's two jerseys.
export const jerseyName = (club: Club, slot: 'light' | 'dark') => (slot === 'dark' ? club.jerseyDark : club.jerseyLight)
