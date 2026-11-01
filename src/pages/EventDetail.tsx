import { readableInk } from '../lib/colour'
import { useGroupFilter } from '../lib/groupfilter'
import { personName } from '../lib/names'
import { PageSkeleton } from '../components/Skeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { errorText, t, type MessageKey } from '../i18n'
import Predictions from '../components/Predictions'
import OpponentHistory from '../components/OpponentHistory'
import EventGame from './EventGame'
import EventThread from '../components/EventThread'
import Lineup from './Lineup'
import Plan from './Plan'
import { ConfirmDialog } from '../components/ConfirmAction'
import { jerseyName, useClub } from '../lib/club'
import { useCrumb } from '../lib/crumb'
import MapsButton from '../components/MapsButton'
import { placeLabel } from '../lib/maps'
import { useSession } from '../lib/session'
import type { CSSProperties } from 'react'
import { whatsappLink } from '../lib/whatsapp'
import { supabase } from '../lib/supabase'
import { formatDay, formatShortDay, formatTime } from '../lib/time'
import type { Answer, AttendanceRow, EventRow, Group, Rink, Status } from '../lib/types'
import TabStrip from '../components/TabStrip'

const STATUSES: Status[] = ['on_time', 'late', 'excused', 'unexcused', 'injured', 'not_called_up']

type NearEvent = Pick<EventRow, 'id' | 'type' | 'title' | 'starts_at' | 'opponent' | 'home_away' | 'score_for' | 'score_against' | 'cancelled_at' | 'event_groups'>
type Tab = 'info' | 'presence' | 'game' | 'discussion' | 'lineup' | 'plan'
type State = 'present' | 'absent' | 'waiting' | 'not_called_up'

export default function EventDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile, isStaff } = useSession()
  const club = useClub()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [rinks, setRinks] = useState<Rink[]>([])
  const [myGroupIds, setMyGroupIds] = useState<number[]>([])
  const [mine, setMine] = useState<Answer | null>(null)
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [going, setGoing] = useState<{ user_id: string; first_name: string; last_name: string }[]>([])
  // Whether the staff recorded who came, as the database sees it (a person only learns this for an event of their own).
  const [recordedByDb, setRecordedByDb] = useState(false)
  const [scoreUs, setScoreUs] = useState('')
  const [scoreThem, setScoreThem] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  // The actions menu closes when one of its actions is chosen.
  const menu = useRef<HTMLDetailsElement>(null)
  const closeMenu = () => menu.current?.removeAttribute('open')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [near, setNear] = useState<NearEvent[]>([])
  const [dragging, setDragging] = useState<string | null>(null)
  const [hoverState, setHoverState] = useState<State | null>(null)
  const [params] = useSearchParams()
  const { groupId: chosenGroup } = useGroupFilter()

  const refresh = useCallback(async () => {
    if (!profile) return
    const [e, g, m, a, rk, nb] = await Promise.all([
      supabase.from('events').select('*, event_groups(group_id)').eq('id', id).maybeSingle(),
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
      supabase.from('attendance_answers').select('answer').eq('event_id', id).eq('user_id', profile.id).maybeSingle(),
      supabase.from('rinks').select('id, name, address, note'),
      supabase.from('events').select('id, type, title, starts_at, opponent, home_away, score_for, score_against, cancelled_at, event_groups(group_id)').order('starts_at', { ascending: false }).limit(1000),
    ])
    // The strip follows the group chosen in the selector; the event being looked at is always in it.
    setNear(((nb.data ?? []) as NearEvent[]).filter((x) => x.id === id || chosenGroup === null || x.event_groups.some((g) => g.group_id === chosenGroup)).reverse())
    const row = (e.data as EventRow | null) ?? null
    setEvent(row)
    setGroups((g.data ?? []) as Group[])
    setRinks((rk.data ?? []) as Rink[])
    setMyGroupIds(((m.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    setMine((a.data as { answer: Answer } | null)?.answer ?? null)
    if (row) {
      setScoreUs(row.score_for?.toString() ?? '')
      setScoreThem(row.score_against?.toString() ?? '')
    }
    if (row && isStaff) {
      const r = await supabase.rpc('event_attendance', { p_event_id: id })
      setRows((r.data ?? []) as AttendanceRow[])
    } else if (row) {
      const [r, rec] = await Promise.all([
        supabase.rpc('event_present_people', { p_event_id: id }),
        supabase.rpc('event_presence_recorded', { p_event_id: id }),
      ])
      setGoing((r.data ?? []) as { user_id: string; first_name: string; last_name: string }[])
      setRecordedByDb(rec.data === true)
    }
    setLoaded(true)
  }, [id, profile, isStaff, chosenGroup])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useCrumb(event?.title ?? '')

  if (loaded && !event) return <Navigate to="/events" replace />
  if (!event) return <PageSkeleton />

  const now = Date.now()
  const over = new Date(event.ends_at).getTime() < now
  const cancelled = event.cancelled_at !== null
  const rink = rinks.find((r) => r.id === event.rink_id) ?? null
  const rinkName = rink?.name ?? ''
  const started = new Date(event.starts_at).getTime() <= now
  const inMyGroups = event.event_groups.some((x) => myGroupIds.includes(x.group_id))
  const groupNames = event.event_groups
    .map((x) => groups.find((g) => g.id === x.group_id)?.name)
    .filter(Boolean)
    .join(', ')
  const dayLabel = formatDay(event.starts_at)
  const link = `${window.location.origin}/events/${id}`
  const matchName = event.type === 'game' && event.opponent ? t('events.vs', { club: club.name || t('app.name'), opponent: event.opponent }) : event.title
  const jerseyLabel = event.jersey ? jerseyName(club, event.jersey) : ''
  const hasScore = event.score_for !== null && event.score_against !== null
  const shareText = [
    t('share.eventText', { title: matchName, day: dayLabel, time: formatTime(event.starts_at) }),
    event.meetup_at ? t('share.meetupText', { time: formatTime(event.meetup_at) }) : '',
    event.venue ? t('share.venueText', { venue: event.venue }) : '',
    jerseyLabel ? t('share.jerseyText', { jersey: jerseyLabel.toLowerCase() }) : '',
    t('share.answerText', { url: link }),
  ].filter(Boolean).join(' ')

  // A change that a rule silently refuses must not look like it worked.
  async function guarded(change: () => PromiseLike<{ error: { message?: string; code?: string } | null; data?: unknown[] | null }>) {
    setBusy(true)
    setError('')
    const { error, data } = await change()
    if (error) setError(errorText(error))
    else if (Array.isArray(data) && data.length === 0) setError(errorText({ message: 'forbidden' }))
    await refresh()
    setBusy(false)
  }

  async function answer(value: Answer) {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('answer_attendance', { p_event_id: id, p_answer: value })
    if (error) setError(errorText(error))
    await refresh()
    window.dispatchEvent(new Event('attendance-changed'))
    setBusy(false)
  }

  function record(userId: string, value: string) {
    const had = rows.find((r) => r.user_id === userId)?.status
    return guarded(() => {
      if (value === '') return supabase.from('attendance_records').delete().eq('event_id', id).eq('user_id', userId).select()
      if (had) return supabase.from('attendance_records').update({ status: value }).eq('event_id', id).eq('user_id', userId).select()
      return supabase.from('attendance_records').insert({ event_id: id, user_id: userId, status: value }).select()
    })
  }

  function saveScore() {
    const us = Number(scoreUs)
    const them = Number(scoreThem)
    if (scoreUs === '' || scoreThem === '' || !Number.isInteger(us) || !Number.isInteger(them)) return
    return guarded(() => supabase.from('events').update({ score_for: us, score_against: them }).eq('id', id).select())
  }

  // Staff change what a person is for this event: it changes the person's own answer.
  function moveTo(userId: string, state: State) {
    return guarded(() => supabase.rpc('set_player_state', { p_event_id: id, p_user_id: userId, p_state: state }) as unknown as PromiseLike<{ error: { message?: string; code?: string } | null }>)
  }

  function setCancelled(value: boolean) {
    return guarded(() => supabase.from('events').update({ cancelled_at: value ? new Date().toISOString() : null }).eq('id', id).select())
  }

  async function remove(following: boolean) {
    setBusy(true)
    setError('')
    const base = supabase.from('events').delete()
    const query = following && event!.series_id
      ? base.eq('series_id', event!.series_id).gte('starts_at', event!.starts_at)
      : base.eq('id', id)
    const { error, data } = await query.select()
    if (error || !data || data.length === 0) {
      setError(errorText(error ?? { message: 'forbidden' }))
      setConfirming(false)
      setBusy(false)
      return
    }
    window.dispatchEvent(new Event('attendance-changed'))
    navigate('/events', { replace: true })
  }


  const called = (r: AttendanceRow) => r.status !== 'not_called_up'
  const present = rows.filter((r) => r.answer === 'present' && called(r))
  const pending = rows.filter((r) => !r.answer && called(r))
  const absent = rows.filter((r) => r.answer === 'absent' && called(r))
  const notCalled = rows.filter((r) => !called(r))
  const game = event.type === 'game'

  const stateOf = (r: AttendanceRow): State => (!called(r) ? 'not_called_up' : r.answer === 'present' ? 'present' : r.answer === 'absent' ? 'absent' : 'waiting')

  function person(r: AttendanceRow) {
    const full = personName(r)
    return (
      <li
        key={r.user_id}
        className={dragging === r.user_id ? 'dragging' : undefined}
        draggable={!busy}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', r.user_id); e.dataTransfer.effectAllowed = 'move'; setDragging(r.user_id) }}
        onDragEnd={() => { setDragging(null); setHoverState(null) }}
      >
        <div className="row">
          <span data-person-name>{r.last_name} {r.first_name}</span>
          <span className="person-actions">
            <select aria-label={t('event.move', { name: full })} value={stateOf(r)} disabled={busy} onChange={(e) => void moveTo(r.user_id, e.target.value as State)}>
              <option value="present">{t('answer.present')}</option>
              <option value="waiting">{t('event.countWaiting')}</option>
              <option value="absent">{t('answer.absent')}</option>
              <option value="not_called_up">{t('status.not_called_up')}</option>
            </select>
            {started && (
              <select
                aria-label={t('event.record', { name: full })}
                value={r.status ?? ''}
                disabled={busy}
                onChange={(e) => void record(r.user_id, e.target.value)}
              >
                <option value="">{t('status.none')}</option>
                {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as MessageKey)}</option>)}
              </select>
            )}
          </span>
        </div>
      </li>
    )
  }

  // A column of the board accepts a person dropped on it.
  const dropProps = (state: State) => ({
    onDragOver: (e: React.DragEvent) => { if (dragging) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHoverState(state) } },
    onDragLeave: () => setHoverState((h) => (h === state ? null : h)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const who = e.dataTransfer.getData('text/plain') || dragging
      setDragging(null)
      setHoverState(null)
      const row = rows.find((r) => r.user_id === who)
      if (who && row && stateOf(row) !== state) void moveTo(who, state)
    },
    className: `col ${state === 'present' ? 'present' : state === 'waiting' ? 'pending' : state === 'absent' ? 'absent' : 'notcalled'}${hoverState === state ? ' drop' : ''}`,
  })

  // The tabs of the page. A tab that does not apply to this event is not offered.
  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: t('event.tabInfo') },
    { key: 'presence', label: t('event.tabPresence') },
    ...(game ? [{ key: 'game' as Tab, label: t('event.tabGame') }] : []),
    { key: 'discussion' as Tab, label: t('event.tabDiscussion') },
    ...(!cancelled ? [{ key: 'lineup' as Tab, label: t('lineup.open') }] : []),
    ...(!cancelled && event.type === 'training' ? [{ key: 'plan' as Tab, label: t('plan.open') }] : []),
  ]
  const asked = params.get('tab')
  const tab: Tab = tabs.some((x) => x.key === asked) ? (asked as Tab) : 'info'

  // The neighbouring events, to move between them without going back to the list.
  const at = near.findIndex((x) => x.id === id)
  const strip = at < 0 ? [] : near.slice(Math.max(0, at - 2), at + 3)
  // Where both team names are shown, the home side comes first, in the names and in the score.
  const nearTitle = (x: NearEvent) => (x.type === 'game' && x.opponent
    ? t('events.vs', x.home_away === 'away' ? { club: x.opponent, opponent: club.name || t('app.name') } : { club: club.name || t('app.name'), opponent: x.opponent })
    : x.title)
  const nearScore = (x: NearEvent) => (x.home_away === 'away' ? `${x.score_against} : ${x.score_for}` : `${x.score_for} : ${x.score_against}`)

  // A game uses the colours of its first group that has its own; otherwise the club colours.
  const teamGroup = event.event_groups.map((x) => groups.find((y) => y.id === x.group_id)).find((y) => y?.game_dark && y?.game_light)
  const bandStyle = game && teamGroup ? ({ '--team-dark': teamGroup.game_dark, '--team-light': teamGroup.game_light, '--band-ink': readableInk(teamGroup.game_dark) } as CSSProperties) : undefined
  const clubName = club.name || t('app.name')
  const away = event.home_away === 'away'
  const sides = game && event.opponent ? (away ? [event.opponent, clubName] : [clubName, event.opponent]) : null
  const scores = hasScore ? (away ? [event.score_against, event.score_for] : [event.score_for, event.score_against]) : null
  const resultText = scores && hasScore
    ? t('share.resultText', { home: (sides ?? [clubName, t('event.scoreThem')])[0], homeScore: String(scores[0]), away: (sides ?? [clubName, t('event.scoreThem')])[1], awayScore: String(scores[1]), url: link })
    : ''
  const typeLabel = event.title === t(`eventType.${event.type}` as MessageKey) ? '' : t(`eventType.${event.type}` as MessageKey)

  const scoreForm = isStaff && game && (
    <section className="card">
      <h2>{t('event.scoreTitle')}</h2>
      <div className="score">
        <label>
          {t('event.scoreUs')}
          <input type="number" inputMode="numeric" min={0} value={scoreUs} onChange={(e) => setScoreUs(e.target.value)} />
        </label>
        <label>
          {t('event.scoreThem')}
          <input type="number" inputMode="numeric" min={0} value={scoreThem} onChange={(e) => setScoreThem(e.target.value)} />
        </label>
      </div>
      <button disabled={busy || scoreUs === '' || scoreThem === ''} onClick={() => void saveScore()}>{t('common.save')}</button>
    </section>
  )

  // After the event has ended "present" means the people the staff recorded as on time or late. Before
  // that, or when nothing was recorded, it means the people who answered present. Not called up is never present.
  const recorded = isStaff ? over && rows.some((r) => r.status !== null && r.status !== 'not_called_up') : recordedByDb
  const recordedPresent = rows.filter((r) => called(r) && (r.status === 'on_time' || r.status === 'late'))
  const presentNames = isStaff ? (recorded ? recordedPresent : present).map((r) => ({ user_id: r.user_id, first_name: r.first_name, last_name: r.last_name })) : going

  return (
    <div className="page wide event-page">
      <Link className="page-back" data-back to="/events">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        {t('nav.events')}
      </Link>

      {strip.length > 0 && (
        <nav className="ev-strip desk-only" aria-label={t('event.near')}>
          {at > 0 ? <Link className="ev-step" to={`/events/${near[at - 1].id}`} aria-label={t('event.prevEvent')}>‹</Link> : <span className="ev-step off" aria-hidden="true">‹</span>}
          <ul>
            {strip.map((x) => (
              <li key={x.id}>
                <Link className={x.id === id ? 'on' : undefined} aria-current={x.id === id ? 'page' : undefined} to={`/events/${x.id}`}>
                  <span className="when">{formatShortDay(x.starts_at)}</span>
                  <span className="what">{nearTitle(x)}</span>
                  {x.score_for !== null && x.score_against !== null && <span className="res">{nearScore(x)}</span>}
                </Link>
              </li>
            ))}
          </ul>
          {at < near.length - 1 ? <Link className="ev-step" to={`/events/${near[at + 1].id}`} aria-label={t('event.nextEvent')}>›</Link> : <span className="ev-step off" aria-hidden="true">›</span>}
        </nav>
      )}

      <header className={`ev-band ${event.type}${cancelled ? ' cancelled' : ''}`} style={bandStyle}>
        <div className="ev-band-top">
          <p className="ev-day">{dayLabel}</p>
          <p className="ev-sub">{[typeLabel, groupNames].filter(Boolean).join(' · ')}</p>
          {isStaff && (
            <details className="ev-menu" ref={menu}>
              <summary aria-label={t('event.menu')}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </summary>
              <div className="ev-menu-list">
                <Link to={`/events/${id}/edit`}>{t('event.edit')}</Link>
                <button disabled={busy} onClick={() => { closeMenu(); if (cancelled) void setCancelled(false); else setCancelling(true) }}>{cancelled ? t('event.restore') : t('event.cancel')}</button>
                <button className="danger-text" disabled={busy} onClick={() => { closeMenu(); setConfirming(true) }}>{t('event.deleteStart')}</button>
              </div>
            </details>
          )}
        </div>
        {sides ? (
          <>
            <h1 className="sr-only">{matchName}</h1>
            <div className="ev-match">
              <p className="ev-team">{sides[0]}</p>
              <div className="ev-time">
                <strong>{formatTime(event.starts_at)}</strong>
                <small>{t('event.until', { end: formatTime(event.ends_at) })}</small>
                {scores && <span className="ev-score">{scores[0]} : {scores[1]}</span>}
              </div>
              <p className="ev-team">{sides[1]}</p>
            </div>
          </>
        ) : (
          <div className="ev-match single">
            <h1 className="ev-team">{event.title}</h1>
            <div className="ev-time">
              <strong>{formatTime(event.starts_at)}</strong>
              <small>{t('event.until', { end: formatTime(event.ends_at) })}</small>
              {scores && <span className="ev-score">{scores[0]} : {scores[1]}</span>}
            </div>
          </div>
        )}
        {placeLabel({ venue: event.venue, rink: rinkName }) && <p className="ev-venue">{placeLabel({ venue: event.venue, rink: rinkName })}</p>}
      </header>

      {error && <p className="error" role="alert">{error}</p>}
      {cancelled && <p className="box cancelled-note" role="status">{t('event.cancelledBanner')}{isStaff && ` ${t('event.restoreHint')}`}</p>}
      <ConfirmDialog
        open={cancelling}
        title={t('event.cancelTitle')}
        body={`${t('event.cancelBody', { title: event.title, date: dayLabel })} ${t('event.cancelHint')}`}
        choices={[{ label: t('event.cancelGo'), onChoose: () => void setCancelled(true) }]}
        busy={busy}
        onClose={() => setCancelling(false)}
      />
      <ConfirmDialog
        open={confirming}
        title={t('event.deleteTitle')}
        body={t('event.deleteConfirm', { title: event.title, date: dayLabel })}
        choices={[
          { label: event.series_id ? t('event.deleteOne') : t('event.deleteThis'), onChoose: () => void remove(false) },
          ...(event.series_id ? [{ label: t('event.deleteFollowing'), onChoose: () => void remove(true) }] : []),
        ]}
        busy={busy}
        onClose={() => setConfirming(false)}
      />

      <TabStrip label={t('event.tabs')}>
        {tabs.map((x) => (
          <Link key={x.key} to={{ search: x.key === 'info' ? '' : `?tab=${x.key}` }} replace aria-current={x.key === tab ? 'page' : undefined}>{x.label}</Link>
        ))}
      </TabStrip>

      {tab === 'info' && (
        <div className="ev-cols">
          <div className="ev-aside">
            {!isStaff && inMyGroups && !cancelled && (
              <section className="card">
                <h2>{t('event.myAnswer')}</h2>
                {over ? (
                  <p className="hint">{mine ? t(`answer.${mine}` as MessageKey) : ''} {t('event.over')}</p>
                ) : (
                  <>
                    <div className="answers">
                      {(['present', 'absent'] as const).map((a) => (
                        <button key={a} className={mine === a ? `answer on ${a}` : 'answer'} aria-pressed={mine === a} disabled={busy} onClick={() => void answer(a)}>
                          {t(`answer.${a}` as MessageKey)}
                        </button>
                      ))}
                    </div>
                    <p className="hint">{t('event.answerHint')}</p>
                  </>
                )}
              </section>
            )}
            {!inMyGroups && isStaff && <p className="hint">{t('event.notYours')}</p>}
            <section className="card">
              <h2>{t('event.attendance')}</h2>
              <ul className="counters">
                <li className="ok"><b>{loaded ? presentNames.length : '–'}</b><span>{t('event.countPresent')}</span></li>
                {isStaff && <li><b>{loaded ? pending.length : '–'}</b><span>{t('event.countWaiting')}</span></li>}
                {isStaff && <li className="bad"><b>{loaded ? notCalled.length : '–'}</b><span>{t('event.countNotCalled')}</span></li>}
                {isStaff && <li className="bad"><b>{loaded ? absent.length : '–'}</b><span>{t('event.countAbsent')}</span></li>}
              </ul>
              {isStaff && <p><Link className="inline-action" to={{ search: '?tab=presence' }} replace>{t('event.manage')}</Link></p>}
              {loaded && over && !cancelled && !recorded && <p className="hint">{t('event.presenceFromAnswers')}</p>}
              <details open>
                <summary>{t('event.presentNames')}</summary>
                {presentNames.length === 0 ? (
                  <p className="hint">{t('event.nobodyYet')}</p>
                ) : (
                  <ul className="list">{presentNames.map((p) => <li key={p.user_id}>{p.last_name} {p.first_name}</li>)}</ul>
                )}
              </details>
            </section>
          </div>
          <div className="ev-main">
            <dl className="facts">
              {event.meetup_at && (<><dt>{t('event.meetup')}</dt><dd>{formatTime(event.meetup_at)}</dd></>)}
              {event.venue && (<><dt>{t('event.venue')}</dt><dd>{event.venue}</dd></>)}
              {rinkName && (<><dt>{t('event.rink')}</dt><dd>{rinkName}</dd></>)}
              {rink?.address && (<><dt>{t('event.address')}</dt><dd>{rink.address}</dd></>)}
              {rink?.note && (<><dt>{t('event.rinkNote')}</dt><dd>{rink.note}</dd></>)}
              {event.opponent && (<><dt>{t('event.opponent')}</dt><dd>{event.opponent}{event.home_away ? ` · ${t(event.home_away === 'home' ? 'event.home' : 'event.away')}` : ''}</dd></>)}
              {event.jersey && (<><dt>{t('event.jersey')}</dt><dd>{jerseyLabel}</dd></>)}
              {hasScore && (
                <><dt>{t('event.scoreTitle')}</dt><dd>{t('event.scoreValue', { us: String(event.score_for), them: String(event.score_against) })}</dd></>
              )}
            </dl>
            <p className="button-row"><MapsButton rink={rink} venue={event.venue} />{game && event.video_url && <a className="button secondary" href={event.video_url} target="_blank" rel="noopener noreferrer">{t('event.videoOpen')}</a>}</p>
            <div className="actions share-row">
              {!over && !cancelled && <a className="button secondary small" href={whatsappLink(shareText)} target="_blank" rel="noopener noreferrer">{t('share.whatsapp')}</a>}
              {hasScore && <a className="button secondary small" href={whatsappLink(resultText)} target="_blank" rel="noopener noreferrer">{t('share.result')}</a>}
            </div>
            {game && !cancelled && profile && (inMyGroups || started) && (
              <Predictions eventId={id} myId={profile.id} started={started} canGuess={!isStaff && inMyGroups} inGroups={inMyGroups} />
            )}
            {game && event.opponent && <OpponentHistory eventId={id} opponent={event.opponent} />}
          </div>
        </div>
      )}

      {tab === 'presence' && (
        isStaff ? (
          <>
            <p className="hint">{t('event.dragHint')}</p>
            {!started && <p className="hint">{t('event.recordHint')}</p>}
            <div className="board">
              <section {...dropProps('present')}>
                <h2>{t(recorded ? 'event.answeredPresentList' : 'event.presentList', { n: String(present.length) })}</h2>
                <ul className="list">{present.map(person)}</ul>
              </section>
              <section {...dropProps('waiting')}>
                <h2>{t('event.noAnswer', { n: String(pending.length) })}</h2>
                <ul className="list">{pending.map(person)}</ul>
                {!over && !cancelled && pending.length > 0 && (
                  <div className="actions share-row">
                    <a
                      className="button secondary small"
                      href={whatsappLink(t('share.missingText', { title: matchName, day: dayLabel, names: pending.map((r) => personName(r)).join(', '), url: link }))}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('share.missing')}
                    </a>
                  </div>
                )}
              </section>
              <section {...dropProps('not_called_up')}>
                <h2>{t('event.notCalledList', { n: String(notCalled.length) })}</h2>
                <ul className="list">{notCalled.map(person)}</ul>
              </section>
              <section {...dropProps('absent')}>
                <h2>{t('event.absentList', { n: String(absent.length) })}</h2>
                <ul className="list">{absent.map(person)}</ul>
              </section>
            </div>
          </>
        ) : (
          <section className="card">
            <h2>{t('event.presentList', { n: String(going.length) })}</h2>
            {going.length === 0 ? <p className="hint">{t('event.nobodyYet')}</p> : <ul className="list">{going.map((p) => <li key={p.user_id}>{p.last_name} {p.first_name}</li>)}</ul>}
          </section>
        )
      )}

      {tab === 'game' && profile && (
        <>
          {scoreForm}
          <EventGame
            eventId={id}
            myId={profile.id}
            isStaff={isStaff}
            started={started}
            over={over}
            reloadKey={rows.map((r) => `${r.user_id}:${r.answer}:${r.status}`).join(',')}
          />
        </>
      )}

      {tab === 'discussion' && <EventThread eventId={id} />}
      {tab === 'lineup' && <Lineup embedded />}
      {tab === 'plan' && <Plan embedded />}
    </div>
  )
}
