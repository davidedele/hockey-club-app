import { useEffect, useState, type FormEvent } from 'react'
import PageHeader from '../components/PageHeader'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { jerseyName, useClub } from '../lib/club'
import { useGroupFilter } from '../lib/groupfilter'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { endIso, isoToItaly, italyToIso, meetupIso, shiftClock } from '../lib/time'
import type { EventRow, EventType, Group, Rink } from '../lib/types'

// One form for a new event and for changing an existing one.
// Changing an event can change its groups, for this event or for the later ones of its series. The repeat is set when it is created.
export default function EventForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { isStaff } = useSession()
  const club = useClub()
  const [params] = useSearchParams()
  const { groupId: chosenGroup } = useGroupFilter()
  const [groups, setGroups] = useState<Group[]>([])
  const [rinks, setRinks] = useState<Rink[]>([])
  const [rinkId, setRinkId] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(!editing)

  const [type, setType] = useState<EventType>('training')
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  // A date can come from the calendar, by pressing the plus of a day.
  const [date, setDate] = useState(() => (!id && /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? (params.get('date') as string) : ''))
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [endTouched, setEndTouched] = useState(false)
  const [meetupTime, setMeetupTime] = useState('')
  const [meetupTouched, setMeetupTouched] = useState(false)
  const [venue, setVenue] = useState('')
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [savedGroupIds, setSavedGroupIds] = useState<number[]>([])
  const [inSeries, setInSeries] = useState(false)
  const [groupsLocked, setGroupsLocked] = useState<'' | 'league' | 'ended'>('')
  const [scope, setScope] = useState<'one' | 'following'>('one')
  const [repeat, setRepeat] = useState(false)
  const [weeks, setWeeks] = useState('12')
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home')
  const [jersey, setJersey] = useState<'light' | 'dark' | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      const [g, r] = await Promise.all([supabase.from('groups').select('*').order('id'), supabase.from('rinks').select('id, name').order('name')])
      setGroups((g.data ?? []) as Group[])
      setRinks((r.data ?? []) as Rink[])
      if (!id) {
        // A new event starts on the group chosen in the switcher.
        if (chosenGroup !== null) setGroupIds((current) => (current.length === 0 ? [chosenGroup] : current))
        return
      }
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
        setJersey(e.jersey ?? '')
        setRinkId(e.rink_id)
        const ids = e.event_groups.map((x) => x.group_id)
        setGroupIds(ids)
        setSavedGroupIds(ids)
        setInSeries(Boolean(e.series_id))
        setGroupsLocked(e.league_match_id !== null ? 'league' : new Date(e.ends_at).getTime() <= Date.now() ? 'ended' : '')
      }
      setLoaded(true)
    })()
  }, [id, chosenGroup])

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
    const startsAt = italyToIso(date, startTime)
    const endsAt = endIso(date, startTime, shownEnd)
    // An end time earlier than the start means the next day, which is right for a late session but
    // wrong for a typo, so a very long event is not saved.
    if (Date.parse(endsAt) - Date.parse(startsAt) > 12 * 3600000) {
      setError(t('form.tooLong'))
      return
    }
    setBusy(true)
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
          jersey: isGame ? jersey || null : null,
          rink_id: rinkId,
        })
        .eq('id', id!)
        .select()
      if (error || !data || data.length === 0) {
        setError(errorText(error ?? { message: 'forbidden' }))
        setBusy(false)
        return
      }
      const groupsChanged = !groupsLocked && (groupIds.length !== savedGroupIds.length || groupIds.some((g) => !savedGroupIds.includes(g)))
      if (groupsChanged || (!groupsLocked && inSeries && scope === 'following' && groupIds.length > 0)) {
        if (groupIds.length === 0) {
          setError(t('form.groupsRequired'))
          setBusy(false)
          return
        }
        const res = await supabase.rpc('set_event_groups', { p_event_id: id!, p_group_ids: groupIds, p_scope: scope })
        if (res.error) {
          setError(errorText(res.error))
          setBusy(false)
          return
        }
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
      p_rink_id: rinkId,
    })
    if (error) {
      setError(errorText(error))
      setBusy(false)
      return
    }
    // The jersey is set right after creating, so creating keeps one simple call for both event types.
    if (isGame && jersey) {
      const j = await supabase.from('events').update({ jersey }).eq('id', data as string).select()
      if (j.error || !j.data || j.data.length === 0) {
        setError(errorText(j.error ?? { message: 'forbidden' }))
        setBusy(false)
        return
      }
    }
    navigate(type === 'training' && repeat ? '/events' : `/events/${data as string}`, { replace: true })
  }

  return (
    <div className="page narrow">
      <PageHeader title={editing ? t('form.editTitle') : t('form.newTitle')} back={editing ? { to: `/events/${id}`, label: t('event.backToEvent') } : { to: '/events', label: t('nav.events') }} />
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
          {startTime && shownEnd && shownEnd <= startTime && <span className="hint">{t('form.endNextDay')}</span>}
        </label>
        <label>
          {t('form.meetup')}
          <input type="time" value={shownMeetup} onChange={(e) => { setMeetupTime(e.target.value); setMeetupTouched(true) }} />
        </label>
        <label>
          {t('form.venue')}
          <input maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} />
        </label>
        {rinks.length > 0 && (
          <div className="field">
            <span className="label">{t('form.rink')}</span>
            <div className="chips wrap">
              {[null, ...rinks].map((r) => (
                <button type="button" key={r?.id ?? 'none'} className={rinkId === (r?.id ?? null) ? 'chip on' : 'chip'} aria-pressed={rinkId === (r?.id ?? null)} onClick={() => setRinkId(r?.id ?? null)}>
                  {r ? r.name : t('form.rinkNone')}
                </button>
              ))}
            </div>
            <span className="hint">{t('form.rinkHint')}</span>
          </div>
        )}
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
            <div className="field">
              <span className="label">{t('form.jersey')}</span>
              <div className="chips">
                {(['', 'light', 'dark'] as const).map((x) => (
                  <button type="button" key={x || 'none'} className={jersey === x ? 'chip on' : 'chip'} aria-pressed={jersey === x} onClick={() => setJersey(x)}>
                    {x ? jerseyName(club, x) : t('jersey.none')}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {editing && (
          <div className="field">
            <span className="label">{t('form.groups')}</span>
            {groupsLocked ? (
              <>
                <p>{groups.filter((g) => groupIds.includes(g.id)).map((g) => g.name).join(', ')}</p>
                <span className="hint">{t(groupsLocked === 'league' ? 'form.groupsLeague' : 'form.groupsEnded')}</span>
              </>
            ) : (
              <>
                <div className="chips wrap">
                  {groups.map((g) => (
                    <button type="button" key={g.id} className={groupIds.includes(g.id) ? 'chip on' : 'chip'} aria-pressed={groupIds.includes(g.id)} onClick={() => toggleGroup(g.id)}>
                      {g.name}
                    </button>
                  ))}
                </div>
                <span className="hint">{t('form.groupsEditHint')}</span>
                {inSeries && (
                  <div className="chips wrap">
                    <button type="button" className={scope === 'one' ? 'chip on' : 'chip'} aria-pressed={scope === 'one'} onClick={() => setScope('one')}>{t('form.scopeOne')}</button>
                    <button type="button" className={scope === 'following' ? 'chip on' : 'chip'} aria-pressed={scope === 'following'} onClick={() => setScope('following')}>{t('form.scopeFollowing')}</button>
                  </div>
                )}
              </>
            )}
          </div>
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
