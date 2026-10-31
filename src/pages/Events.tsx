import { readableInk } from '../lib/colour'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { errorText, t } from '../i18n'
import AnnouncementsLink from '../components/AnnouncementsLink'
import CalendarPanel from '../components/CalendarPanel'
import NextPanel from '../components/NextPanel'
import Crest from '../components/Crest'
import { useClub } from '../lib/club'
import { refreshLeague } from '../lib/league'
import { useGroupFilter } from '../lib/groupfilter'
import { useSession } from '../lib/session'
import { unanswered } from '../lib/unanswered'
import { supabase } from '../lib/supabase'
import { dayKey, formatDay, formatMonth, formatShortDay, formatTime, italyToIso, rangeParts, seasonOf, weekOf } from '../lib/time'
import type { Answer, EventRow, Group } from '../lib/types'

const Tick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
)
const Cross = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
)

export default function Events() {
  const { isStaff, profile } = useSession()
  // Being present at an event is a player thing: the answer buttons and the unanswered list show in the Giocatore view only (decision 93).
  const asPlayer = !isStaff
  const club = useClub()
  const [allEvents, setEvents] = useState<EventRow[]>([])
  const { groupId } = useGroupFilter()
  // The group chosen in the switcher narrows the events shown.
  const events = useMemo(() => (groupId === null ? allEvents : allEvents.filter((e) => e.event_groups.some((x) => x.group_id === groupId))), [allEvents, groupId])
  const [groups, setGroups] = useState<Group[]>([])
  const [myGroups, setMyGroups] = useState<number[]>([])
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map())
  const [counts, setCounts] = useState<Map<string, number>>(new Map())
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [weekShift, setWeekShift] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [extra, setExtra] = useState(0)
  const [todoExtra, setTodoExtra] = useState(0)
  const [laterOpen, setLaterOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [records, setRecords] = useState<Map<string, string>>(new Map())
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [busy, setBusy] = useState('')
  const [savedFor, setSavedFor] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!profile) return
    const [e, g, m, a, r, n] = await Promise.all([
      supabase.from('events').select('*, event_groups(group_id)').order('starts_at', { ascending: false }).limit(1000),
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
      supabase.from('attendance_answers').select('event_id, answer').eq('user_id', profile.id),
      supabase.from('attendance_records').select('event_id, status').eq('user_id', profile.id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ])
    setRecords(new Map(((r.data ?? []) as { event_id: string; status: string }[]).map((x) => [x.event_id, x.status])))
    setMemberCount(n.count ?? null)
    // The newest events are fetched, so the future is never cut off, and put back in date order.
    const rows = ((e.data ?? []) as EventRow[]).slice().reverse()
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

  // League games enter the calendar when the league's website is read; a stale reading is refreshed here.
  useEffect(() => {
    void refreshLeague().then((changed) => { if (changed) void load() })
  }, [load])

  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])
  const now = Date.now()
  const upcoming = useMemo(() => events.filter((e) => new Date(e.ends_at).getTime() >= now), [events, now])
  const past = useMemo(() => events.filter((e) => new Date(e.ends_at).getTime() < now).reverse().slice(0, 60), [events, now])
  const week = useMemo(() => weekOf(new Date(Date.now() + weekShift * 7 * 86400000).toISOString()), [weekShift])
  const dayEvents = useMemo(() => (picked ? events.filter((e) => dayKey(e.starts_at) === picked) : []), [events, picked])
  const daysWithEvents = useMemo(() => new Set(events.map((e) => dayKey(e.starts_at))), [events])
  const todayKey = dayKey(new Date().toISOString())
  const thisWeek = useMemo(() => weekOf(new Date().toISOString()), [])
  const weekCount = events.filter((e) => { if (e.cancelled_at) return false; const k = dayKey(e.starts_at); return k >= thisWeek[0].date && k <= thisWeek[6].date }).length

  // Own attendance this season (from 1 September): recorded as on time or late, or else answered present.
  const season = useMemo(() => {
    const start = italyToIso(`${seasonOf(new Date().toISOString())}-09-01`, '00:00')
    // An event the person was not called up for does not count against them.
    const mine = events.filter((e) => e.starts_at >= start && !e.cancelled_at && new Date(e.ends_at).getTime() < Date.now() && records.get(e.id) !== 'not_called_up' && e.event_groups.some((x) => myGroups.includes(x.group_id)))
    const came = mine.filter((e) => {
      const r = records.get(e.id)
      return r ? r === 'on_time' || r === 'late' : answers.get(e.id) === 'present'
    }).length
    return { came, total: mine.length }
  }, [events, myGroups, records, answers])

  const canAnswer = (e: EventRow) => asPlayer && e.cancelled_at === null && e.event_groups.some((x) => myGroups.includes(x.group_id))
  // A game uses the colours of its first group that has its own; otherwise the club colours.
  const teamColours = (e: EventRow): CSSProperties | undefined => {
    const g = e.event_groups.map((x) => groups.find((y) => y.id === x.group_id)).find((y) => y?.game_dark && y?.game_light)
    return g ? ({ '--team-dark': g.game_dark, '--team-light': g.game_light, '--band-ink': readableInk(g.game_dark) } as CSSProperties) : undefined
  }
  const groupsOf = (e: EventRow) => e.event_groups.map((x) => groupName.get(x.group_id)).filter(Boolean).join(', ')

  async function answer(e: EventRow, value: Answer) {
    setBusy(e.id)
    setError('')
    const { error } = await supabase.rpc('answer_attendance', { p_event_id: e.id, p_answer: value })
    if (error) setError(errorText(error))
    else {
      setAnswers(new Map(answers).set(e.id, value))
      window.dispatchEvent(new Event('attendance-changed'))
      // A short confirmation next to the event that was answered.
      setSavedFor(e.id)
      window.setTimeout(() => setSavedFor((current) => (current === e.id ? '' : current)), 4000)
    }
    await load()
    setBusy('')
  }

  const live = upcoming.filter((e) => !e.cancelled_at)
  // The phone home shows one week at a time: this week by default, other weeks with the arrows.
  const inWeek = (e: EventRow) => { const k = dayKey(e.starts_at); return k >= week[0].date && k <= week[6].date }
  const next = view === 'upcoming' && weekShift === 0 ? live[0] : undefined
  // Every event of this week still waiting for the person's answer, from the one helper that the banner,
  // the bell and the Home tile use too (decision 92). The later ones are kept apart under "Più avanti".
  // The heading counts all of them whatever group is chosen in the selector, so it matches the bell.
  const notCalledUp = new Set([...records].filter(([, status]) => status === 'not_called_up').map(([id]) => id))
  const due: { inWindow: EventRow[]; later: EventRow[] } = asPlayer ? unanswered({ events: allEvents, answers, notCalledUp, myGroups }) : { inWindow: [], later: [] }
  const pending = due.inWindow
  const laterPending = due.later
  const todo = pending.slice(0, 5 + todoExtra)
  const weekRest = upcoming.filter((e) => e !== next && inWeek(e))
  // This week in full; when it has fewer than 5 events, the next ones fill it up to 5. "Show more" adds 5 at a time.
  const PHONE_MIN = 5
  const fill = weekShift === 0 ? Math.max(0, PHONE_MIN - (next ? 1 : 0) - weekRest.length) : 0
  const later = upcoming.filter((e) => e !== next && !inWeek(e) && e.starts_at > (weekRest[weekRest.length - 1]?.starts_at ?? ''))
  const phoneRest = [...weekRest, ...later.slice(0, fill + extra)]
  const moreLeft = weekShift === 0 ? later.length - (fill + extra) : 0
  const rest = view === 'upcoming' ? phoneRest : past

  function row(e: EventRow) {
    const mine = answers.get(e.id)
    const over = new Date(e.ends_at).getTime() < now
    const title = e.type === 'game' && e.opponent ? t('events.vs', { club: club.name || t('app.name'), opponent: e.opponent }) : e.title
    const meta = [e.venue, e.meetup_at ? t('events.meetup', { time: formatTime(e.meetup_at) }) : null].filter(Boolean).join(', ')
    return (
      <li key={e.id} className={`${e.type === 'game' ? 'evrow game' : 'evrow'}${e.cancelled_at ? ' cancelled' : ''}`}>
        <Link className="evlink" to={`/events/${e.id}`}>
          <div>
            <div className="d">{formatShortDay(e.starts_at)}</div>
            <div className="t">{formatTime(e.starts_at)}</div>
          </div>
          <div>
            <div className="ti">{title}</div>
            <div className="m">{e.cancelled_at && <span className="tag">{t('events.cancelled')} </span>}{meta || groupsOf(e)}{savedFor === e.id && <span className="tag todo" role="status"> · {t('events.savedShort')}</span>}</div>
          </div>
        </Link>
        {!over && canAnswer(e) ? (
          <div className="quick" role="group" aria-label={t('events.answerFor', { day: formatDay(e.starts_at) })}>
            <button className={mine === 'present' ? 'on present' : ''} aria-pressed={mine === 'present'} aria-label={t('answer.present')} disabled={busy === e.id} onClick={() => void answer(e, 'present')}><Tick /></button>
            <button className={mine === 'absent' ? 'on absent' : ''} aria-pressed={mine === 'absent'} aria-label={t('answer.absent')} disabled={busy === e.id} onClick={() => void answer(e, 'absent')}><Cross /></button>
          </div>
        ) : asPlayer && over && mine ? (
          <span className="state">{t(mine === 'present' ? 'answer.present' : 'answer.absent')}</span>
        ) : null}
      </li>
    )
  }

  function card(e: EventRow) {
    const mine = answers.get(e.id)
    const over = new Date(e.ends_at).getTime() < now
    const title = e.type === 'game' && e.opponent ? t('events.vs', { club: club.name || t('app.name'), opponent: e.opponent }) : e.title
    return (
      <article key={e.id} className={`${e.type === 'game' ? 'cal-ev game' : 'cal-ev'}${e.cancelled_at ? ' cancelled' : ''}`} style={e.type === 'game' ? teamColours(e) : undefined}>
        <Link to={`/events/${e.id}`}>
          <span className="t">{formatTime(e.starts_at)}</span>
          <span className="ti">{title}</span>
          {e.cancelled_at ? <span className="m">{t('events.cancelled')}</span> : e.venue && <span className="m">{e.venue}</span>}
        </Link>
        {!over && canAnswer(e) ? (
          <div className="quick" role="group" aria-label={t('events.answerFor', { day: formatDay(e.starts_at) })}>
            <button className={mine === 'present' ? 'on present' : ''} aria-pressed={mine === 'present'} aria-label={t('answer.present')} disabled={busy === e.id} onClick={() => void answer(e, 'present')}><Tick /></button>
            <button className={mine === 'absent' ? 'on absent' : ''} aria-pressed={mine === 'absent'} aria-label={t('answer.absent')} disabled={busy === e.id} onClick={() => void answer(e, 'absent')}><Cross /></button>
          </div>
        ) : asPlayer && mine ? (
          <span className="state">{t(mine === 'present' ? 'answer.present' : 'answer.absent')}</span>
        ) : null}
        {savedFor === e.id && <span className="m" role="status">{t('events.savedShort')}</span>}
      </article>
    )
  }

  const goWeek = (shift: number) => {
    setExtra(0)
    setWeekShift(shift)
    setPicked(null)
  }

  return (
    <div className="page wide events-page">
      <div className="row phone-only">
        <h1>{formatMonth(`${week[3].date}T12:00:00Z`)}</h1>
        {isStaff && <Link className="button small" to="/events/new">{t('events.new')}</Link>}
      </div>
      <AnnouncementsLink />

      <section className="club-banner desk-only" aria-label={club.name || t('app.name')}>
        <Crest />
        <div className="cb-title">
          <h1>{club.name || t('app.name')}</h1>
          <span>{formatMonth(new Date().toISOString())}</span>
        </div>
        <dl className="cb-stats">
          <div><dt>{t('dash.members')}</dt><dd>{memberCount ?? ''}</dd></div>
          <div><dt>{t('dash.thisWeek')}</dt><dd>{loaded ? weekCount : '\u2013'}</dd></div>
          <div><dt>{t('dash.myAttendance')}</dt><dd>{!loaded ? '\u2013' : season.total ? t('dash.ofTotal', { n: String(season.came), total: String(season.total) }) : t('common.none')}</dd></div>
        </dl>
        {isStaff && <Link className="button small light" to="/events/new">{t('events.new')}</Link>}
      </section>

      

      <section className="week phone-only" aria-label={t('events.week')}>
        <div className="week-bar">
          <button className="icon" aria-label={t('events.prevWeek')} onClick={() => { setWeekShift(weekShift - 1); setPicked(null) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          {weekShift === 0 ? (
            <span className="week-label">{t('events.thisWeek')}</span>
          ) : (
            <button className="link" onClick={() => { setWeekShift(0); setPicked(null) }}>{t('events.backToToday')}</button>
          )}
          <button className="icon" aria-label={t('events.nextWeek')} onClick={() => { setWeekShift(weekShift + 1); setPicked(null) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div className="days">
          {week.map((d) => {
            const cls = ['wd', daysWithEvents.has(d.date) ? 'has' : '', d.date < todayKey ? 'past' : '', d.date === todayKey ? 'today' : '', d.date === picked ? 'picked' : ''].filter(Boolean).join(' ')
            return (
              <button
                key={d.date}
                className={cls}
                aria-pressed={d.date === picked}
                aria-current={d.date === todayKey ? 'date' : undefined}
                aria-label={formatDay(`${d.date}T12:00:00Z`)}
                onClick={() => setPicked(d.date === picked ? null : d.date)}
              >
                <span className="dow" aria-hidden="true">{d.dow}</span>
                <span className="n" aria-hidden="true">{d.num}</span>
                <span className="dot" aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </section>

      {picked && (
        <section className="dayview phone-only" aria-live="polite">
          <div className="row">
            <h2>{formatDay(`${picked}T12:00:00Z`)}</h2>
            <button className="link" onClick={() => setPicked(null)}>{t('events.showAll')}</button>
          </div>
          {dayEvents.length === 0 ? <p className="hint">{t('events.dayEmpty')}</p> : <ul className="evrows">{dayEvents.map(row)}</ul>}
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {!picked && (<>
      {loaded && view === 'upcoming' && upcoming.length === 0 && <p className="hint">{t('events.empty')}</p>}
      {loaded && view === 'past' && past.length === 0 && <p className="hint">{t('events.emptyPast')}</p>}

      <div className="evgrid dash">
        {next && <NextPanel club={club.name || t('app.name')} colours={teamColours(next)} event={next} groups={groupsOf(next)} mine={answers.get(next.id) ?? null} count={counts.get(next.id)} canAnswer={canAnswer(next)} busy={busy === next.id} onAnswer={(v) => void answer(next, v)} />}
        {view === 'upcoming' && asPlayer && (
          <section className="todo desk-only" aria-label={t('dash.todo')}>
            <h2>{t('dash.todo')}{pending.length > 0 && <span className="count">{pending.length}</span>}</h2>
            {pending.length === 0 ? <p className="hint">{t('dash.allDone')}</p> : <ul className="evrows">{todo.map(row)}</ul>}
            {pending.length > todo.length && <button className="link" onClick={() => setTodoExtra(todoExtra + 5)}>{t('dash.todoMore', { n: String(Math.min(5, pending.length - todo.length)) })}</button>}
            {laterPending.length > 0 && (
              <div className="later-open">
                <button className="link disclosure" aria-expanded={laterOpen} aria-controls="later-list" onClick={() => setLaterOpen(!laterOpen)}>{t(laterOpen ? 'dash.laterHide' : 'dash.later', { n: String(laterPending.length) })}</button>
                {laterOpen && <ul id="later-list" className="evrows">{laterPending.map(row)}</ul>}
              </div>
            )}
          </section>
        )}
        {loaded && view === 'upcoming' && upcoming.length > 0 && !next && rest.length === 0 && (
          <div className="phone-only">
            <p className="hint">{t('events.weekNone')}</p>
            <button className="link" onClick={() => goWeek(weekShift + 1)}>{t('events.goNextWeek')}</button>
          </div>
        )}
        {rest.length > 0 && (
          <div className={view === 'upcoming' ? 'phone-only' : undefined}>
            {view === 'upcoming' && next && <div className="nowline"><span>{t('events.then')}</span><i aria-hidden="true" /></div>}
            {view === 'past' && <h2>{t('events.past')}</h2>}
            <ul className="evrows">{rest.map(row)}</ul>
            {view === 'upcoming' && moreLeft > 0 && <button className="link" onClick={() => setExtra(extra + 5)}>{t('events.showMore')}</button>}
          </div>
        )}
      </div>

      {!picked && view === 'upcoming' && (
        <CalendarPanel
          events={events}
          answers={answers}
          isStaff={isStaff}
          clubName={club.name || t('app.name')}
          groupName={groupsOf}
          weekShift={weekShift}
          weekLabel={weekRange(week[0].date, week[6].date)}
          onWeekShift={goWeek}
          renderWeek={(text, keep) => (
            <div className="cal-week" aria-label={t('events.week')}>
              {week.map((d) => (
                <section key={d.date} className={d.date === todayKey ? 'cal-day today' : d.date < todayKey ? 'cal-day past' : 'cal-day'} aria-label={formatDay(`${d.date}T12:00:00Z`)}>
                  <header aria-hidden="true">
                    <span className="dow">{d.dow}</span>
                    <span className="n">{d.num}</span>
                  </header>
                  {events.filter((e) => dayKey(e.starts_at) === d.date && keep(e)).map(card)}
                </section>
              ))}
              {loaded && week.every((d) => !events.some((e) => dayKey(e.starts_at) === d.date && keep(e))) && <p className="cal-none">{text ? t('cal.none') : t('events.weekEmpty')}</p>}
            </div>
          )}
        />
      )}

      <div className="more phone-only">
        <button className="link phone-only" onClick={() => setView(view === 'upcoming' ? 'past' : 'upcoming')}>
          {t(view === 'upcoming' ? 'events.showPast' : 'events.showUpcoming')}
        </button>
      </div>
      </>)}
    </div>
  )
}

// "dal 19 al 25 ottobre", or "dal 28 settembre al 4 ottobre" across two months.
const weekRange = (from: string, to: string) => t('events.weekRange', rangeParts(from, to))
