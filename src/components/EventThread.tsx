import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/time'

interface Message {
  id: string
  user_id: string
  body: string
  created_at: string
  profiles: { first_name: string; last_name: string } | null
}
interface Seen {
  user_id: string
  seen_at: string
  profiles: { first_name: string; last_name: string } | null
}

const ARCHIVE_DAYS = 15
const REFRESH_MS = 20000

// The discussion of one event: the messages, who has read them, and a box to write.
export default function EventThread({ eventId }: { eventId: string }) {
  const { profile, isStaff } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [seen, setSeen] = useState<Seen[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const marked = useRef<string | null>(null)

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([
      supabase.from('event_messages').select('id, user_id, body, created_at, profiles(first_name, last_name)').eq('event_id', eventId).order('created_at'),
      supabase.from('event_message_seen').select('user_id, seen_at, profiles(first_name, last_name)').eq('event_id', eventId),
    ])
    const rows = (m.data ?? []) as unknown as Message[]
    setMessages(rows)
    setSeen((s.data ?? []) as unknown as Seen[])
    setLoaded(true)
    // Opening the thread reads it, and so does a new message that arrives while it is open.
    const latest = rows.length ? rows[rows.length - 1].created_at : ''
    if (marked.current !== latest) {
      marked.current = latest
      await supabase.rpc('mark_event_seen', { p_event_id: eventId })
      window.dispatchEvent(new Event('discussion-changed'))
    }
  }, [eventId])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, REFRESH_MS)
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus) }
  }, [load])

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'nearest' })
  }, [messages.length])

  async function send(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('post_event_message', { p_event_id: eventId, p_body: body })
    if (error) setError(errorText(error))
    else setText('')
    await load()
    setBusy(false)
  }

  async function remove(id: string) {
    setBusy(true)
    setError('')
    const { error, data } = await supabase.from('event_messages').delete().eq('id', id).select()
    if (error || !data || data.length === 0) setError(errorText(error ?? { message: 'forbidden' }))
    setRemoving(null)
    await load()
    setBusy(false)
  }

  const last = messages[messages.length - 1]
  const archived = last ? Date.now() - new Date(last.created_at).getTime() > ARCHIVE_DAYS * 86400000 : false
  const name = (p: { first_name: string; last_name: string } | null) => (p ? `${p.first_name} ${p.last_name}` : '')

  return (
    <section className="card thread" aria-label={t('event.tabDiscussion')}>
      <h2>{t('event.tabDiscussion')}</h2>
      {archived && <p className="hint">{t('thread.archived', { days: String(ARCHIVE_DAYS) })}</p>}
      {loaded && messages.length === 0 && <p className="hint">{t('thread.empty')}</p>}
      <ol className="messages">
        {messages.map((m) => {
          const mine = m.user_id === profile?.id
          const readers = seen.filter((s) => s.user_id !== m.user_id && s.seen_at >= m.created_at)
          return (
            <li key={m.id} className={mine ? 'msg mine' : 'msg'}>
              <div className="msg-head">
                <strong>{mine ? t('thread.you') : name(m.profiles)}</strong>
                <time dateTime={m.created_at}>{formatDay(m.created_at)}, {formatTime(m.created_at)}</time>
              </div>
              <p className="msg-body">{m.body}</p>
              <div className="msg-foot">
                <details>
                  <summary>{readers.length > 0 ? t('thread.readBy', { n: String(readers.length) }) : t('thread.nobody')}</summary>
                  {readers.length > 0 && <p className="hint">{readers.map((r) => name(r.profiles)).join(', ')}</p>}
                </details>
                {(mine || isStaff) && (
                  removing === m.id ? (
                    <span className="actions">
                      <button className="danger small" disabled={busy} onClick={() => void remove(m.id)}>{t('thread.deleteConfirm')}</button>
                      <button className="link" disabled={busy} onClick={() => setRemoving(null)}>{t('common.cancel')}</button>
                    </span>
                  ) : (
                    <button className="link" disabled={busy} onClick={() => setRemoving(m.id)}>{t('thread.delete')}</button>
                  )
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <div ref={end} />
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={send} className="compose">
        <label htmlFor="thread-text">{t('thread.label')}</label>
        <textarea id="thread-text" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="row">
          <span className="hint">{text.length}/1000</span>
          <button type="submit" disabled={busy || text.trim() === ''}>{t('thread.send')}</button>
        </div>
      </form>
    </section>
  )
}
