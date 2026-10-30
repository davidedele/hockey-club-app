import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSession } from './session'
import { supabase } from './supabase'
import type { Group } from './types'

interface GroupFilter {
  groups: Group[]
  // null means every group.
  groupId: number | null
  setGroupId: (id: number | null) => void
}

const KEY = 'group-filter'
const Ctx = createContext<GroupFilter>({ groups: [], groupId: null, setGroupId: () => undefined })

function saved(): number | null {
  try {
    const value = localStorage.getItem(KEY)
    return value && /^\d+$/.test(value) ? Number(value) : null
  } catch {
    return null
  }
}

// The group the person is looking at, kept in this browser. The events, members, attendance and
// statistics pages follow it. It is only a view: nobody sees more because of it.
export function GroupFilterProvider({ children }: { children: ReactNode }) {
  const { profile } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [groupId, setId] = useState<number | null>(saved)

  useEffect(() => {
    if (!profile) return
    void supabase.from('groups').select('*').order('id').then(({ data }) => {
      const rows = (data ?? []) as Group[]
      setGroups(rows)
      // A group that no longer exists is dropped.
      setId((current) => (current !== null && !rows.some((g) => g.id === current) ? null : current))
    })
  }, [profile])

  function setGroupId(id: number | null) {
    setId(id)
    try {
      if (id === null) localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, String(id))
    } catch {
      // Without storage the choice lasts until the page is closed.
    }
  }

  return <Ctx.Provider value={{ groups, groupId, setGroupId }}>{children}</Ctx.Provider>
}

export const useGroupFilter = () => useContext(Ctx)
