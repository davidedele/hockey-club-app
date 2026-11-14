import { useCallback, useEffect, useState } from 'react'
import { today } from './documents'
import { itemsFor, type Requirement, type RequirementAnswer, type RequirementItem } from './requirements'
import { useSession } from './session'
import { supabase } from './supabase'

// The signed in person's own requirements and where they stand, reloaded when a document is sent or reviewed.
// Null until the first load; stays null if the load fails, so a screen can simply show nothing.
export function useOwnRequirements(): RequirementItem[] | null {
  const { profile } = useSession()
  const userId = profile?.id ?? ''
  const [items, setItems] = useState<RequirementItem[] | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    const [r, a, g] = await Promise.all([
      supabase.from('requirements').select('*'),
      supabase.from('requirement_answers').select('*').eq('user_id', userId),
      supabase.from('group_members').select('group_id').eq('user_id', userId),
    ])
    if (r.error || a.error || g.error) return
    const groupIds = ((g.data ?? []) as { group_id: number }[]).map((x) => x.group_id)
    setItems(itemsFor((r.data ?? []) as Requirement[], (a.data ?? []) as RequirementAnswer[], groupIds, today()))
  }, [userId])

  useEffect(() => {
    void load()
    window.addEventListener('documents-changed', load)
    return () => window.removeEventListener('documents-changed', load)
  }, [load])

  return items
}
