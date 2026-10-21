import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { dayKey, formatDay, formatMonth, formatShortDay, formatTime, weekOf } from '../lib/time'
import type { Answer, EventRow, Group } from '../lib/types'

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
)
const Cross = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
)

export default function Events() {
  const { isStaff, profile } = useSession()
  const [events, setEvents] = useState<EventRow[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [myGroups, setMyGroups] = useState<number[]>([])
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map())
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    const [e, g, m, a] = await Promise.all([
      supabase.from('events').select('*, event_groups(group_id)').order('starts_at').limit(500),
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
      supabase.from('attendance_answers').select('event_id, answer').eq('user_id', profile.id),
    ])
    const rows = (e.data ?? []) as EventRow[]
    setEvents(rows)
    setGroups((g.data ?? []) as Group[])
    setMyGroups(((m.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    setAnswers(new Map(((a.data ?? []) as { event_id: string; answer: Answer }[]).map((x) => [x.event_id, x.answer])))
    const now = Date.now()
    const soon = rows.filter((x) => new Date(x.ends_at).getTime() >= now).slice(0, 20).map((x) => x.id)
    if (soon.length) {
      const c = await supabase.rpc('event_present_counts', { p_event_ids: soon })
      setCounts(new Map(((c.data ?? []) as { event_id: string; present: number }[]).map((x) => [x.event_id, x.present])))
    }
    setLoaded(true)
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])
  const now = Date.now()
  const upcoming = useMemo(() => events.filter((e) => new Date(e.ends_at).getTime() >= now), [events, now])
  const past = useMemo(() => events.filter((e) => new Date(e.ends_at).getTime() < now).reverse().slice(0, 60), [events, now])
  const week = useMemo(() => weekOf(new Date().toISOString()), [])
  const daysWithEvents = useMemo(() => new Set(events.map((e) => dayKey(e.starts_at))), [events])
  const todayKey = dayKey(new Date().toISOString())

  const canAnswer = (e: EventRow) => e.event_groups.some((x) => myGroups.includes(x.group_id))
  const groupsOf = (e: EventRow) => e.event_groups.map((x) => groupName.get(x.group_id)).filter(Boolean).join(', ')

  async function answer(e: EventRow, value: Answer) {
    setBusy(e.id)
    setError('')
    const { error } = await supabase.rpc('answer_attendance', { p_event_id: e.id, p_answer: value })
    if (error) setError(errorText(error))
    else {
      setAnswers(new Map(answers).set(e.id, value))
      window.dispatchEvent(new Event('attendance-changed'))
    }
    await load()
    setBusy('')
  }

  const next = view === 'upcoming' ? upcoming[0] : undefined
  const rest = view === 'upcoming' ? upcoming.slice(1) : past

  function row(e: EventRow) {
    const mine = answers.get(e.id)
    const over = new Date(e.ends_at).getTime() < now
    const title = e.type === 'game' && e.opponent ? t('events.vs', { opponent: e.opponent }) : e.title
    const meta = [e.venue, e.meetup_at ? t('events.meetup', { time: formatTime(e.meetup_at) }) : null].filter(Boolean).join(', ')
    return (
      <li key={e.id} className={e.type === 'game' ? 'evrow game' : 'evrow'}>
        <Link className="evlink" to={`/events/${e.id}`}>
          <div>
            <div className="d">{formatShortDay(e.starts_at)}</div>
            <div className="t">{formatTime(e.starts_at)}</div>
          </div>
          <div>
            <div className="ti">{title}</div>
            <div className="m">{meta || groupsOf(e)}</div>
          </div>
        </Link>
        {!over && canAnswer(e) ? (
          <div className="quick" role="group" aria-label={t('events.answerFor', { day: formatDay(e.starts_at) })}>
            <button className={mine === 'present' ? 'on present' : ''} aria-pressed={mine === 'present'} aria-label={t('answer.present')} disabled={busy === e.id} onClick={() => void answer(e, 'present')}><Tick /></button>
            <button className={mine === 'absent' ? 'on absent' : ''} aria-pressed={mine === 'absent'} aria-label={t('answer.absent')} disabled={busy === e.id} onClick={() => void answer(e, 'absent')}><Cross /></button>
          </div>
        ) : over && mine ? (
          <span className="state">{t(mine === 'present' ? 'answer.present' : 'answer.absent')}</span>
        ) : null}
      </li>
    )
  }

  return (
    <div className="page wide">
      <div className="row">
        <h1>{formatMonth(new Date().toISOString())}</h1>
        {isStaff && <Link className="button small" to="/events/new">{t('events.new')}</Link>}
      </div>

      <div className="week" aria-label={t('events.week')}>
        {week.map((d) => {
          const cls = ['wd', daysWithEvents.has(d.date) ? 'has' : '', d.date < todayKey ? 'past' : '', d.date === todayKey ? 'today' : ''].filter(Boolean).join(' ')
          return (
            <div key={d.date} className={cls} aria-current={d.date === todayKey ? 'date' : undefined}>
              <span className="dow" aria-hidden="true">{d.dow}</span>
              <span className="n">{d.num}</span>
              <span className="dot" aria-hidden="true" />
            </div>
          )
        })}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {loaded && view === 'upcoming' && upcoming.length === 0 && <p className="hint">{t('events.empty')}</p>}
      {loaded && view === 'past' && past.length === 0 && <p className="hint">{t('events.emptyPast')}</p>}

      <div className="evgrid">
        {next && <NextPanel event={next} groups={groupsOf(next)} mine={answers.get(next.id) ?? null} count={counts.get(next.id)} canAnswer={canAnswer(next)} busy={busy === next.id} onAnswer={(v) => void answer(next, v)} />}
        {rest.length > 0 && (
          <div>
            {view === 'upcoming' && <div className="nowline"><span>{t('events.then')}</span><i aria-hidden="true" /></div>}
            {view === 'past' && <h2>{t('events.past')}</h2>}
            <ul className="evrows">{rest.map(row)}</ul>
          </div>
        )}
      </div>

      <div className="more">
        <button className="link" onClick={() => setView(view === 'upcoming' ? 'past' : 'upcoming')}>
          {t(view === 'upcoming' ? 'events.showPast' : 'events.showUpcoming')}
        </button>
        {isStaff && <Link to="/events/unanswered">{t('events.unanswered')}</Link>}
      </div>
    </div>
  )
}

function NextPanel(props: { event: EventRow; groups: string; mine: Answer | null; count: number | undefined; canAnswer: boolean; busy: boolean; onAnswer: (v: Answer) => void }) {
  const { event: e, mine } = props
  const game = e.type === 'game'
  const started = new Date(e.starts_at).getTime() <= Date.now()
  const label = started ? t('events.now') : t(game ? 'events.nextGame' : 'events.nextTraining')
  return (
    <section className={game ? 'next game' : 'next'} aria-label={label}>
      {game && <div className="stripes" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>}
      <div className="next-in">
        <div className="label">
          <strong>{label}</strong>
          <span>{props.groups}</span>
        </div>
        {game && e.opponent && <div className="vs">{t('events.vs', { opponent: e.opponent })}</div>}
        <div>{formatDay(e.starts_at)}</div>
        <div className="time">
          <span className="big">{formatTime(e.starts_at)}</span>
          <span className="until">{t('events.until', { time: formatTime(e.ends_at) })}</span>
        </div>
        <dl className="pair">
          <div>
            <dt>{t('event.meetup')}</dt>
            <dd>{e.meetup_at ? formatTime(e.meetup_at) : t('common.none')}</dd>
          </div>
          <div>
            <dt>{t('event.venue')}</dt>
            <dd>{e.venue || t('common.none')}</dd>
          </div>
        </dl>
        {props.canAnswer && (
          <div className="answers">
            <button className={mine === 'present' ? 'answer on present' : 'answer'} aria-pressed={mine === 'present'} disabled={props.busy} onClick={() => props.onAnswer('present')}>{t('answer.present')}</button>
            <button className={mine === 'absent' ? 'answer on absent' : 'answer'} aria-pressed={mine === 'absent'} disabled={props.busy} onClick={() => props.onAnswer('absent')}>{t('answer.absent')}</button>
          </div>
        )}
        <div className="foot">
          <span role="status">{props.canAnswer ? t(mine ? 'events.saved' : 'events.notYet') : ''}</span>
          {props.count !== undefined && <span className="count">{t(props.count === 1 ? 'events.presentOne' : 'events.presentMany', { n: String(props.count) })}</span>}
        </div>
        <Link className="open" to={`/events/${e.id}`}>{t('events.details')}</Link>
      </div>
    </section>
  )
}
