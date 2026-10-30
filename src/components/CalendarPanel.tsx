import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { t, type MessageKey } from '../i18n'
import { downloadCsv, pageOf, sortRows, useSort, type Cell } from '../lib/table'
import { addDays, dayKey, formatDay, formatMonth, formatShortDay, formatTime, seasonLabel, seasonOf, weekOf } from '../lib/time'
import type { Answer, EventRow } from '../lib/types'
import SortHeader from './SortHeader'
import OutputAction from './OutputAction'
import TablePager from './TablePager'

type View = 'week' | 'month' | 'list'
type Cat = 'training' | 'friendly' | 'league'
type ListKey = 'date' | 'event' | 'place' | 'answer'
type Scope = 'upcoming' | 'past' | 'all'

const CATS: Cat[] = ['training', 'friendly', 'league']
const FIRST_SEASON = 2026
const MAX_PER_DAY = 3
const catOf = (e: EventRow): Cat => (e.type === 'training' ? 'training' : e.league_match_id !== null ? 'league' : 'friendly')

// The calendar of the computer layout: a week, a month or a list, with the types of event to show,
// a search, the season, and print and export.
export default function CalendarPanel(props: {
  events: EventRow[]
  answers: Map<string, Answer>
  isStaff: boolean
  clubName: string
  groupName: (e: EventRow) => string
  weekShift: number
  weekLabel: string
  onWeekShift: (shift: number) => void
  renderWeek: (query: string, keep: (e: EventRow) => boolean) => ReactNode
}) {
  const { events, answers, isStaff, clubName, groupName, weekShift, onWeekShift } = props
  const today = dayKey(new Date().toISOString())
  const currentSeason = seasonOf(new Date().toISOString())
  const seasons = Array.from({ length: Math.max(1, currentSeason - FIRST_SEASON + 1) }, (_, i) => currentSeason - i)
  const [view, setView] = useState<View>('week')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [season, setSeason] = useState(currentSeason)
  const [types, setTypes] = useState<Set<Cat>>(new Set(CATS))
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(25)
  const sort = useSort<ListKey>('date')
  // The list opens on what is still to come, so the next event is the first row.
  const [scope, setScope] = useState<Scope>('upcoming')

  const title = (e: EventRow) => (e.type === 'game' && e.opponent ? t('events.vs', { club: clubName, opponent: e.opponent }) : e.title)
  const typeName = (c: Cat) => t(`cal.${c}` as MessageKey)
  const text = query.trim().toLowerCase()
  const keep = (e: EventRow) => types.has(catOf(e)) && (text === '' || [title(e), e.venue ?? '', e.opponent ?? ''].some((x) => x.toLowerCase().includes(text)))

  const inSeason = useMemo(() => events.filter((e) => seasonOf(e.starts_at) === season), [events, season])
  const counts = useMemo(() => {
    const c: Record<Cat, number> = { training: 0, friendly: 0, league: 0 }
    for (const e of inSeason) c[catOf(e)] += 1
    return c
  }, [inSeason])

  function toggleType(c: Cat) {
    setTypes((current) => {
      const next = new Set(current)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
    setPage(1)
  }
  const allTypes = types.size === CATS.length

  // The week and the month shown follow the season picked: this one starts today, an earlier one on 1 September.
  function pickSeason(s: number) {
    setSeason(s)
    setPage(1)
    setScope(s === currentSeason ? 'upcoming' : 'all')
    sort.set('date', 'asc')
    const start = s === currentSeason ? today : `${s}-09-01`
    setMonth(start.slice(0, 7))
    const monday = (d: string) => weekOf(`${d}T12:00:00Z`)[0].date
    onWeekShift(Math.round((Date.parse(monday(start)) - Date.parse(monday(today))) / (7 * 86400000)))
  }

  function weekOfDate(date: string) {
    const monday = (d: string) => weekOf(`${d}T12:00:00Z`)[0].date
    onWeekShift(Math.round((Date.parse(monday(date)) - Date.parse(monday(today))) / (7 * 86400000)))
    setView('week')
  }

  // Month grid: whole weeks, Monday first.
  const cells = useMemo(() => {
    const first = `${month}-01`
    const start = weekOf(`${first}T12:00:00Z`)[0].date
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const last = `${month}-${String(lastDay).padStart(2, '0')}`
    const end = weekOf(`${last}T12:00:00Z`)[6].date
    const days: string[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
    return days
  }, [month])
  const shiftMonth = (by: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + by, 1))
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const byDay = useMemo(() => {
    const map = new Map<string, EventRow[]>()
    for (const e of events.filter(keep)) {
      const k = dayKey(e.starts_at)
      map.set(k, [...(map.get(k) ?? []), e])
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, types, text])

  // The list: the events of the season, sorted and in pages.
  const answerText = (e: EventRow) => (answers.has(e.id) ? t(`answer.${answers.get(e.id)}` as MessageKey) : '')
  const listRows = useMemo(() => {
    const get = (e: EventRow): Cell => (sort.key === 'date' ? e.starts_at : sort.key === 'event' ? title(e) : sort.key === 'place' ? e.venue : answerText(e))
    const inScope = (e: EventRow) => scope === 'all' || (scope === 'upcoming' ? dayKey(e.starts_at) >= today : dayKey(e.starts_at) < today)
    return sortRows(inSeason.filter(keep).filter(inScope), get, sort.dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inSeason, types, text, sort.key, sort.dir, answers, scope])
  const pages = pageOf(listRows, page, size)

  function exportList() {
    downloadCsv(`eventi-${seasonLabel(season).replace('/', '-')}`, [
      [t('cal.colDate'), t('cal.colTime'), t('cal.colType'), t('cal.colEvent'), t('cal.colPlace'), t('cal.colGroups')],
      ...listRows.map((e) => [dayKey(e.starts_at), formatTime(e.starts_at), typeName(catOf(e)), title(e), e.venue, groupName(e)]),
    ])
  }

  function pickScope(next: Scope) {
    setScope(next)
    setPage(1)
    // Past events read best with the latest first, the others with the next first.
    sort.set('date', next === 'past' ? 'desc' : 'asc')
  }
  const scopeButton = (v: Scope, label: string) => (
    <button className={scope === v ? 'chip on' : 'chip'} aria-pressed={scope === v} onClick={() => pickScope(v)}>{label}</button>
  )

  const viewButton = (v: View, label: string) => (
    <button className={view === v ? 'chip on' : 'chip'} aria-pressed={view === v} onClick={() => setView(v)}>{label}</button>
  )

  return (
    <div className="cal-layout desk-only">
      <aside className="cal-filters" aria-label={t('cal.filters')}>
        <h2>{t('cal.filters')}</h2>
        <label className="cal-field">
          <span>{t('cal.season')}</span>
          <select value={season} onChange={(e) => pickSeason(Number(e.target.value))}>
            {seasons.map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}
          </select>
        </label>
        <label className="cal-field">
          <span>{t('cal.search')}</span>
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} />
        </label>
        <fieldset>
          <legend>{t('cal.types')}</legend>
          <label className="check"><input type="checkbox" checked={allTypes} onChange={() => { setTypes(new Set(allTypes ? [] : CATS)); setPage(1) }} />{t('cal.all')}</label>
          {CATS.map((c) => (
            <label key={c} className={`check ${c}`}>
              <input type="checkbox" checked={types.has(c)} onChange={() => toggleType(c)} />
              <span className="dot" aria-hidden="true" />{typeName(c)}
              <span className="n">{counts[c]}</span>
            </label>
          ))}
        </fieldset>
      </aside>

      <div className="cal-main">
        <div className="cal-toolbar">
          <div className="cal-nav">
            {view === 'month' ? (
              <>
                <button className="icon" aria-label={t('cal.prevMonth')} onClick={() => shiftMonth(-1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
                <strong className="cal-title">{formatMonth(`${month}-15T12:00:00Z`)}</strong>
                <button className="icon" aria-label={t('cal.nextMonth')} onClick={() => shiftMonth(1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
                <button className="chip" onClick={() => { setMonth(today.slice(0, 7)); setSeason(currentSeason) }}>{t('cal.today')}</button>
              </>
            ) : view === 'week' ? (
              <>
                <button className="icon" aria-label={t('events.prevWeek')} onClick={() => onWeekShift(weekShift - 1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
                <button className="icon" aria-label={t('events.nextWeek')} onClick={() => onWeekShift(weekShift + 1)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
                <strong className="cal-title">{props.weekLabel}</strong>
                <button className="chip" onClick={() => onWeekShift(0)}>{t('cal.today')}</button>
              </>
            ) : (
              <strong className="cal-title">{t('cal.seasonOf', { season: seasonLabel(season) })}</strong>
            )}
          </div>
          <div className="cal-actions">
            <div role="group" aria-label={t('cal.views')} className="cal-views">
              {viewButton('week', t('cal.week'))}
              {viewButton('month', t('cal.month'))}
              {viewButton('list', t('cal.list'))}
            </div>
            <OutputAction kind="print" label={t('cal.print')} onRun={() => window.print()} />
            {isStaff && view === 'list' && <OutputAction kind="csv" label={t('cal.export')} rows={listRows.length} disabled={listRows.length === 0} onRun={exportList} />}
          </div>
        </div>

        {view === 'week' && props.renderWeek(text, keep)}

        {view === 'month' && (
          <div className="month" role="grid" aria-label={formatMonth(`${month}-15T12:00:00Z`)}>
            <div className="month-head" role="row">
              {weekOf(`${today}T12:00:00Z`).map((d) => <span key={d.date} role="columnheader">{formatShortDay(`${d.date}T12:00:00Z`).split(' ')[0]}</span>)}
            </div>
            <div className="month-body">
              {cells.map((d) => {
                const list = byDay.get(d) ?? []
                const inMonth = d.startsWith(month)
                return (
                  <div key={d} role="gridcell" className={`mday${inMonth ? '' : ' out'}${d === today ? ' today' : ''}`}>
                    <div className="mday-top">
                      <span className="mday-n">{Number(d.slice(8))}</span>
                      {isStaff && inMonth && <Link className="mday-add" to={`/events/new?date=${d}`} aria-label={t('cal.newOn', { day: formatDay(`${d}T12:00:00Z`) })}>+</Link>}
                    </div>
                    {list.slice(0, MAX_PER_DAY).map((e) => (
                      <Link key={e.id} to={`/events/${e.id}`} className={`mev ${catOf(e)}${e.cancelled_at ? ' cancelled' : ''}`} title={`${formatTime(e.starts_at)} ${title(e)}`}>
                        <span className="t">{formatTime(e.starts_at)}</span> <span>{title(e)}</span>
                      </Link>
                    ))}
                    {list.length > MAX_PER_DAY && <button className="link mday-more" onClick={() => weekOfDate(d)}>{t('cal.more', { n: String(list.length - MAX_PER_DAY) })}</button>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {view === 'list' && (
          <>
            <div role="group" aria-label={t('cal.scope')} className="cal-views cal-scope">
              {scopeButton('upcoming', t('cal.scopeUpcoming'))}
              {scopeButton('past', t('cal.scopePast'))}
              {scopeButton('all', t('cal.scopeAll'))}
            </div>
            <div className="table-wrap">
              <table className="list-table">
                <thead>
                  <tr>
                    <SortHeader label={t('cal.colDate')} active={sort.key === 'date'} dir={sort.dir} onSort={() => { sort.toggle('date'); setPage(1) }} />
                    <th scope="col">{t('cal.colType')}</th>
                    <SortHeader label={t('cal.colEvent')} active={sort.key === 'event'} dir={sort.dir} onSort={() => { sort.toggle('event'); setPage(1) }} />
                    <SortHeader label={t('cal.colPlace')} active={sort.key === 'place'} dir={sort.dir} onSort={() => { sort.toggle('place'); setPage(1) }} />
                    <th scope="col">{t('cal.colGroups')}</th>
                    <SortHeader label={t('cal.colAnswer')} active={sort.key === 'answer'} dir={sort.dir} onSort={() => { sort.toggle('answer'); setPage(1) }} />
                  </tr>
                </thead>
                <tbody>
                  {pages.map((e) => (
                    <tr key={e.id} className={`${new Date(e.ends_at).getTime() < Date.now() ? 'past' : ''}${e.cancelled_at ? ' cancelled' : ''}`}>
                      <td><Link to={`/events/${e.id}`}>{formatShortDay(e.starts_at)}</Link> <span className="hint">{formatTime(e.starts_at)}</span></td>
                      <td><span className={`cat ${catOf(e)}`}><span className="dot" aria-hidden="true" />{typeName(catOf(e))}</span></td>
                      <td>{title(e)}{e.cancelled_at && <span className="tag"> {t('events.cancelled')}</span>}</td>
                      <td>{e.venue}</td>
                      <td>{groupName(e)}</td>
                      <td>{answerText(e)}</td>
                    </tr>
                  ))}
                  {pages.length === 0 && <tr><td colSpan={6} className="hint">{t('cal.none')}</td></tr>}
                </tbody>
              </table>
            </div>
            <TablePager total={listRows.length} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />
          </>
        )}
      </div>
    </div>
  )
}
