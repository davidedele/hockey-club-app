import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { errorText, t, type MessageKey } from '../i18n'
import EventGame from './EventGame'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/time'
import type { Answer, AttendanceRow, EventRow, Group, Status } from '../lib/types'

const STATUSES: Status[] = ['on_time', 'late', 'excused', 'unexcused', 'injured', 'not_called_up']

export default function EventDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile, isStaff } = useSession()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [myGroupIds, setMyGroupIds] = useState<number[]>([])
  const [mine, setMine] = useState<Answer | null>(null)
  const [rows, setRows] = useState<AttendanceRow[]>([])
  const [going, setGoing] = useState<{ user_id: string; first_name: string; last_name: string }[]>([])
  const [scoreUs, setScoreUs] = useState('')
  const [scoreThem, setScoreThem] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!profile) return
    const [e, g, m, a] = await Promise.all([
      supabase.from('events').select('*, event_groups(group_id)').eq('id', id).maybeSingle(),
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
      supabase.from('attendance_answers').select('answer').eq('event_id', id).eq('user_id', profile.id).maybeSingle(),
    ])
    const row = (e.data as EventRow | null) ?? null
    setEvent(row)
    setGroups((g.data ?? []) as Group[])
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
      const r = await supabase.rpc('event_present_people', { p_event_id: id })
      setGoing((r.data ?? []) as { user_id: string; first_name: string; last_name: string }[])
    }
    setLoaded(true)
  }, [id, profile, isStaff])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loaded && !event) return <Navigate to="/events" replace />
  if (!event) return <p className="center">{t('common.loading')}</p>

  const now = Date.now()
  const over = new Date(event.ends_at).getTime() < now
  const started = new Date(event.starts_at).getTime() <= now
  const inMyGroups = event.event_groups.some((x) => myGroupIds.includes(x.group_id))
  const groupNames = event.event_groups
    .map((x) => groups.find((g) => g.id === x.group_id)?.name)
    .filter(Boolean)
    .join(', ')
  const dayLabel = formatDay(event.starts_at)

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

  const pending = rows.filter((r) => !r.answer)
  const present = rows.filter((r) => r.answer === 'present')
  const absent = rows.filter((r) => r.answer === 'absent')

  function person(r: AttendanceRow) {
    return (
      <li key={r.user_id}>
        <div className="row">
          <span>{r.last_name} {r.first_name}</span>
          {started && (
            <select
              aria-label={t('event.record', { name: `${r.first_name} ${r.last_name}` })}
              value={r.status ?? ''}
              disabled={busy}
              onChange={(e) => void record(r.user_id, e.target.value)}
            >
              <option value="">{t('status.none')}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as MessageKey)}</option>)}
            </select>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="page">
      <p><Link to="/events">{t('event.back')}</Link></p>
      <div className="hero">
        <h1>{event.title}</h1>
        <div className="slot-meta">
          {[event.title === t(`eventType.${event.type}` as MessageKey) ? null : t(`eventType.${event.type}` as MessageKey), groupNames].filter(Boolean).join(' · ')}
        </div>
        <div className="day-text">{dayLabel}</div>
        <div className="when">
          {formatTime(event.starts_at)}{' '}
          <small>{t('event.until', { end: formatTime(event.ends_at) })}</small>
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <dl className="facts">
        {event.meetup_at && (<><dt>{t('event.meetup')}</dt><dd>{formatTime(event.meetup_at)}</dd></>)}
        {event.venue && (<><dt>{t('event.venue')}</dt><dd>{event.venue}</dd></>)}
        {event.opponent && (<><dt>{t('event.opponent')}</dt><dd>{event.opponent}{event.home_away ? ` · ${t(event.home_away === 'home' ? 'event.home' : 'event.away')}` : ''}</dd></>)}
        {event.score_for !== null && event.score_against !== null && (
          <><dt>{t('event.scoreTitle')}</dt><dd>{t('event.scoreValue', { us: String(event.score_for), them: String(event.score_against) })}</dd></>
        )}
      </dl>

      {event.type === 'game' && profile && (
        <EventGame
          eventId={id}
          myId={profile.id}
          isStaff={isStaff}
          started={started}
          over={over}
          reloadKey={rows.map((r) => `${r.user_id}:${r.answer}:${r.status}`).join(',')}
        />
      )}

      {inMyGroups && (
        <>
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
        </>
      )}
      {!inMyGroups && isStaff && <p className="hint">{t('event.notYours')}</p>}

      {!isStaff && (
        <>
          <h2>{t('event.presentList', { n: String(going.length) })}</h2>
          {going.length === 0 ? (
            <p className="hint">{t('event.nobodyYet')}</p>
          ) : (
            <ul className="list">{going.map((p) => <li key={p.user_id}>{p.last_name} {p.first_name}</li>)}</ul>
          )}
        </>
      )}

      {isStaff && (
        <>
          <h2>{t('event.attendance')}</h2>
          {!started && <p className="hint">{t('event.recordHint')}</p>}
          <h3>{t('event.noAnswer', { n: String(pending.length) })}</h3>
          <ul className="list">{pending.map(person)}</ul>
          <h3>{t('event.presentList', { n: String(present.length) })}</h3>
          <ul className="list">{present.map(person)}</ul>
          <h3>{t('event.absentList', { n: String(absent.length) })}</h3>
          <ul className="list">{absent.map(person)}</ul>

          {event.type === 'game' && (
            <>
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
            </>
          )}

          <div className="actions spaced">
            <Link className="button" to={`/events/${id}/edit`}>{t('event.edit')}</Link>
            {!confirming && (
              <button className="danger" disabled={busy} onClick={() => setConfirming(true)}>{t('event.deleteStart')}</button>
            )}
          </div>
          {confirming && (
            <div className="box" role="alertdialog" aria-label={t('event.delete')}>
              <p>{t('event.deleteConfirm', { title: event.title, date: dayLabel })}</p>
              <div className="actions">
                <button className="danger" disabled={busy} onClick={() => void remove(false)}>
                  {event.series_id ? t('event.deleteOne') : t('event.deleteThis')}
                </button>
                {event.series_id && (
                  <button className="danger" disabled={busy} onClick={() => void remove(true)}>{t('event.deleteFollowing')}</button>
                )}
                <button className="link" disabled={busy} onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
