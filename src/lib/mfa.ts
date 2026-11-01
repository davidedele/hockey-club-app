import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { dayKey, formatDateYear, formatTime } from './time'

// The exact moment the second step starts to count, in Italian time: the day (with the year) and the hour.
export function deadlineParts(iso: string): { date: string; time: string } {
  return { date: formatDateYear(dayKey(iso)), time: formatTime(iso) }
}

export interface Factor { id: string; friendly_name?: string | null }

// Does this session still have to pass the second step? True when the account has an authenticator app
// and the session signed in with the password only.
export function useNeedsSecondStep(userId: string | undefined): { needed: boolean; done: () => void } {
  const [needed, setNeeded] = useState(false)
  useEffect(() => {
    if (!userId) return
    let stop = false
    void (async () => {
      try {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (!stop) setNeeded(data?.nextLevel === 'aal2' && data.currentLevel !== 'aal2')
      } catch {
        // A session the library cannot read asks for nothing.
      }
    })()
    return () => { stop = true }
  }, [userId])
  return { needed, done: () => setNeeded(false) }
}

// The authenticator apps of the signed in person: the verified ones, and an unverified one left by a setup that was
// started and never confirmed (it counts for nothing until the code is typed).
export function useFactors() {
  const [factors, setFactors] = useState<Factor[] | null>(null)
  const [unfinished, setUnfinished] = useState<Factor | null>(null)
  const reload = useCallback(async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors()
      setFactors(((data?.totp ?? []) as Factor[]))
      const all = ((data?.all ?? []) as (Factor & { status?: string; factor_type?: string })[])
      setUnfinished(all.find((f) => f.status === 'unverified' && f.factor_type === 'totp') ?? null)
    } catch {
      setFactors([])
      setUnfinished(null)
    }
  }, [])
  useEffect(() => { void reload() }, [reload])
  return { factors, unfinished, reload }
}

// The QR code of a setup is shown once by the server. It is kept for this tab, so a reload does not lose it.
const SETUP_KEY = 'mfa-setup'
export interface PendingSetup { id: string; qr: string; secret: string }
export function savedSetup(): PendingSetup | null {
  try { return JSON.parse(sessionStorage.getItem(SETUP_KEY) ?? 'null') as PendingSetup | null } catch { return null }
}
export function keepSetup(s: PendingSetup | null) {
  try { if (s) sessionStorage.setItem(SETUP_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SETUP_KEY) } catch { /* a private window may refuse */ }
}

// The code from the authenticator app: six digits, spaces allowed when it is copied.
export const cleanCode = (text: string) => text.replace(/\s+/g, '')
export const validCode = (text: string) => /^\d{6}$/.test(cleanCode(text))
