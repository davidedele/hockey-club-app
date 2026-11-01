import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSession } from './session'
import { supabase } from './supabase'
import type { Group } from './types'

interface GroupFilter {
  // The groups the person can choose: every group in the staff views, only their own in the Giocatore view.
  groups: Group[]
  // null means all the groups in `groups` ("Tutti i gruppi" in the staff views, "I miei gruppi" in the player view).
  groupId: number | null
  setGroupId: (id: number | null) => void
  // The person's own group ids in the Giocatore view, null in the staff views (no limit).
  scope: number[] | null
  // Does a thing that belongs to these groups show with the current choice and view?
  inView: (groupIds: readonly number[]) => boolean
}

const KEY = 'group-filter'
const Ctx = createContext<GroupFilter>({ groups: [], groupId: null, setGroupId: () => undefined, scope: null, inView: () => true })

function saved(): number | null {
  try {
    const value = localStorage.getItem(KEY)
    return value && /^\d+$/.test(value) ? Number(value) : null
  } catch {
    return null
  }
}

// In the Giocatore view (the chosen view, or a person with no staff role) everything is limited to the groups the
// person belongs to (decision 131). A board member there sees what a plain player of the same groups sees. The
// staff views are not limited. The view only hides: the database still answers by the real roles.
// Does a thing of these groups show, with the chosen group (or null) and the person's own groups (or null for no limit)?
export const visibleIn = (ids: readonly number[], groupId: number | null, scope: readonly number[] | null) =>
  groupId !== null ? ids.includes(groupId) : scope === null || ids.some((id) => scope.includes(id))

export function useScopeGroups(): number[] | null {
  return useContext(Ctx).scope
}

// The group the person is looking at, kept in this browser. The events, members, attendance and
// statistics pages follow it. It is only a view: nobody sees more because of it.
export function GroupFilterProvider({ children }: { children: ReactNode }) {
  const { profile, view } = useSession()
  const [all, setAll] = useState<Group[]>([])
  const [own, setOwn] = useState<number[] | null>(null)
  const [stored, setStored] = useState<number | null>(saved)

  useEffect(() => {
    if (!profile) return
    void Promise.all([
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
    ]).then(([g, m]) => {
      const rows = (g.data ?? []) as Group[]
      setAll(rows)
      setOwn(((m.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
      // A group that no longer exists is dropped.
      setStored((current) => (current !== null && !rows.some((x) => x.id === current) ? null : current))
    })
  }, [profile])

  const scope = useMemo(() => (view === 'player' ? own ?? [] : null), [view, own])
  const groups = useMemo(() => (scope ? all.filter((g) => scope.includes(g.id)) : all), [all, scope])
  // A saved choice that is not one of the person's groups is ignored in the Giocatore view and comes back in a staff view.
  const groupId = stored !== null && groups.some((g) => g.id === stored) ? stored : null

  function setGroupId(id: number | null) {
    setStored(id)
    try {
      if (id === null) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, String(id))
    } catch {
      // Without storage the choice lasts until the page is closed.
    }
  }

  const inView = useCallback((ids: readonly number[]) => visibleIn(ids, groupId, scope), [groupId, scope])

  return <Ctx.Provider value={{ groups, groupId, setGroupId, scope, inView }}>{children}</Ctx.Provider>
}

export const useGroupFilter = () => useContext(Ctx)
