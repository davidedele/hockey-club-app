import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useSession } from './session'
import { supabase } from './supabase'

const BANNER_DAYS = 14
const REFRESH_MS = 60000

export interface ThreadNote {
  event_id: string
  unread: number
  title: string
}

export interface Notifications {
  // Events in the next two weeks the person has not answered.
  pending: number
  // Announcements the person has not seen.
  announcements: number
  // Discussions with messages the person has not read.
  threads: ThreadNote[]
}

// What is new for the person: used by the banner and by the bell.
export function useNotifications(): Notifications {
  const { profile } = useSession()
  const location = useLocation()
  const [state, setState] = useState<Notifications>({ pending: 0, announcements: 0, threads: [] })

  const load = useCallback(async () => {
    if (!profile) return
    const now = new Date()
    const until = new Date(now.getTime() + BANNER_DAYS * 86400000)
    const [e, a, mine, ann, seen, th, off] = await Promise.all([
      supabase.from('events').select('id, event_groups(group_id)').is('cancelled_at', null).gt('ends_at', now.toISOString()).lt('starts_at', until.toISOString()),
      supabase.from('attendance_answers').select('event_id').eq('user_id', profile.id),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
      supabase.from('announcements').select('created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('announcement_seen').select('seen_at').eq('user_id', profile.id).maybeSingle(),
      supabase.rpc('my_event_threads'),
      supabase.from('attendance_records').select('event_id').eq('user_id', profile.id).eq('status', 'not_called_up'),
    ])
    // Someone staff did not call up for an event is not waited for.
    const answered = new Set([...((a.data ?? []) as { event_id: string }[]), ...((off.data ?? []) as { event_id: string }[])].map((x) => x.event_id))
    const myGroups = new Set(((mine.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    const events = (e.data ?? []) as unknown as { id: string; event_groups: { group_id: number }[] }[]
    const pending = events.filter((x) => !answered.has(x.id) && x.event_groups.some((g) => myGroups.has(g.group_id))).length

    const seenAt = (seen.data as { seen_at: string } | null)?.seen_at
    const announcements = ((ann.data ?? []) as { created_at: string }[]).filter((x) => !seenAt || new Date(x.created_at) > new Date(seenAt)).length

    const unread = ((th.data ?? []) as { event_id: string; unread: number }[]).filter((x) => Number(x.unread) > 0)
    let threads: ThreadNote[] = []
    if (unread.length > 0) {
      const titles = await supabase.from('events').select('id, title').in('id', unread.map((x) => x.event_id))
      const byId = new Map(((titles.data ?? []) as { id: string; title: string }[]).map((x) => [x.id, x.title]))
      threads = unread.map((x) => ({ event_id: x.event_id, unread: Number(x.unread), title: byId.get(x.event_id) ?? '' }))
    }
    setState({ pending, announcements, threads })
  }, [profile])

  useEffect(() => {
    void load()
  }, [load, location.pathname])

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, REFRESH_MS)
    for (const name of ['attendance-changed', 'announcements-changed', 'discussion-changed']) window.addEventListener(name, load)
    return () => {
      window.clearInterval(timer)
      for (const name of ['attendance-changed', 'announcements-changed', 'discussion-changed']) window.removeEventListener(name, load)
    }
  }, [load])

  return state
}
