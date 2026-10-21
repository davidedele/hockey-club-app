import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Profile, Role } from './types'

interface SessionState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  roles: Role[]
  isStaff: boolean
  isBoard: boolean
  reload: () => Promise<void>
}

const Ctx = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<Role[]>([])

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setRoles([])
      return
    }
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', s.user.id),
    ])
    setProfile((p.data as Profile | null) ?? null)
    setRoles(((r.data ?? []) as { role: Role }[]).map((x) => x.role))
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await load(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Defer, so the auth callback is not blocked by queries.
      setTimeout(() => void load(s), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  const value: SessionState = {
    loading,
    session,
    profile,
    roles,
    isStaff: roles.includes('coach') || roles.includes('board'),
    isBoard: roles.includes('board'),
    reload: () => load(session),
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}
