import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { errorText, t, type MessageKey } from '../i18n'
import { useGroupFilter } from '../lib/groupfilter'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { downloadCsv } from '../lib/table'
import OutputAction from '../components/OutputAction'
import { dayKey, dayParts, formatMonth, italyToIso } from '../lib/time'
import type { Group } from '../lib/types'

interface GridRow {
  event_id: string
  starts_at: string
  title: string
  type: 'training' | 'game'
  cancelled: boolean
  user_id: string
  first_name: string
  last_name: string
  answer: 'present' | 'absent' | null
  status: 'on_time' | 'late' | 'excused' | 'unexcused' | 'injured' | 'not_called_up' | null
}

interface EventColumn { id: string; starts_at: string; title: string; type: 'training' | 'game'; cancelled: boolean }

const STATUSES = ['on_time', 'late', 'excused', 'unexcused', 'injured', 'not_called_up'] as const
const ANSWERS = ['present', 'absent'] as const

function monthOf(iso: string) {
  return dayKey(iso).slice(0, 7)
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

// One group and one month: every member by every event, for coaches and the board.
export default function AttendanceGrid({ embedded = false }: { embedded?: boolean }) {
  const { isStaff } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const { groupId: chosen } = useGroupFilter()
  // The grid is for one group: the one chosen in the switcher, or the first.
  const groupId = chosen ?? groups[0]?.id ?? null
  const [month, setMonth] = useState(() => monthOf(new Date().toISOString()))
  const [rows, setRows] = useState<GridRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('groups').select('*').order('id')
      const list = (data ?? []) as Group[]
      setGroups(list)
    })()
  }, [])

  useEffect(() => {
    if (groupId === null) return
    setLoaded(false)
    void (async () => {
      const from = italyToIso(`${month}-01`, '00:00')
      const to = italyToIso(`${shiftMonth(month, 1)}-01`, '00:00')
      const { data, error } = await supabase.rpc('attendance_grid', { p_group_id: groupId, p_from: from, p_to: to })
      if (error) setError(errorText(error))
      else setError('')
      setRows((data ?? []) as GridRow[])
      setLoaded(true)
    })()
  }, [groupId, month])

  const { events, people, cells } = useMemo(() => {
    const eventMap = new Map<string, EventColumn>()
    const peopleMap = new Map<string, { id: string; name: string }>()
    const cellMap = new Map<string, GridRow>()
    for (const r of rows) {
      eventMap.set(r.event_id, { id: r.event_id, starts_at: r.starts_at, title: r.title, type: r.type, cancelled: r.cancelled })
      peopleMap.set(r.user_id, { id: r.user_id, name: `${r.last_name} ${r.first_name}` })
      cellMap.set(`${r.event_id}:${r.user_id}`, r)
    }
    return { events: [...eventMap.values()], people: [...peopleMap.values()], cells: cellMap }
  }, [rows])

  if (!isStaff) return <Navigate to="/events" replace />

  const monthStart = italyToIso(`${month}-01`, '00:00')

  function symbol(r: GridRow | undefined): { short: string; label: string } {
    if (!r) return { short: '', label: '' }
    if (r.status) return { short: t(`grid.s.${r.status}` as MessageKey), label: t(`status.${r.status}` as MessageKey) }
    if (r.answer) return { short: t(`grid.a.${r.answer}` as MessageKey), label: t(`answer.${r.answer}` as MessageKey) }
    return { short: t('grid.none'), label: t('grid.noneLabel') }
  }

  function exportGrid() {
    downloadCsv(`presenze-${month}`, [
      [t('summary.player'), ...events.map((e) => `${dayKey(e.starts_at)} ${e.title}${e.cancelled ? ` (${t('grid.cancelled')})` : ''}`)],
      ...people.map((p) => [p.name, ...events.map((e) => (e.cancelled ? '' : symbol(cells.get(`${e.id}:${p.id}`)).label))]),
    ])
  }

  return (
    <div className={embedded ? undefined : 'page wide'}>
      <p className="hint tab-intro">{t('grid.intro')} {t('att.groupNote', { group: groups.find((g) => g.id === groupId)?.name ?? '' })}</p>
      <div className="monthbar">
        <button className="chip" onClick={() => setMonth(shiftMonth(month, -1))}>{t('grid.prev')}</button>
        <strong aria-live="polite">{formatMonth(monthStart)}</strong>
        <button className="chip" onClick={() => setMonth(shiftMonth(month, 1))}>{t('grid.next')}</button>
        <OutputAction kind="print" label={t('table.print')} onRun={() => window.print()} />
        <OutputAction kind="csv" label={t('table.export')} rows={people.length} disabled={events.length === 0 || people.length === 0} onRun={exportGrid} />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && !error && events.length === 0 && <p className="hint">{t('grid.empty')}</p>}
      {loaded && !error && events.length > 0 && people.length === 0 && <p className="hint">{t('grid.noMembers')}</p>}
      {events.length > 0 && people.length > 0 && (
        <>
          <p className="hint">{t('summary.scrollHint')}</p>
          <div className="scroll">
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col">{t('summary.player')}</th>
                  {events.map((e) => {
                    const p = dayParts(e.starts_at)
                    return (
                      <th scope="col" key={e.id} className={e.cancelled ? 'cancelled' : undefined} title={e.title}>
                        <span>{p.num}</span>
                        <span className="dow">{p.dow}</span>
                        <span className="dow">{t(`eventType.${e.type}` as MessageKey).slice(0, 4)}</span>
                        {e.cancelled && <span className="dow">{t('grid.cancelled')}</span>}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}</th>
                    {events.map((e) => {
                      const s = symbol(cells.get(`${e.id}:${p.id}`))
                      return (
                        <td key={e.id} className={e.cancelled ? 'cancelled' : undefined} aria-label={s.label} title={s.label}>{e.cancelled ? '' : s.short}</td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>{t('grid.legend')}</h2>
          <p className="hint">{t('grid.legendIntro')}</p>
          <ul className="legend">
            {STATUSES.map((s) => <li key={s}><strong>{t(`grid.s.${s}` as MessageKey)}</strong> {t(`status.${s}` as MessageKey)}</li>)}
            {ANSWERS.map((a) => <li key={a}><strong>{t(`grid.a.${a}` as MessageKey)}</strong> {t(`grid.answerOf.${a}` as MessageKey)}</li>)}
            <li><strong>{t('grid.none')}</strong> {t('grid.noneLabel')}</li>
          </ul>
        </>
      )}
    </div>
  )
}
