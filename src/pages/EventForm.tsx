import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { endIso, isoToItaly, italyToIso, meetupIso, shiftClock } from '../lib/time'
import type { EventRow, EventType, Group } from '../lib/types'

// One form for a new event and for changing an existing one.
// Changing an event does not change its groups or its repeat. Those are set when it is created.
export default function EventForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { isStaff } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [loaded, setLoaded] = useState(!editing)

  const [type, setType] = useState<EventType>('training')
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [endTouched, setEndTouched] = useState(false)
  const [meetupTime, setMeetupTime] = useState('')
  const [meetupTouched, setMeetupTouched] = useState(false)
  const [venue, setVenue] = useState('')
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [repeat, setRepeat] = useState(false)
  const [weeks, setWeeks] = useState('12')
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      const g = await supabase.from('groups').select('*').order('id')
      setGroups((g.data ?? []) as Group[])
      if (!id) return
      const { data } = await supabase.from('events').select('*, event_groups(group_id)').eq('id', id).maybeSingle()
      const e = data as EventRow | null
      if (e) {
        const start = isoToItaly(e.starts_at)
        setType(e.type)
        setTitle(e.title)
        setTitleTouched(true)
        setDate(start.date)
        setStartTime(start.time)
        setEndTime(isoToItaly(e.ends_at).time)
        setEndTouched(true)
        setMeetupTime(e.meetup_at ? isoToItaly(e.meetup_at).time : '')
        setMeetupTouched(true)
        setVenue(e.venue ?? '')
        setOpponent(e.opponent ?? '')
        setHomeAway(e.home_away ?? 'home')
      }
      setLoaded(true)
    })()
  }, [id])

  if (!isStaff) return <Navigate to="/events" replace />
  if (!loaded) return null

  // Sensible defaults that follow the start time until the person types their own.
  const shownTitle = titleTouched ? title : t(type === 'game' ? 'form.titleGame' : 'form.titleTraining')
  const shownEnd = endTouched ? endTime : startTime ? shiftClock(startTime, 90) : ''
  const shownMeetup = meetupTouched ? meetupTime : startTime ? shiftClock(startTime, -60) : ''

  function toggleGroup(groupId: number) {
    setGroupIds((current) => (current.includes(groupId) ? current.filter((x) => x !== groupId) : [...current, groupId]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!editing && groupIds.length === 0) {
      setError(t('form.groupsRequired'))
      return
    }
    setBusy(true)
    const startsAt = italyToIso(date, startTime)
    const endsAt = endIso(date, startTime, shownEnd)
    const meetupAt = shownMeetup ? meetupIso(date, startTime, shownMeetup) : null
    const isGame = type === 'game'

    if (editing) {
      const { data, error } = await supabase
        .from('events')
        .update({
          title: shownTitle.trim(),
          starts_at: startsAt,
          ends_at: endsAt,
          meetup_at: meetupAt,
          venue: venue.trim() || null,
          opponent: isGame ? opponent.trim() || null : null,
          home_away: isGame ? homeAway : null,
        })
        .eq('id', id!)
        .select()
      if (error || !data || data.length === 0) {
        setError(errorText(error ?? { message: 'forbidden' }))
        setBusy(false)
        return
      }
      navigate(`/events/${id}`, { replace: true })
      return
    }

    const total = Math.min(53, Math.max(2, Number(weeks) || 2))
    const { data, error } = await supabase.rpc('create_event', {
      p_type: type,
      p_title: shownTitle.trim(),
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_meetup_at: meetupAt,
      p_venue: venue.trim() || null,
      p_group_ids: groupIds,
      p_opponent: isGame ? opponent.trim() || null : null,
      p_home_away: isGame ? homeAway : null,
      p_repeat_weeks: type === 'training' && repeat ? total - 1 : 0,
    })
    if (error) {
      setError(errorText(error))
      setBusy(false)
      return
    }
    navigate(type === 'training' && repeat ? '/events' : `/events/${data as string}`, { replace: true })
  }

  return (
    <div className="page narrow">
      <p><Link to={editing ? `/events/${id}` : '/events'}>{t('event.back')}</Link></p>
      <h1>{editing ? t('form.editTitle') : t('form.newTitle')}</h1>
      <form onSubmit={submit}>
        {!editing && (
          <div className="field">
            <span className="label">{t('form.type')}</span>
            <div className="chips">
              {(['training', 'game'] as const).map((x) => (
                <button type="button" key={x} className={type === x ? 'chip on' : 'chip'} aria-pressed={type === x} onClick={() => setType(x)}>
                  {t(x === 'game' ? 'eventType.game' : 'eventType.training')}
                </button>
              ))}
            </div>
          </div>
        )}
        <label>
          {t('form.title')}
          <input required maxLength={80} value={shownTitle} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true) }} />
        </label>
        <label>
          {t('form.date')}
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          {t('form.start')}
          <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
        <label>
          {t('form.end')}
          <input type="time" required value={shownEnd} onChange={(e) => { setEndTime(e.target.value); setEndTouched(true) }} />
        </label>
        <label>
          {t('form.meetup')}
          <input type="time" value={shownMeetup} onChange={(e) => { setMeetupTime(e.target.value); setMeetupTouched(true) }} />
        </label>
        <label>
          {t('form.venue')}
          <input maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
        {type === 'game' && (
          <>
            <label>
              {t('form.opponent')}
              <input required maxLength={80} value={opponent} onChange={(e) => setOpponent(e.target.value)} />
            </label>
            <div className="field">
              <span className="label">{t('form.homeAway')}</span>
              <div className="chips">
                {(['home', 'away'] as const).map((x) => (
                  <button type="button" key={x} className={homeAway === x ? 'chip on' : 'chip'} aria-pressed={homeAway === x} onClick={() => setHomeAway(x)}>
                    {t(x === 'home' ? 'event.home' : 'event.away')}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {!editing && (
          <>
            <div className="field">
              <span className="label">{t('form.groups')}</span>
              <div className="chips wrap">
                {groups.map((g) => (
                  <button type="button" key={g.id} className={groupIds.includes(g.id) ? 'chip on' : 'chip'} aria-pressed={groupIds.includes(g.id)} onClick={() => toggleGroup(g.id)}>
                    {g.name}
                  </button>
                ))}
              </div>
              <span className="hint">{t('form.groupsHint')}</span>
            </div>
            {type === 'training' && (
              <div className="field">
                <label className="check">
                  <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                  {t('form.repeat')}
                </label>
                {repeat && (
                  <label>
                    {t('form.repeatWeeks')}
                    <input type="number" inputMode="numeric" min={2} max={53} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
                    <span className="hint">{t('form.repeatHint')}</span>
                  </label>
                )}
              </div>
            )}
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{editing ? t('common.save') : t('form.create')}</button>
      </form>
    </div>
  )
}
