import { PageSkeleton } from '../components/Skeleton'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/time'
import type { Drill, EventPlan, EventRow, PlanDrill } from '../lib/types'

const LINK_SECONDS = 600

// The plan of one training: the coach's words and the drills in order. Players read it before
// they go on the ice, and afterwards only if the coach left it up.
export default function Plan({ embedded = false }: { embedded?: boolean }) {
  const { id = '' } = useParams()
  const { isStaff } = useSession()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [plan, setPlan] = useState<EventPlan | null>(null)
  const [rows, setRows] = useState<PlanDrill[]>([])
  const [library, setLibrary] = useState<Drill[]>([])
  const [links, setLinks] = useState<Map<string, string>>(new Map())
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState(0)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [e, p, d] = await Promise.all([
      supabase.from('events').select('*, event_groups(group_id)').eq('id', id).maybeSingle(),
      supabase.from('event_plan').select('event_id, notes, visible_after').eq('event_id', id).maybeSingle(),
      supabase.from('event_plan_drills').select('*, drills(*)').eq('event_id', id).order('step'),
    ])
    const planRow = (p.data as EventPlan | null) ?? null
    const list = (d.data ?? []) as unknown as PlanDrill[]
    setEvent((e.data as EventRow | null) ?? null)
    setPlan(planRow)
    setRows(list)
    setNotes(planRow?.notes ?? '')
    if (isStaff) {
      const all = await supabase.from('drills').select('*').order('title')
      setLibrary((all.data ?? []) as Drill[])
    }
    const paths = list.map((x) => x.drills?.file_path).filter((x): x is string => Boolean(x))
    if (paths.length) {
      const { data } = await supabase.storage.from('drills').createSignedUrls(paths, LINK_SECONDS)
      setLinks(new Map(((data ?? []) as { path: string | null; signedUrl: string }[])
        .filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl])))
    }
    setLoaded(true)
  }, [id, isStaff])

  useEffect(() => {
    void load()
  }, [load])

  if (loaded && !event) return <Navigate to="/events" replace />
  if (!event) return <PageSkeleton />

  async function write(values: { notes?: string | null; visible_after?: boolean }) {
    setBusy(true)
    setError('')
    const merged = { notes: plan?.notes ?? null, visible_after: plan?.visible_after ?? false, ...values }
    let { data, error } = await supabase.from('event_plan').update(merged).eq('event_id', id).select()
    if (!error && (!data || data.length === 0)) {
      ;({ data, error } = await supabase.from('event_plan').insert({ event_id: id, ...merged }).select())
    }
    if (error || !data || data.length === 0) setError(errorText(error ?? { message: 'forbidden' }))
    await load()
    setBusy(false)
  }

  async function saveNotes(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    await write({ notes: notes.trim() || null })
    setSaved(true)
  }

  async function addDrill(drillId: string) {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('add_plan_drill', { p_event_id: id, p_drill_id: drillId })
    if (error) setError(errorText(error))
    setAdding(false)
    await load()
    setBusy(false)
  }

  async function move(rowId: string, up: boolean) {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('move_plan_drill', { p_id: rowId, p_up: up })
    if (error) setError(errorText(error))
    await load()
    setBusy(false)
  }

  async function removeRow(rowId: string) {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.from('event_plan_drills').delete().eq('id', rowId).select()
    if (error || !data || data.length === 0) setError(errorText(error ?? { message: 'forbidden' }))
    await load()
    setBusy(false)
  }

  async function setMinutes(rowId: string, value: string) {
    const minutes = value === '' ? null : Number(value)
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)) {
      // Say so and put the saved number back, instead of leaving a number that was not kept.
      setError(t('plan.minutesInvalid'))
      setReset((n) => n + 1)
      return
    }
    setBusy(true)
    setError('')
    const { error } = await supabase.from('event_plan_drills').update({ minutes }).eq('id', rowId).select()
    if (error) setError(errorText(error))
    await load()
    setBusy(false)
  }

  const over = new Date(event.ends_at).getTime() < Date.now()
  const total = rows.reduce((sum, r) => sum + (r.minutes ?? 0), 0)
  const inPlan = new Set(rows.map((r) => r.drill_id))

  return (
    <div className={embedded ? undefined : 'page narrow'}>
      {!embedded && <p><Link to={`/events/${id}`}>{t('plan.back')}</Link></p>}
      {!embedded && <h1>{t('plan.title')}</h1>}
      {!embedded && <p className="hint">{event.title}, {formatDay(event.starts_at)} {formatTime(event.starts_at)}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {isStaff ? (
        <>
          <form onSubmit={saveNotes}>
            <label>
              {t('plan.notes')}
              <textarea value={notes} maxLength={2000} rows={4} onChange={(e) => { setNotes(e.target.value); setSaved(false) }} />
              <span className="hint">{t('plan.notesHint')}</span>
            </label>
            <button type="submit" className="secondary" disabled={busy || notes === (plan?.notes ?? '')}>{t('common.save')}</button>
            {saved && <span className="hint" role="status"> {t('common.saved')}</span>}
          </form>
          <label className="check">
            <input
              type="checkbox"
              checked={plan?.visible_after ?? false}
              disabled={busy}
              onChange={(e) => void write({ visible_after: e.target.checked })}
            />
            {t('plan.visibleAfter')}
          </label>
          <p className="hint">{over ? t('plan.visibleAfterOver') : t('plan.visibleAfterHint')}</p>
        </>
      ) : (
        <>
          {plan?.notes && <p className="ann-body">{plan.notes}</p>}
          {loaded && !plan && rows.length === 0 && <p className="hint">{t('plan.empty')}</p>}
        </>
      )}

      <h2>{t('plan.drills')}{total > 0 ? ` (${t('plan.minutes', { n: String(total) })})` : ''}</h2>
      {rows.length === 0 && <p className="hint">{isStaff ? t('plan.noneYet') : t('plan.empty')}</p>}
      <ol className="plan-list">
        {rows.map((r, i) => {
          const drill = r.drills
          const link = drill?.file_path ? links.get(drill.file_path) : undefined
          return (
            <li key={r.id} className="ann">
              <h3>{drill?.title ?? ''}</h3>
              {drill?.notes && <p className="ann-body">{drill.notes}</p>}
              <div className="actions">
                {link && <a href={link} target="_blank" rel="noopener noreferrer">{t('drills.open')}</a>}
                {drill?.video_url && <a className="inline-action" href={drill.video_url} target="_blank" rel="noopener noreferrer">{t('drills.watch')}</a>}
                {!isStaff && r.minutes !== null && <span className="hint">{t('plan.minutes', { n: String(r.minutes) })}</span>}
              </div>
              {isStaff && (
                <div className="actions">
                  <label className="plan-minutes">
                    {t('plan.howLong')}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={180}
                      key={`${r.id}-${reset}`}
                      defaultValue={r.minutes ?? ''}
                      disabled={busy}
                      onBlur={(e) => void setMinutes(r.id, e.target.value)}
                    />
                  </label>
                  <button type="button" className="secondary small" disabled={busy || i === 0} onClick={() => void move(r.id, true)}>{t('plan.up')}</button>
                  <button type="button" className="secondary small" disabled={busy || i === rows.length - 1} onClick={() => void move(r.id, false)}>{t('plan.down')}</button>
                  <button type="button" className="link" disabled={busy} onClick={() => void removeRow(r.id)}>{t('plan.remove')}</button>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {isStaff && (
        <div className="actions spaced">
          <button type="button" disabled={busy} onClick={() => setAdding(!adding)}>{t('plan.add')}</button>
          <Link className="button secondary small" to="/drills">{t('plan.library')}</Link>
        </div>
      )}
      {isStaff && adding && (
        <div className="box" role="group" aria-label={t('plan.add')}>
          {library.length === 0 && <p className="hint">{t('plan.libraryEmpty')}</p>}
          <div className="chips wrap">
            {library.map((d) => (
              <button type="button" key={d.id} className="chip" disabled={busy} onClick={() => void addDrill(d.id)}>
                {d.title}{inPlan.has(d.id) ? ` (${t('plan.alreadyIn')})` : ''}
              </button>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="link" disabled={busy} onClick={() => setAdding(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
