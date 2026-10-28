import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/time'
import type { Announcement, Group } from '../lib/types'

// Messages from coaches and the board to one or more groups. Members read the ones for their
// groups; staff also write them. A message is deleted, not edited.
export default function Announcements() {
  const { profile, isStaff, isBoard } = useSession()
  const [items, setItems] = useState<Announcement[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [seenAt, setSeenAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [email, setEmail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    const [a, g, s] = await Promise.all([
      supabase.from('announcements').select('*, announcement_groups(group_id), profiles:author_id(first_name, last_name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('groups').select('*').order('id'),
      supabase.from('announcement_seen').select('seen_at').eq('user_id', profile.id).maybeSingle(),
    ])
    setItems((a.data ?? []) as unknown as Announcement[])
    setGroups((g.data ?? []) as Group[])
    setSeenAt((s.data as { seen_at: string } | null)?.seen_at ?? null)
    setLoaded(true)
    await supabase.rpc('mark_announcements_seen')
    window.dispatchEvent(new Event('announcements-changed'))
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  function toggleGroup(id: number) {
    setGroupIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  async function post(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (groupIds.length === 0) {
      setError(t('form.groupsRequired'))
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('post_announcement', { p_title: title, p_body: body, p_group_ids: groupIds, p_email: email })
    setBusy(false)
    if (error) {
      setError(errorText(error))
      return
    }
    setTitle('')
    setBody('')
    setGroupIds([])
    setEmail(false)
    await load()
  }

  async function remove(id: string) {
    setError('')
    const { data, error } = await supabase.from('announcements').delete().eq('id', id).select()
    setConfirming('')
    if (error || !data || data.length === 0) {
      setError(errorText(error ?? { message: 'forbidden' }))
      return
    }
    await load()
  }

  const names = (a: Announcement) =>
    groups.filter((g) => a.announcement_groups.some((x) => x.group_id === g.id)).map((g) => g.name).join(', ')

  return (
    <div className="page narrow">
      <p><Link to="/events">{t('ann.back')}</Link></p>
      <h1>{t('ann.title')}</h1>
      <p className="hint">{t('ann.intro')}</p>
      {isStaff && (
        <form onSubmit={post} aria-label={t('ann.new')}>
          <h2>{t('ann.new')}</h2>
          <label>
            {t('ann.fieldTitle')}
            <input value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            {t('ann.fieldBody')}
            <textarea value={body} maxLength={2000} rows={5} required onChange={(e) => setBody(e.target.value)} />
          </label>
          <div className="field">
            <span className="label">{t('ann.groups')}</span>
            <div className="chips wrap">
              {groups.map((g) => (
                <button type="button" key={g.id} className={groupIds.includes(g.id) ? 'chip on' : 'chip'} aria-pressed={groupIds.includes(g.id)} onClick={() => toggleGroup(g.id)}>
                  {g.name}
                </button>
              ))}
            </div>
            <span className="hint">{t('ann.groupsHint')}</span>
          </div>
          <label className="check">
            <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
            {t('ann.email')}
          </label>
          {email && <p className="hint">{t('ann.emailHint')}</p>}
          <button type="submit" disabled={busy}>{busy ? t('ann.posting') : t('ann.post')}</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && items.length === 0 && <p className="hint">{t('ann.empty')}</p>}
      <ul className="ann-list">
        {items.map((a) => {
          const isNew = !seenAt || new Date(a.created_at) > new Date(seenAt)
          const canDelete = isBoard || a.author_id === profile?.id
          const who = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name}` : ''
          return (
            <li key={a.id} className="ann">
              <div className="row">
                <h2>{a.title}</h2>
                {isNew && <span className="tag todo">{t('ann.newBadge')}</span>}
              </div>
              <p className="ann-body">{a.body}</p>
              <p className="hint">
                {who ? t('ann.by', { name: who, groups: names(a) }) : names(a)}, {formatDay(a.created_at)} {formatTime(a.created_at)}
              </p>
              {canDelete && (
                confirming === a.id ? (
                  <div className="row">
                    <button type="button" className="danger" onClick={() => void remove(a.id)}>{t('ann.confirmDelete')}</button>
                    <button type="button" className="link" onClick={() => setConfirming('')}>{t('ann.cancel')}</button>
                  </div>
                ) : (
                  <button type="button" className="link" onClick={() => setConfirming(a.id)}>{t('ann.delete')}</button>
                )
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
