import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { clearPendingInvite } from './invite'
import { purgeOfflineCopy } from './offline'
import { supabase } from './supabase'
import type { Profile, Role } from './types'

// What the app is shown as. A board member can look at it as a coach or as a player, a coach as a
// player. It only hides things: the database rules follow the real roles whatever is chosen.
export type View = 'board' | 'coach' | 'player'
const VIEW_KEY = 'view-as'

interface SessionState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  // The roles as the app is being shown (see View), and the roles the person really has.
  roles: Role[]
  realRoles: Role[]
  isStaff: boolean
  isBoard: boolean
  view: View
  views: View[]
  setView: (view: View) => void
  reload: () => Promise<void>
  // The database could not be reached while loading the person (no signal). The app then offers the saved copy.
  unreachable: boolean
}

function readView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'board' || v === 'coach' || v === 'player' ? v : null
  } catch {
    return null
  }
}

const Ctx = createContext<SessionState | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [chosen, setChosen] = useState<View | null>(readView)
  const [unreachable, setUnreachable] = useState(false)

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setRoles([])
      setUnreachable(false)
      // Nobody is signed in: nothing of the person stays on the phone (decision 137).
      void purgeOfflineCopy()
      return
    }
    // A phone that knows it has no connection does not wait for requests that will be tried again and again.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setUnreachable(true)
      return
    }
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', s.user.id),
    ])
    // A failure with no database code is a connection that did not answer; it is not a person who was removed.
    if (p.error && !p.error.code) {
      setUnreachable(true)
      return
    }
    setUnreachable(false)
    const row = (p.data as Profile | null) ?? null
    // A profile that is gone or marked deleted: the saved copy goes with it.
    if (!row || (row as { deleted_at?: string | null }).deleted_at) void purgeOfflineCopy()
    setProfile(row)
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

  // The signal is back: load the person again, so the app leaves the saved copy.
  useEffect(() => {
    if (!unreachable) return
    const back = () => void load(session)
    window.addEventListener('online', back)
    return () => window.removeEventListener('online', back)
  }, [unreachable, session, load])

  const views: View[] = [
    ...(roles.includes('board') ? (['board'] as const) : []),
    ...(roles.includes('coach') || roles.includes('board') ? (['coach'] as const) : []),
    'player',
  ]
  const view: View = chosen && views.includes(chosen) ? chosen : views[0]
  const shown: Role[] = view === 'board' ? roles : view === 'coach' ? ['coach'] : []
  const setView = (v: View) => {
    setChosen(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // Private windows may refuse storage; the choice then lasts until the page is reloaded.
    }
  }

  const value: SessionState = {
    loading,
    session,
    profile,
    roles: shown,
    realRoles: roles,
    isStaff: shown.includes('coach') || shown.includes('board'),
    isBoard: shown.includes('board'),
    view,
    views,
    setView,
    reload: () => load(session),
    unreachable,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}

// Signing out also forgets a half used invite, so the next person on this device cannot pick it up.
export async function signOut() {
  clearPendingInvite()
  await purgeOfflineCopy()
  await supabase.auth.signOut()
}
