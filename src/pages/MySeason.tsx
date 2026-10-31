import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { locale, t } from '../i18n'
import { attendancePercent, isEmptySeason, useMySeason } from '../lib/myseason'
import { milestoneKey, type Milestone } from '../lib/milestones'
import { supabase } from '../lib/supabase'
import { dayKey, formatDateYear, seasonLabel, seasonOf } from '../lib/time'

// The app holds no games before this season.
const FIRST_SEASON = 2026
const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const dash = '–'

// "La mia stagione": the person's own attendance and game numbers. Nobody else's numbers are here:
// the database function takes no person and answers for the signed in one.
export default function MySeason() {
  const current = seasonOf(new Date().toISOString())
  const seasons = useMemo(() => Array.from({ length: Math.max(1, current - FIRST_SEASON + 1) }, (_, i) => current - i), [current])
  const [season, setSeason] = useState(current)
  const { data, error, loaded } = useMySeason(season)
  const percent = data ? attendancePercent(data) : null
  const empty = loaded && data !== null && isEmptySeason(data)
  const n = (v: number | undefined) => (loaded && data ? String(v ?? 0) : dash)
  const [milestones, setMilestones] = useState<Milestone[] | null>(null)
  useEffect(() => {
    void supabase.rpc('my_milestones').then(({ data: rows }) => setMilestones((rows ?? []) as Milestone[]))
  }, [])

  return (
    <div className="section my-season">
      <PageHeader title={t('season.title')} back={{ to: '/profile', label: t('profile.back') }} description={t('season.intro')} />
      <div className="stats-filters">
        {seasons.length > 1 ? (
          <div>
            <label htmlFor="my-season">{t('stats.season')}</label>
            <select id="my-season" value={season} onChange={(e) => setSeason(Number(e.target.value))}>
              {seasons.map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}
            </select>
          </div>
        ) : (
          <p className="season-name">{t('stats.season')} {seasonLabel(season)}</p>
        )}
      </div>
      {error && <p className="error" role="alert">{t('common.error')}</p>}
      {empty ? (
        <p className="hint">{t('season.empty')}</p>
      ) : (
        <>
          <h2>{t('season.attendance')}</h2>
          <section className="card"><dl className="home-facts" aria-label={t('season.attendance')}>
            <div><dt>{t('att.percent')}</dt><dd>{loaded ? (percent === null ? dash : `${percent}%`) : dash}</dd></div>
            <div><dt>{t('summary.on_time')}</dt><dd>{n(data?.on_time)}</dd></div>
            <div><dt>{t('summary.late')}</dt><dd>{n(data?.late)}</dd></div>
            <div><dt>{t('summary.excused')}</dt><dd>{n(data?.excused)}</dd></div>
            <div><dt>{t('summary.unexcused')}</dt><dd>{n(data?.unexcused)}</dd></div>
          </dl></section>
          <h2>{t('season.games')}</h2>
          <section className="card"><dl className="home-facts" aria-label={t('season.games')}>
            <div><dt>{t('stats.games')}</dt><dd>{n(data?.games)}</dd></div>
            <div><dt>{t('stats.colGoals')}</dt><dd>{n(data?.goals)}</dd></div>
            <div><dt>{t('stats.colAssists')}</dt><dd>{n(data?.assists)}</dd></div>
            <div><dt>{t('stats.colPim')}</dt><dd>{n(data?.penalty_minutes)}</dd></div>
            <div><dt>{t('season.mvp')}</dt><dd>{n(data?.mvp)}</dd></div>
            <div><dt>{t('season.rating')}</dt><dd>{loaded && data?.rating_avg != null ? decimal.format(data.rating_avg) : dash}</dd></div>
          </dl></section>
          <p className="hint">{t('season.ratingNote')}</p>
        </>
      )}
      {milestones !== null && (
        <>
          <h2>{t('milestone.title')}</h2>
          {milestones.length === 0 ? (
            <p className="hint">{t('milestone.none')}</p>
          ) : (
            <section className="card">
              <ul className="list milestones">
                {milestones.flatMap((m) => {
                  const k = milestoneKey(m)
                  return k ? [<li key={`${m.kind}-${m.level}`} className="row"><span>{t(k.key, { n: k.n })}</span><span className="hint">{formatDateYear(dayKey(m.reached_at))}</span></li>] : []
                })}
              </ul>
              <p className="hint">{t('milestone.intro')}</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
