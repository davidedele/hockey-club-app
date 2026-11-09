import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useSession } from './session'
import { supabase } from './supabase'
import type { Group } from './types'

interface GroupFilter {
  // The groups the person can choose: every group in the staff views, only their own in the Giocatore view.
  groups: Group[]
  playerCalendar: boolean
  // In the calendar, null means all club events and MY_GROUPS means the own groups.
  // Outside the calendar, null means all permitted groups in the current view.
  groupId: number | null
  setGroupId: (id: number | null) => void
  // The person's own group ids in the Giocatore view, null in the staff views (no limit).
  scope: number[] | null
  // Does a thing that belongs to these groups show with the current choice and view?
  inView: (groupIds: readonly number[]) => boolean
}

export const MY_GROUPS = -1

const KEY = 'group-filter'
const Ctx = createContext<GroupFilter>({ groups: [], playerCalendar: false, groupId: null, setGroupId: () => undefined, scope: null, inView: () => true })

function saved(): number | null {
  try {
    const value = localStorage.getItem(KEY)
    return value && /^(?:-1|\d+)$/.test(value) ? Number(value) : null
  } catch {
    return null
  }
}

// Outside the calendar, Player view stays within actual memberships (decision 131).
// The calendar can also consult every club event (decision 143). Staff views are not limited.
// The view only hides: the database still answers by the real roles.
// Does a thing of these groups show, with the chosen group (or null) and the person's own groups (or null for no limit)?
export const visibleIn = (ids: readonly number[], groupId: number | null, scope: readonly number[] | null) =>
  groupId !== null && groupId !== MY_GROUPS ? ids.includes(groupId) : scope === null || ids.some((id) => scope.includes(id))

export function useScopeGroups(): number[] | null {
  return useContext(Ctx).scope
}

// The group the person is looking at, kept in this browser. The events, members, attendance and
// statistics pages follow it. It is only a view: nobody sees more because of it.
export function GroupFilterProvider({ children }: { children: ReactNode }) {
  const { profile, view } = useSession()
  const { pathname } = useLocation()
  const calendar = pathname === '/events' || pathname.startsWith('/events/')
  const [all, setAll] = useState<Group[]>([])
  const [own, setOwn] = useState<number[] | null>(null)
  const [stored, setStored] = useState<number | null>(saved)

  useEffect(() => {
    if (!profile) return
    const refresh = () => { void Promise.all([
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
    ]).then(([g, m]) => {
      if (g.error || m.error) return
      const rows = (g.data ?? []) as Group[]
      setAll(rows)
      setOwn(((m.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
      // A group that no longer exists is dropped.
      setStored((current) => (current !== null && current !== MY_GROUPS && !rows.some((x) => x.id === current) ? null : current))
    }) }
    refresh()
    window.addEventListener('groups-changed',refresh)
    return () => window.removeEventListener('groups-changed',refresh)
  }, [profile])

  const playerCalendar = view === 'player' && calendar
  const groups = useMemo(() => view === 'player' ? all.filter((g) => (own ?? []).includes(g.id)) : all, [all, own, view])
  const groupId = stored === MY_GROUPS && playerCalendar && groups.length > 1 ? MY_GROUPS
    : stored !== null && groups.some((g) => g.id === stored) ? stored : null
  const scope = useMemo(() => view === 'player' && (!calendar || groupId === MY_GROUPS) ? own ?? [] : null, [view, own, calendar, groupId])

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

  return <Ctx.Provider value={{ groups, playerCalendar, groupId, setGroupId, scope, inView }}>{children}</Ctx.Provider>
}

export const useGroupFilter = () => useContext(Ctx)
