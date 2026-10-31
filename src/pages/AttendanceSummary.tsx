import TableScroll from '../components/TableScroll'
import { useEffect, useMemo, useState } from 'react'
import SortHeader from '../components/SortHeader'
import TablePager from '../components/TablePager'
import { errorText, t, type MessageKey } from '../i18n'
import { useGroupFilter } from '../lib/groupfilter'
import { supabase } from '../lib/supabase'
import { downloadCsv, pageOf, sortRows, useSort, type Cell } from '../lib/table'
import OutputAction from '../components/OutputAction'
import { italyToIso, seasonLabel, seasonOf } from '../lib/time'
import type { SummaryRow } from '../lib/types'

type Row = SummaryRow & { position: string | null }
type Group = 'answers' | 'present' | 'absent' | 'other'
interface Column { key: string; label: MessageKey; group: Group | 'calls' | 'percent'; get: (r: Row) => number | null }

const presentTotal = (r: Row) => Number(r.on_time) + Number(r.late)
const absentTotal = (r: Row) => Number(r.excused) + Number(r.unexcused)
// Of the events a person was called to, the share they came to. Nothing to say if they were never called.
const percent = (r: Row): number | null => {
  const called = Number(r.events_total) - Number(r.not_called_up)
  return called > 0 ? Math.round((presentTotal(r) * 100) / called) : null
}

const COLUMNS: Column[] = [
  { key: 'events_total', label: 'summary.events_total', group: 'calls', get: (r) => Number(r.events_total) - Number(r.not_called_up) },
  { key: 'answered_present', label: 'summary.answered_present', group: 'answers', get: (r) => Number(r.answered_present) },
  { key: 'answered_absent', label: 'summary.answered_absent', group: 'answers', get: (r) => Number(r.answered_absent) },
  { key: 'no_answer', label: 'summary.no_answer', group: 'answers', get: (r) => Number(r.no_answer) },
  { key: 'on_time', label: 'summary.on_time', group: 'present', get: (r) => Number(r.on_time) },
  { key: 'late', label: 'summary.late', group: 'present', get: (r) => Number(r.late) },
  { key: 'present_total', label: 'att.total', group: 'present', get: presentTotal },
  { key: 'excused', label: 'summary.excused', group: 'absent', get: (r) => Number(r.excused) },
  { key: 'unexcused', label: 'summary.unexcused', group: 'absent', get: (r) => Number(r.unexcused) },
  { key: 'absent_total', label: 'att.total', group: 'absent', get: absentTotal },
  { key: 'injured', label: 'summary.injured', group: 'other', get: (r) => Number(r.injured) },
  { key: 'not_called_up', label: 'summary.not_called_up', group: 'other', get: (r) => Number(r.not_called_up) },
  { key: 'percent', label: 'att.percent', group: 'percent', get: percent },
]
const GROUPS: { key: Group; label: MessageKey }[] = [
  { key: 'answers', label: 'att.groupAnswers' },
  { key: 'present', label: 'att.groupPresent' },
  { key: 'absent', label: 'att.groupAbsent' },
  { key: 'other', label: 'att.groupOther' },
]
const FIRST_SEASON = 2026

// Finished events per player: what players answered and what staff recorded, for a group, a period
// and a kind of event. Coaches and the board only (the database refuses everybody else).
export default function AttendanceSummary() {
  const { groupId, groups } = useGroupFilter()
  const current = seasonOf(new Date().toISOString())
  const seasons = Array.from({ length: Math.max(1, current - FIRST_SEASON + 1) }, (_, i) => current - i)
  const [period, setPeriod] = useState<'season' | 'last30'>('season')
  const [season, setSeason] = useState(current)
  const [type, setType] = useState<'' | 'training' | 'game'>('')
  const [role, setRole] = useState('')
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const sort = useSort<string>('name')

  useEffect(() => {
    setLoaded(false)
    void (async () => {
      const from = period === 'last30' ? new Date(Date.now() - 30 * 86400000).toISOString() : italyToIso(`${season}-09-01`, '00:00')
      const to = period === 'last30' ? null : italyToIso(`${season + 1}-09-01`, '00:00')
      const { data, error } = await supabase.rpc('attendance_summary', { p_from: from, p_to: to, p_group_id: groupId, p_type: type || null })
      if (error) setError(errorText(error))
      else setError('')
      setRows((data ?? []) as Row[])
      setLoaded(true)
      setPage(1)
    })()
  }, [period, season, type, groupId])

  const q = query.trim().toLowerCase()
  const shown = useMemo(() => {
    const kept = rows.filter((r) => (role === '' || r.position === role) && (q === '' || `${r.last_name} ${r.first_name}`.toLowerCase().includes(q) || `${r.first_name} ${r.last_name}`.toLowerCase().includes(q)))
    const col = COLUMNS.find((c) => c.key === sort.key)
    const get = (r: Row): Cell => (col ? col.get(r) : `${r.last_name} ${r.first_name}`)
    return sortRows(kept, get, sort.dir)
  }, [rows, role, q, sort.key, sort.dir])
  const visible = pageOf(shown, page, size)
  const groupName = groupId === null ? t('group.all') : groups.find((g) => g.id === groupId)?.name ?? ''

  function exportCsv() {
    downloadCsv(`presenze-${period === 'last30' ? 'ultimi-30-giorni' : seasonLabel(season).replace('/', '-')}`, [
      [t('summary.player'), ...COLUMNS.map((c) => (c.label === 'att.total' ? `${t('att.total')} ${t(c.group === 'present' ? 'att.groupPresent' : 'att.groupAbsent')}` : t(c.label)))],
      ...shown.map((r) => [`${r.last_name} ${r.first_name}`, ...COLUMNS.map((c) => c.get(r))]),
    ])
  }

  const groupCount = (g: Group) => COLUMNS.filter((c) => c.group === g).length
  const middle = COLUMNS.filter((c) => c.group !== 'calls' && c.group !== 'percent')
  // Each colour group starts with a dividing line, and its total is bold, so the eye finds the blocks.
  const cellClass = (c: Column, i: number) => [
    `g-${c.group}`,
    i === 0 || middle[i - 1].group !== c.group ? 'g-start' : '',
    c.key.endsWith('_total') ? 'g-total' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <p className="hint tab-intro">{t('summary.intro')} {t('att.groupNote', { group: groupName })}</p>
      <div className="att-filters">
        <label className="cal-field"><span>{t('att.period')}</span>
          <select value={period === 'last30' ? 'last30' : String(season)} onChange={(e) => { if (e.target.value === 'last30') setPeriod('last30'); else { setPeriod('season'); setSeason(Number(e.target.value)) } }}>
            {seasons.map((s) => <option key={s} value={s}>{t('cal.seasonOf', { season: seasonLabel(s) })}</option>)}
            <option value="last30">{t('summary.last30')}</option>
          </select>
        </label>
        <label className="cal-field"><span>{t('att.type')}</span>
          <select value={type} onChange={(e) => setType(e.target.value as '' | 'training' | 'game')}>
            <option value="">{t('att.typeAll')}</option>
            <option value="training">{t('att.typeTraining')}</option>
            <option value="game">{t('att.typeGame')}</option>
          </select>
        </label>
        <label className="cal-field"><span>{t('att.role')}</span>
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
            <option value="">{t('att.roleAll')}</option>
            <option value="goalie">{t('position.goalie')}</option>
            <option value="defence">{t('position.defence')}</option>
            <option value="forward">{t('position.forward')}</option>
          </select>
        </label>
        <label className="cal-field"><span>{t('att.search')}</span>
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
        </label>
        <div className="att-actions">
          <OutputAction kind="print" label={t('table.print')} onRun={() => window.print()} />
          <OutputAction kind="csv" label={t('table.export')} rows={shown.length} disabled={shown.length === 0} onRun={exportCsv} />
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && !error && rows.length === 0 && <p className="hint">{t('summary.empty')}</p>}
      {rows.length > 0 && <p className="hint" role="status">{t('att.players', { n: String(shown.length) })}</p>}
      {rows.length > 0 && (
        <>
          <TableScroll variant="table-wrap">
            <table className="att-table">
              <thead>
                <tr>
                  <th scope="col" rowSpan={2} className="att-name" aria-sort={sort.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button className="sort" onClick={() => { sort.toggle('name'); setPage(1) }} aria-label={`${t('table.sortBy')} ${t('summary.player')}`}>{t('summary.player')}{sort.key === 'name' ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
                  </th>
                  <SortHeader label={t('att.calls')} rowSpan={2} className="g-calls" active={sort.key === 'events_total'} dir={sort.dir} onSort={() => { sort.toggle('events_total'); setPage(1) }} />
                  {GROUPS.map((g) => <th key={g.key} scope="colgroup" colSpan={groupCount(g.key)} className={`g-${g.key} g-start g-head`}>{t(g.label)}</th>)}
                  <SortHeader label={t('att.percent')} rowSpan={2} className="g-percent" active={sort.key === 'percent'} dir={sort.dir} onSort={() => { sort.toggle('percent'); setPage(1) }} />
                </tr>
                <tr>
                  {middle.map((c, i) => (
                    <SortHeader key={`${c.key}${i}`} label={t(c.label)} active={sort.key === c.key} dir={sort.dir} onSort={() => { sort.toggle(c.key); setPage(1) }} className={cellClass(c, i)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.user_id}>
                    <th scope="row" className="att-name">{r.last_name} {r.first_name}</th>
                    <td className="g-calls">{Number(r.events_total) - Number(r.not_called_up)}</td>
                    {middle.map((c, i) => {
                      const v = c.get(r)
                      return <td key={c.key + c.group} className={`${cellClass(c, i)}${v === 0 ? ' zero' : ''}`}>{v === 0 ? '\u2013' : v}</td>
                    })}
                    <td className="g-percent g-start">{percent(r) === null ? '\u2013' : `${percent(r)}%`}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={COLUMNS.length + 1} className="hint">{t('cal.none')}</td></tr>}
              </tbody>
            </table>
          </TableScroll>
          <TablePager total={shown.length} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />
        </>
      )}
    </>
  )
}
