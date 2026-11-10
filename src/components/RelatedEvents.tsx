import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { t, errorText } from '../i18n'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/time'
import type { EventRow } from '../lib/types'

export default function RelatedEvents({ event, staff }: { event: EventRow; staff: boolean }) {
  const [related, setRelated] = useState<EventRow[]>([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    let active = true
    const root = event.parent_event_id ?? event.id
    void supabase.from('events').select('*,event_groups(group_id)')
      .or(`id.eq.${root},parent_event_id.eq.${root}`).order('starts_at').then(result => {
        if (!active) return
        if (result.error) setError(errorText(result.error))
        else {
          setError('')
          setRelated(((result.data ?? []) as EventRow[]).filter(row => row.id === root || row.parent_event_id === root))
        }
      })
    return () => { active = false }
  }, [event.id, event.parent_event_id, attempt])
  const linked = related.length > 1 || Boolean(event.parent_event_id)
  if (!staff && !linked && !error) return null
  return (
    <section className="linked-event-note">
      <div className="linked-event-head">
        <h2>{t('linked.title')}</h2>
        {staff && !event.parent_event_id && <button type="button" className="secondary" aria-expanded={adding} onClick={() => setAdding(value => !value)}>{t('linked.add')}</button>}
      </div>
      {(linked || adding) && <p className="hint">{t('linked.independent')}</p>}
      {error && <><p className="error" role="alert">{error}</p><button type="button" className="secondary" onClick={() => setAttempt(n => n + 1)}>{t('common.retry')}</button></>}
      {linked && <ol className="related-events">{related.map(row => (
        <li key={row.id} className={row.id === event.id ? 'current' : ''}>
          <Link to={`/events/${row.id}`}>{row.title}</Link>
          <span>{formatDay(row.starts_at)} · {formatTime(row.starts_at)}{row.cancelled_at ? ` · ${t('events.cancelled')}` : ''}</span>
        </li>
      ))}</ol>}
      {adding && staff && !event.parent_event_id && <div className="actions">
        <Link className="button secondary" to={`/events/new?parent=${event.id}&position=before`}>{t('linked.before')}</Link>
        <Link className="button secondary" to={`/events/new?parent=${event.id}&position=after`}>{t('linked.after')}</Link>
      </div>}
    </section>
  )
}
