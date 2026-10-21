import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { t, type MessageKey } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { dayKey, dayParts, formatDay, formatTime, isToday } from '../lib/time'
import type { Answer, EventRow, Group } from '../lib/types'

export default function Events() {
  const { isStaff, profile } = useSession()
  const [events, setEvents] = useState<EventRow[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map())
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!profile) return
    void (async () => {
      const [e, g, a] = await Promise.all([
        supabase.from('events').select('*, event_groups(group_id)').order('starts_at').limit(500),
        supabase.from('groups').select('*').order('id'),
        supabase.from('attendance_answers').select('event_id, answer').eq('user_id', profile.id),
      ])
      setEvents((e.data ?? []) as EventRow[])
      setGroups((g.data ?? []) as Group[])
      setAnswers(new Map(((a.data ?? []) as { event_id: string; answer: Answer }[]).map((x) => [x.event_id, x.answer])))
      setLoaded(true)
    })()
  }, [profile])

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])

  const shown = useMemo(() => {
    const now = Date.now()
    const upcoming = events.filter((e) => new Date(e.ends_at).getTime() >= now)
    if (view === 'upcoming') return upcoming
    return events.filter((e) => new Date(e.ends_at).getTime() < now).reverse().slice(0, 60)
  }, [events, view])

  const days = useMemo(() => {
    const out: { key: string; label: string; items: EventRow[] }[] = []
    for (const e of shown) {
      const key = dayKey(e.starts_at)
      const last = out[out.length - 1]
      if (last && last.key === key) last.items.push(e)
      else out.push({ key, label: formatDay(e.starts_at), items: [e] })
    }
    return out
  }, [shown])

  return (
    <div className="page">
      <div className="row">
        <h1>{t('events.title')}</h1>
        {isStaff && <Link className="button" to="/events/new">{t('events.new')}</Link>}
      </div>
      {isStaff && (
        <div className="actions stafflinks">
          <Link to="/events/unanswered">{t('events.unanswered')}</Link>
          <Link to="/events/summary">{t('events.summary')}</Link>
        </div>
      )}
      <div className="chips">
        <button className={view === 'upcoming' ? 'chip on' : 'chip'} onClick={() => setView('upcoming')}>{t('events.upcoming')}</button>
        <button className={view === 'past' ? 'chip on' : 'chip'} onClick={() => setView('past')}>{t('events.past')}</button>
      </div>
      {loaded && days.length === 0 && (
        <p className="hint">{t(view === 'upcoming' ? 'events.empty' : 'events.emptyPast')}</p>
      )}
      {days.map((day) => {
        const first = day.items[0]
        const parts = dayParts(first.starts_at)
        return (
          <section key={day.key} className="day" aria-label={day.label}>
            <div className={isToday(first.starts_at) ? 'dayhead today' : 'dayhead'} aria-hidden="true">
              <span className="num">{parts.num}</span>
              <span className="dow">{isToday(first.starts_at) ? t('events.today') : parts.dow}</span>
              <span className="mon">{parts.mon}</span>
            </div>
            <ul className="slots">
              {day.items.map((e) => {
                const mine = answers.get(e.id)
                const over = new Date(e.ends_at).getTime() < Date.now()
                const groupLine = e.event_groups.map((x) => groupName.get(x.group_id)).filter(Boolean).join(',\u00a0')
                const typeLabel = t(`eventType.${e.type}` as MessageKey)
                return (
                  <li key={e.id}>
                    <Link className={mine || over ? 'slot' : 'slot todo'} to={`/events/${e.id}`}>
                      <div className="when">
                        {formatTime(e.starts_at)}
                        {e.meetup_at && <small>{t('events.meetup', { time: formatTime(e.meetup_at) })}</small>}
                      </div>
                      <div>
                        <div className="slot-title">{e.title}</div>
                        <div className="slot-meta">
                          {[e.title === typeLabel ? null : typeLabel, e.venue, e.opponent, groupLine].filter(Boolean).join(' · ')}
                        </div>
                        {mine ? (
                          <div className={mine === 'present' ? 'status ok' : 'status no'}>
                            {mine === 'present' ? '\u2713 ' : '\u00d7 '}{t(`answer.${mine}` as MessageKey)}
                          </div>
                        ) : !over ? (
                          <div className="status todo">{t('answer.none')}</div>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
