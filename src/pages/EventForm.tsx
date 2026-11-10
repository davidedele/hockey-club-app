import LoadError from '../components/LoadError'
import { PageSkeleton } from '../components/Skeleton'
import { eventLocation } from '../lib/maps'
import { ChipsSkeleton } from '../components/Skeleton'
import { useEffect, useState, type FormEvent } from 'react'
import { ConfirmDialog } from '../components/ConfirmAction'
import EventVisibility from '../components/EventVisibility'
import EventScopeSelect from '../components/EventScopeSelect'
import { scopeSummary, type ScopedEvent } from '../components/EventActions'
import { EVENT_DETAILS, unassignedTraining } from '../lib/eventaccess'
import PageHeader from '../components/PageHeader'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { jerseyName, useClub } from '../lib/club'
import { useGroupFilter } from '../lib/groupfilter'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { endIso, isoToItaly, italyToIso, meetupIso, shiftClock } from '../lib/time'
import type { EventRow, EventType, EventScope, EventDetailKey, Group, Rink } from '../lib/types'

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
  // The groups and rinks come from the database; until they are here the chips are grey placeholders.
  const [listsReady, setListsReady] = useState(false)
  const [rinkId, setRinkId] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(!editing)

  const [parentId,setParentId]=useState<string|null>(params.get('parent'))
  const [parentTitle,setParentTitle]=useState('')
  const [bookingReview,setBookingReview]=useState(false)
  const [bookingConfirmed,setBookingConfirmed]=useState(false)
  const [bookingStart,setBookingStart]=useState('')
  const [bookingEnd,setBookingEnd]=useState('')
  const [bookingDate,setBookingDate]=useState('')
  const [bookingEndDate,setBookingEndDate]=useState('')
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
  const [groupsPending, setGroupsPending] = useState(false)
  const [participant, setParticipant] = useState<EventDetailKey[]>(EVENT_DETAILS)
  const [observer, setObserver] = useState<EventDetailKey[]>([])
  const [preview, setPreview] = useState<ScopedEvent[]>([])
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [inSeries, setInSeries] = useState(false)
  const [groupsLocked, setGroupsLocked] = useState<'' | 'league' | 'ended'>('')
  const [scope, setScope] = useState<EventScope>('one')
  const [repeat, setRepeat] = useState(false)
  const [weeks, setWeeks] = useState('12')
  const [opponent, setOpponent] = useState('')
  const [video, setVideo] = useState('')
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home')
  const [jersey, setJersey] = useState<'light' | 'dark' | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loadedFor, setLoadedFor] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let active = true
    setLoaded(false); setListsReady(false); setLoadError(''); setMissing(false)
    void (async () => {
      const [g, r] = await Promise.all([supabase.from('groups').select('*').order('id'), supabase.from('rinks').select('id, name, address, note').order('name')])
      if (!active) return
      const failure = g.error ?? r.error
      if (failure) { setLoadError(errorText(failure)); setLoadedFor(id ?? 'new'); setLoaded(true); return }
      setLoadError('')
      setGroups((g.data ?? []) as Group[])
      setRinks((r.data ?? []) as Rink[])
      setListsReady(true)
      if (!id && params.get('parent')) {
        const parent=await supabase.from('events').select('*,event_groups(group_id)').eq('id',params.get('parent')!).single()
        if(!active)return
        if(parent.error){setLoadError(errorText(parent.error));setLoadedFor('new');setLoaded(true);return}
        const p=parent.data as EventRow
        setParentTitle(p.title);setType('theory');setTitleTouched(false);setGroupIds(p.event_groups.map(g=>g.group_id))
        const anchor=params.get('position')==='before'?new Date(Date.parse(p.starts_at)-30*60000).toISOString():p.ends_at
        const start=isoToItaly(anchor);setDate(start.date);setStartTime(start.time);setEndTime(isoToItaly(new Date(Date.parse(anchor)+30*60000).toISOString()).time);setEndTouched(true);setMeetupTouched(true);setMeetupTime('')
      }
      if (!id) {
        setLoadedFor('new'); setLoaded(true)
        return
      }
      const { data, error: eventError } = await supabase.from('events').select('*, event_groups(group_id)').eq('id', id).maybeSingle()
      if (!active) return
      if (eventError) { setLoadError(errorText(eventError)); setLoadedFor(id); setLoaded(true); return }
      if (!data) { setMissing(true); setLoadedFor(id); setLoaded(true); return }
      const e = data as EventRow | null
      if (e) {
        const start = isoToItaly(e.starts_at)
        setBookingReview(e.booking_needs_review??false)
        setParentId(e.parent_event_id??null)
        if(e.booking_starts_at){const b=isoToItaly(e.booking_starts_at);setBookingStart(b.time);setBookingDate(b.date)}
        if(e.booking_ends_at){const b=isoToItaly(e.booking_ends_at);setBookingEnd(b.time);setBookingEndDate(b.date)}
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
        setVideo(e.video_url ?? '')
        setHomeAway(e.home_away ?? 'home')
        setJersey(e.jersey ?? '')
        setRinkId(e.rink_id)
        const ids = e.event_groups.map((x) => x.group_id)
        setGroupIds(ids)
        setGroupsPending(unassignedTraining(e))
        setParticipant(e.participant_details ?? EVENT_DETAILS)
        setObserver(e.observer_details ?? [])
        setInSeries(Boolean(e.series_id))
        setGroupsLocked(e.league_match_id !== null ? 'league' : new Date(e.ends_at).getTime() <= Date.now() ? 'ended' : '')
      }
      setLoadedFor(id); setLoaded(true)
    })()
    return () => { active = false }
  }, [id, loadAttempt])

  useEffect(() => {
    if (!editing && chosenGroup !== null && chosenGroup > 0) setGroupIds((current) => current.length ? current : [chosenGroup])
  }, [editing, chosenGroup])

  useEffect(()=>{if(!editing&&type==='game'&&homeAway==='home'&&rinkId===null&&club.homeRinkId!==null)setRinkId(club.homeRinkId)},[editing,type,homeAway,club.homeRinkId])
  if (!isStaff) return <Navigate to="/events" replace />
  if (loadedFor !== (id ?? 'new')) return <PageSkeleton />
  if (loadError) return <LoadError title={t(editing ? 'form.editTitle' : 'form.newTitle')} back={{to:'/events',label:t('nav.events')}} message={loadError} onRetry={() => setLoadAttempt((n) => n+1)} />
  if (missing) return <Navigate to="/events" replace />
  if (!loaded || !listsReady) return <PageSkeleton />

  // Sensible defaults that follow the start time until the person types their own.
  const shownTitle = titleTouched ? title : t(`eventType.${type}`)
  const shownEnd = endTouched ? endTime : startTime ? shiftClock(startTime, 90) : ''
  const shownMeetup = meetupTouched ? meetupTime : startTime ? shiftClock(startTime, -60) : ''

  const selectedRink = rinks.find((r) => r.id === rinkId) ?? null
  const location = eventLocation({ type, venue }, selectedRink)

  function toggleGroup(groupId: number) {
    setGroupIds((current) => (current.includes(groupId) ? current.filter((x) => x !== groupId) : [...current, groupId]))
  }

  async function save(values: Record<string, unknown>, count: number | null = null) {
    setBusy(true); setError('')
    const total = Math.min(53, Math.max(2, Number(weeks) || 2))
    const { data, error } = await supabase.rpc('save_event', {
      p_event_id: id ?? null, p_changes: values, p_scope: editing ? scope : 'one',
      p_repeat_weeks: !editing && type === 'training' && repeat ? total - 1 : 0,
      p_expected_count: count,
    })
    if (error) setError(errorText(error))
    else { window.dispatchEvent(new Event('attendance-changed')); navigate(`/events/${data as string}`, { replace: true }) }
    setBusy(false)
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (!groupsPending && groupIds.length === 0) return setError(t('form.groupsRequired'))
    const startsAt = italyToIso(date, startTime)
    const endsAt = endIso(date, startTime, shownEnd)
    if (Date.parse(endsAt) - Date.parse(startsAt) > 12 * 3600000) return setError(t('form.tooLong'))
    if (type === 'game' && video.trim() !== '' && !/^https:\/\/\S+$/.test(video.trim())) return setError(t('form.videoInvalid'))
    if(rinkId&&(bookingStart||bookingEnd)&&(!bookingStart||!bookingEnd||!rinkId))return setError(t('booking.invalid'))
    const bookedStart=rinkId&&bookingStart?italyToIso(bookingDate||date,bookingStart):null
    const bookedEnd=rinkId&&bookingEnd?italyToIso(bookingEndDate||bookingDate||date,bookingEnd):null
    if(bookedStart&&bookedEnd&&(Date.parse(bookedEnd)<=Date.parse(bookedStart)||Date.parse(bookedEnd)-Date.parse(bookedStart)>86400000))return setError(t('booking.invalid'))
    const isGame = type === 'game'
    const values = {
      type, title: shownTitle.trim(), starts_at: startsAt, ends_at: endsAt,
      meetup_at: shownMeetup ? meetupIso(date, startTime, shownMeetup) : null,
      venue: location.locked ? null : venue.trim() || null, rink_id: rinkId,
      opponent: isGame ? opponent.trim() || null : null,
      home_away: isGame ? homeAway : null, jersey: isGame ? jersey || null : null,
      video_url: isGame ? video.trim() || null : null,
      group_ids: groupsPending ? [] : groupIds, groups_pending: type === 'training' && groupsPending,
      parent_event_id: parentId, booking_confirmed: bookingConfirmed, booking_starts_at: bookedStart, booking_ends_at: bookedEnd,
      participant_details: participant, observer_details: observer,
    }
    if (editing && scope !== 'one') {
      setBusy(true)
      const { data, error } = await supabase.rpc('event_scope', { p_event_id: id, p_scope: scope })
      if (error) setError(errorText(error))
      else if (!data?.length) setError(t('error.event_scope_changed'))
      else { setPreview(data as ScopedEvent[]); setDraft(values) }
      setBusy(false)
    } else await save(values)
  }

  return (
    <div className="page narrow">
      <PageHeader title={editing ? t('form.editTitle') : t('form.newTitle')} back={editing ? { to: `/events/${id}`, label: t('event.backToEvent') } : { to: '/events', label: t('nav.events') }} />
      {parentId&&<div className="linked-event-note"><p>{t('linked.form',{title:parentTitle||t('linked.event')})}</p><p className="hint">{t('linked.independent')}</p><button type="button" className="secondary" onClick={()=>setParentId(null)}>{t('linked.unlink')}</button></div>}
      <form {...checked(submit)}>
        {!editing && (
          <div className="field">
            <label className="label" htmlFor="event-type">{t('form.type')}</label>
            <select id="event-type" value={type} onChange={e=>{setType(e.target.value as EventType);if(e.target.value!=='training')setGroupsPending(false);if(!['training','game'].includes(e.target.value))setRinkId(null)}}>
              {(['training','game','theory','off_ice','other'] as const).map(x=><option key={x} value={x}>{t(`eventType.${x}`)}</option>)}
            </select>
          </div>
        )}
        <label>
          {t('form.title')}
          <input required maxLength={80} value={shownTitle} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true) }} />
        </label>
        <div className="when-grid">
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
            <input aria-label={t('form.end')} type="time" required value={shownEnd} onChange={(e) => { setEndTime(e.target.value); setEndTouched(true) }} />
            {startTime && shownEnd && shownEnd <= startTime && <span className="hint">{t('form.endNextDay')}</span>}
          </label>
          <label>
            {t('form.meetup')}
            <input type="time" value={shownMeetup} onChange={(e) => { setMeetupTime(e.target.value); setMeetupTouched(true) }} />
          </label>
        </div>
        {!listsReady && (
          <div className="field">
            <span className="label">{t('form.rink')}</span>
            <ChipsSkeleton count={3} />
          </div>
        )}
        {rinks.length > 0 && (
          <div className="field">
            <span className="label">{t('form.rink')}</span>
            <div className="chips wrap">
              {[null, ...rinks].map((r) => (
                <button type="button" key={r?.id ?? 'none'} className={rinkId === (r?.id ?? null) ? 'chip on' : 'chip'} aria-label={r?r.name:t('form.rinkNone')} aria-pressed={rinkId === (r?.id ?? null)} onClick={() => setRinkId(r?.id ?? null)}>
                  {r ? r.name : t('form.rinkNone')}
                </button>
              ))}
            </div>
            <span className="hint">{t('form.rinkHint')}</span>
          </div>
        )}
        <label>
          {t('form.venue')}
          <input name="venue" maxLength={120} value={location.locked ? location.venue : venue} disabled={location.locked} onChange={(e) => setVenue(e.target.value)} aria-describedby={location.locked ? 'rink-address-note' : undefined} />
          {location.locked && <span id="rink-address-note" className="hint">{t('form.rinkAddressUsed')}</span>}
        </label>
        {rinkId!==null&&<fieldset className="booking-fields"><legend>{t('booking.title')}</legend>{bookingReview&&<label className="check"><input type="checkbox" checked={bookingConfirmed} onChange={e=>setBookingConfirmed(e.target.checked)}/>{t('booking.confirm')}</label>}<p className="hint">{t('booking.hint')}</p><div className="when-grid"><label>{t('booking.startDate')}<input type="date" value={bookingDate||date} onChange={e=>setBookingDate(e.target.value)}/></label><label>{t('booking.start')}<input type="time" value={bookingStart} onChange={e=>setBookingStart(e.target.value)}/></label><label>{t('booking.endDate')}<input type="date" value={bookingEndDate||bookingDate||date} onChange={e=>setBookingEndDate(e.target.value)}/></label><label>{t('booking.end')}<input type="time" value={bookingEnd} onChange={e=>setBookingEnd(e.target.value)}/></label></div></fieldset>}
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
                  <button type="button" key={x} className={homeAway === x ? 'chip on' : 'chip'} aria-pressed={homeAway === x} onClick={() => {setHomeAway(x);if(!editing&&x==='away'&&rinkId===club.homeRinkId&&!bookingStart&&!bookingEnd)setRinkId(null)}}>
                    {t(x === 'home' ? 'event.home' : 'event.away')}
                  </button>
                ))}
              </div>
            </div>
            {editing && (
              <>
                <label>
                  {t('form.video')}
                  <input type="url" inputMode="url" autoCapitalize="none" maxLength={300} placeholder="https://" value={video} onChange={(e) => setVideo(e.target.value)} />
                </label>
                <p className="hint">{t('form.videoHint')}</p>
              </>
            )}
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
        <div className="field">
          <span className="label">{t('form.groups')}</span>
          {groupsLocked ? <>
            <p>{groups.map((g) => groupIds.includes(g.id) ? g.name : '').filter(Boolean).join(', ') || t('events.unassigned')}</p>
            <span className="hint">{t(groupsLocked === 'league' ? 'form.groupsLeague' : 'form.groupsEnded')}</span>
          </> : <>
            {type === 'training' && <label className="check"><input type="checkbox" checked={groupsPending} onChange={(e) => setGroupsPending(e.target.checked)} />{t('form.assignLater')}</label>}
            {groupsPending && type === 'training' ? <p className="hint">{t('form.assignLaterHelp')}</p> : <>
              {listsReady ? <div className="chips wrap">{groups.map((g) => <button type="button" key={g.id} className={groupIds.includes(g.id) ? 'chip on' : 'chip'} aria-label={g.name} aria-pressed={groupIds.includes(g.id)} onClick={() => toggleGroup(g.id)}>{g.name}</button>)}</div> : <ChipsSkeleton />}
              <span className="hint">{t('form.groupsConsultation')}</span>
            </>}
          </>}
        </div>
        {!editing && !parentId && type === 'training' && <div className="field">
          <label className="check"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />{t('form.repeat')}</label>
          {repeat && <label>{t('form.repeatWeeks')}<input type="number" inputMode="numeric" min={2} max={53} value={weeks} onChange={(e) => setWeeks(e.target.value)} /><span className="hint">{t('form.repeatHint')}</span></label>}
        </div>}
        <EventVisibility activity={type} game={type === 'game'} participant={participant} observer={observer} onParticipant={setParticipant} onObserver={setObserver} />
        {editing && inSeries && <EventScopeSelect value={scope} onChange={setScope} disabled={busy} />}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{editing ? t('common.save') : t('form.create')}</button>
      </form>
      <ConfirmDialog open={draft !== null} title={t('series.confirmTitle')} body={t('series.changes', { title: shownTitle, summary: scopeSummary(preview) })}
        busy={busy} closeOnChoose={false} choiceClassName="" onClose={() => { if (!busy) setDraft(null) }}
        choices={[{ label: t('series.save'), onChoose: () => { if (draft) void save(draft, preview.length) } }]}>
        {error && <p className="error" role="alert">{error}</p>}
      </ConfirmDialog>
    </div>
  )
}
