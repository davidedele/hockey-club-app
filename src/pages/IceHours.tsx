import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { Link, Navigate } from 'react-router-dom'
import { errorText, locale, t } from '../i18n'
import { NO_RINK, cost, iceCsv, iceMonths, sumOf, totals, type IceEvent } from '../lib/ice'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatMonth, italyToIso, seasonLabel, seasonOf } from '../lib/time'
import type { Rink, RinkPrice } from '../lib/types'

// The app holds no events before this season.
const FIRST_SEASON = 2026

const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
const euro = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })
const hours = (n: number | undefined) => (n ? t('ice.hoursValue', { n: number.format(n) }) : '')

// The board's count of ice hours: per rink and per month for a season, to set against the venue's invoice.
export default function IceHours() {
  const { isBoard, loading } = useSession()
  const current = seasonOf(new Date().toISOString())
  const seasons = useMemo(() => Array.from({ length: Math.max(1, current - FIRST_SEASON + 1) }, (_, i) => current - i), [current])
  const [season, setSeason] = useState(current)
  const [events, setEvents] = useState<IceEvent[]>([])
  const [rinks, setRinks] = useState<Rink[]>([])
  const [prices, setPrices] = useState<Map<number, number>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isBoard) return
    let stale = false
    setLoaded(false)
    void (async () => {
      const [e, r, p] = await Promise.all([
        supabase.from('events').select('id, title, type, starts_at, ends_at, rink_id, cancelled_at')
          .gte('starts_at', italyToIso(`${season}-09-01`, '00:00')).lt('starts_at', italyToIso(`${season + 1}-09-01`, '00:00'))
          .order('starts_at').limit(1000),
        supabase.from('rinks').select('id, name').order('name'),
        supabase.from('rink_prices').select('rink_id, price_cents'),
      ])
      if (stale) return
      const failed = e.error ?? r.error ?? p.error
      setError(failed ? errorText(failed) : '')
      setEvents((e.data ?? []) as IceEvent[])
      setRinks((r.data ?? []) as Rink[])
      setPrices(new Map(((p.data ?? []) as RinkPrice[]).map((x) => [x.rink_id, x.price_cents])))
      setLoaded(true)
    })()
    return () => { stale = true }
  }, [season, isBoard])

  const months = useMemo(() => iceMonths(events), [events])
  const used = useMemo(() => totals(months, 'used'), [months])
  const cancelled = useMemo(() => totals(months, 'cancelled'), [months])
  const columns = useMemo(() => {
    const keys = rinks.map((r) => ({ key: String(r.id), name: r.name }))
    const loose = (used[NO_RINK] ?? 0) + (cancelled[NO_RINK] ?? 0) > 0
    return loose ? [...keys, { key: NO_RINK, name: t('ice.noRink') }] : keys
  }, [rinks, used, cancelled])
  const hasCancelled = sumOf(cancelled) > 0
  const totalCost = cost(used, prices)

  if (!loading && !isBoard) return <Navigate to="/settings" replace />

  function download() {
    const csv = iceCsv(events, rinks, prices, {
      header: [t('ice.colDate'), t('ice.colStart'), t('ice.colEnd'), t('ice.colEvent'), t('ice.colType'), t('ice.colRink'), t('ice.colHours'), t('ice.colState'), t('ice.colCost')],
      cancelled: t('events.cancelled'), took: t('ice.took'), noRink: t('ice.noRink'), training: t('eventType.training'), game: t('eventType.game'),
    })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = t('ice.fileName', { season: seasonLabel(season).replace('/', '-') })
    a.click()
    URL.revokeObjectURL(url)
  }

  function table(which: 'used' | 'cancelled') {
    const sums = which === 'used' ? used : cancelled
    return (
      <div className="scroll">
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">{t('ice.month')}</th>
              {columns.map((c) => <th scope="col" key={c.key}>{c.name}</th>)}
              <th scope="col">{t('ice.colHours')}</th>
            </tr>
          </thead>
          <tbody>
            {months.filter((m) => sumOf(m[which]) > 0).map((m) => (
              <tr key={m.month}>
                <th scope="row">{formatMonth(`${m.month}-15T12:00:00Z`)}</th>
                {columns.map((c) => <td key={c.key}>{hours(m[which][c.key])}</td>)}
                <td className="strong">{hours(sumOf(m[which]))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">{t('ice.total')}</th>
              {columns.map((c) => <td key={c.key} className="strong">{hours(sums[c.key])}</td>)}
              <td className="strong">{hours(sumOf(sums))}</td>
            </tr>
            {which === 'used' && totalCost !== null && (
              <tr>
                <th scope="row">{t('ice.cost')}</th>
                {columns.map((c) => {
                  const one = cost({ [c.key]: sums[c.key] ?? 0 }, prices)
                  return <td key={c.key}>{one === null ? '' : euro.format(one)}</td>
                })}
                <td className="strong">{euro.format(totalCost)}</td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    )
  }

  return (
    <div className="section">
      <PageHeader title={t('ice.title')} back={{ to: '/settings', label: t('settings.title') }} description={t('ice.intro')} crumb={t('settings.ice')} />
      <div className="stats-filters">
        <div className="chips" role="group" aria-label={t('ice.season')}>
          {seasons.map((s) => (
            <button key={s} className={season === s ? 'chip on' : 'chip'} aria-pressed={season === s} onClick={() => setSeason(s)}>{seasonLabel(s)}</button>
          ))}
        </div>
        {events.length > 0 && <button className="secondary small" onClick={download}>{t('ice.export')}</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && !error && rinks.length === 0 && <p className="hint">{t('ice.noRinks')} <Link to="/settings/rinks">{t('settings.rinks')}</Link></p>}
      {loaded && !error && events.length === 0 && <p className="hint">{t('ice.empty')}</p>}
      {loaded && (used[NO_RINK] ?? 0) + (cancelled[NO_RINK] ?? 0) > 0 && <p className="hint">{t('ice.noRinkHint')}</p>}
      {months.length > 0 && (
        <>
          <p className="hint phone-only">{t('ice.scrollHint')}</p>
          <h2>{t('ice.used')}</h2>
          {table('used')}
          {hasCancelled && (
            <>
              <h2>{t('ice.cancelled')}</h2>
              {table('cancelled')}
            </>
          )}
        </>
      )}
    </div>
  )
}
