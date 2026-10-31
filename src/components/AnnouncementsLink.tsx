import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

// A line on the events page that leads to the announcements and says how many are new.
export default function AnnouncementsLink() {
  const { profile } = useSession()
  const [count, setCount] = useState(0)
  const [latest, setLatest] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    const [a, s] = await Promise.all([
      supabase.from('announcements').select('title, created_at').order('created_at', { ascending: false }).limit(50),
      supabase.from('announcement_seen').select('seen_at').eq('user_id', profile.id).maybeSingle(),
    ])
    const rows = (a.data ?? []) as { title: string; created_at: string }[]
    const seen = (s.data as { seen_at: string } | null)?.seen_at
    setCount(rows.filter((x) => !seen || new Date(x.created_at) > new Date(seen)).length)
    setLatest(rows[0]?.title ?? '')
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    window.addEventListener('announcements-changed', load)
    return () => window.removeEventListener('announcements-changed', load)
  }, [load])

  return (
    <Link className="ann-link" to="/announcements">
      <strong>{t('ann.link')}</strong>
      {latest && <span className="ann-latest">{latest}</span>}
      {count > 0 && <span className="tag todo">{t(count === 1 ? 'ann.linkCountOne' : 'ann.linkCount', { n: String(count) })}</span>}
    </Link>
  )
}
