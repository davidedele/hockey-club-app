import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { errorText, t, type MessageKey } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/time'
import type { EventRow, LineupCandidate, LineupPlace, LineupSlot } from '../lib/types'

// The line-up of one event: two goalies, three defence pairs and four forward lines.
// Staff tap a place and pick somebody the event is shown to. Everybody else reads it.

type Place = { slot: LineupSlot; unit: number }
type Unit = { key: string; title: string; places: Place[] }

function units(): { key: string; heading: MessageKey; units: Unit[] }[] {
  const line = (slots: LineupSlot[], unit: number) => slots.map((slot) => ({ slot, unit }))
  return [
    {
      key: 'goalies',
      heading: 'lineup.goalies',
      units: [{ key: 'g', title: '', places: line(['goalie'], 1).concat(line(['goalie'], 2)) }],
    },
    {
      key: 'defence',
      heading: 'lineup.defence',
      units: [1, 2, 3].map((n) => ({
        key: `d${n}`,
        title: t('lineup.pair', { n: String(n) }),
        places: line(['left_defence', 'right_defence'], n),
      })),
    },
    {
      key: 'forwards',
      heading: 'lineup.forwards',
      units: [1, 2, 3, 4].map((n) => ({
        key: `f${n}`,
        title: t('lineup.line', { n: String(n) }),
        places: line(['left_wing', 'centre', 'right_wing'], n),
      })),
    },
  ]
}

export default function Lineup() {
  const { id = '' } = useParams()
  const { isStaff } = useSession()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [places, setPlaces] = useState<LineupPlace[]>([])
  const [people, setPeople] = useState<LineupCandidate[]>([])
  const [picking, setPicking] = useState<Place | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [e, l] = await Promise.all([
      supabase.from('events').select('*, event_groups(group_id)').eq('id', id).maybeSingle(),
      // The table points at profiles twice, through the player and through whoever set the place,
      // so the player has to be named here.
      supabase.from('event_lineup').select('slot, unit, user_id, profiles:user_id(first_name, last_name, jersey_number)').eq('event_id', id),
    ])
    setEvent((e.data as EventRow | null) ?? null)
    setPlaces((l.data ?? []) as unknown as LineupPlace[])
    if (isStaff) {
      const c = await supabase.rpc('lineup_candidates', { p_event_id: id })
      setPeople((c.data ?? []) as LineupCandidate[])
    }
    setLoaded(true)
  }, [id, isStaff])

  useEffect(() => {
    void load()
  }, [load])

  if (loaded && !event) return <Navigate to="/events" replace />
  if (!event) return <p className="center">{t('common.loading')}</p>

  const over = new Date(event.ends_at).getTime() < Date.now()
  const cancelled = event.cancelled_at !== null
  const canEdit = isStaff && !over && !cancelled
  const held = (p: Place) => places.find((x) => x.slot === p.slot && x.unit === p.unit) ?? null
  const placeLabel = (p: Place) =>
    p.slot === 'goalie' ? t('lineup.goalieN', { n: String(p.unit) }) : t(`slot.${p.slot}` as MessageKey)

  async function choose(place: Place, userId: string | null) {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('set_lineup_place', {
      p_event_id: id,
      p_slot: place.slot,
      p_unit: place.unit,
      p_user_id: userId,
    })
    if (error) setError(errorText(error))
    setPicking(null)
    await load()
    setBusy(false)
  }

  function personName(x: { first_name: string; last_name: string }) {
    return `${x.last_name} ${x.first_name}`
  }

  function placeButton(p: Place) {
    const row = held(p)
    const who = row?.profiles
    const shown = who ? `${who.last_name} ${who.first_name.charAt(0)}.` : t('lineup.free')
    const open = picking?.slot === p.slot && picking?.unit === p.unit
    const inside = (
      <>
        <span className="where">{placeLabel(p)}</span>
        <span className={who ? 'who' : 'who free'}>{shown}</span>
      </>
    )
    if (!canEdit) return <div className="place" key={`${p.slot}${p.unit}`}>{inside}</div>
    return (
      <button
        type="button"
        key={`${p.slot}${p.unit}`}
        className={open ? 'place on' : 'place'}
        aria-label={`${placeLabel(p)}: ${who ? personName(who) : t('lineup.free')}`}
        aria-expanded={open}
        disabled={busy}
        onClick={() => setPicking(open ? null : p)}
      >
        {inside}
      </button>
    )
  }

  // Everybody the event is for, minus whoever already holds another place.
  const taken = new Set(places.map((x) => x.user_id))
  const here = picking ? held(picking) : null
  const free = people.filter((x) => !taken.has(x.user_id) || x.user_id === here?.user_id)
  const present = free.filter((x) => x.answer === 'present')
  const others = free.filter((x) => x.answer !== 'present')

  function pickList(place: Place, list: LineupCandidate[]) {
    return (
      <div className="chips wrap">
        {list.map((x) => (
          <button type="button" key={x.user_id} className="chip" disabled={busy} onClick={() => void choose(place, x.user_id)}>
            {x.jersey_number !== null ? `${x.jersey_number} ` : ''}{personName(x)}
            {x.answer === 'absent' ? ` (${t('answer.absent').toLowerCase()})` : ''}
            {x.answer === null ? ` (${t('lineup.noAnswer')})` : ''}
          </button>
        ))}
      </div>
    )
  }

  // The chooser opens under the line, pair or goal that was tapped, so the coach keeps the context.
  function picker(place: Place) {
    return (
      <div className="box" role="group" aria-label={t('lineup.pick', { place: placeLabel(place) })}>
        <h3>{t('lineup.pick', { place: placeLabel(place) })}</h3>
        {present.length > 0 && <p className="hint">{t('lineup.said')}</p>}
        {pickList(place, present)}
        {others.length > 0 && <p className="hint">{t('lineup.rest')}</p>}
        {pickList(place, others)}
        {free.length === 0 && <p className="hint">{t('lineup.nobodyLeft')}</p>}
        <div className="actions">
          {here && <button type="button" className="secondary small" disabled={busy} onClick={() => void choose(place, null)}>{t('lineup.clear')}</button>}
          <button type="button" className="link" disabled={busy} onClick={() => setPicking(null)}>{t('common.cancel')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <p><Link to={`/events/${id}`}>{t('lineup.back')}</Link></p>
      <h1>{t('lineup.title')}</h1>
      <p className="hint">{event.title}, {formatDay(event.starts_at)} {formatTime(event.starts_at)}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {canEdit && <p className="hint">{t('lineup.help')}</p>}
      {isStaff && over && <p className="hint">{t('lineup.overHint')}</p>}
      {isStaff && cancelled && <p className="hint">{t('lineup.cancelledHint')}</p>}
      {!isStaff && places.length === 0 && <p className="hint">{t('lineup.empty')}</p>}

      {units().map((section) => (
        <section key={section.key}>
          <h2>{t(section.heading)}</h2>
          {section.units.map((u) => (
            <div className="lineup-unit" key={u.key}>
              {u.title && <h3>{u.title}</h3>}
              <div className="places">{u.places.map(placeButton)}</div>
              {picking && u.places.some((p) => p.slot === picking.slot && p.unit === picking.unit) && picker(picking)}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
