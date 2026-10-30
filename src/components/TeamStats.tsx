import { t } from '../i18n'
import { differenceBars, summarize, type Outcome, type Result, type Streak } from '../lib/teamstats'
import { formatDateYear, dayKey } from '../lib/time'

const OUTCOME_KEY = { W: 'stats.outcomeW', D: 'stats.outcomeD', L: 'stats.outcomeL' } as const

// A ring that is filled in proportion to part of a whole.
function Ring({ value, total, label, tone }: { value: number; total: number; label: string; tone: 'ok' | 'neutral' | 'bad' }) {
  const r = 34
  const c = 2 * Math.PI * r
  const share = total > 0 ? value / total : 0
  return (
    <figure className={`ring ${tone}`}>
      <svg viewBox="0 0 80 80" role="img" aria-label={`${label}: ${value}`}>
        <circle cx="40" cy="40" r={r} className="track" />
        <circle cx="40" cy="40" r={r} className="fill" strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 40 40)" />
      </svg>
      <figcaption><strong>{value}</strong><span>{label}</span></figcaption>
    </figure>
  )
}

function Streak({ label, streak, total, tone }: { label: string; streak: Streak; total: number; tone: 'ok' | 'bad' }) {
  const share = total > 0 ? (100 * streak.length) / total : 0
  return (
    <div className="streak">
      <div className="streak-head">
        <span>{label}</span>
        <strong>{t('stats.streakValue', { n: String(streak.length), total: String(total) })}</strong>
      </div>
      <div className={`bar ${tone}`} role="img" aria-label={`${label}: ${streak.length}`}>
        <span style={{ width: `${share}%` }} />
      </div>
      {streak.endedAt && <div className="hint">{t('stats.streakUntil', { date: formatDateYear(dayKey(streak.endedAt)) })}</div>}
    </div>
  )
}

// The team numbers of a season, from the final scores. Plain SVG, no chart library.
export default function TeamStats({ results, loaded }: { results: Result[]; loaded: boolean }) {
  const s = summarize(results)
  const bars = differenceBars(results)
  const peak = Math.max(1, ...bars.map((b) => b.count))
  const goals = s.goalsFor + s.goalsAgainst
  const avgMax = Math.max(1, s.avgFor, s.avgAgainst)

  if (loaded && s.games === 0) return <p className="hint">{t('stats.noGames')}</p>

  // The donut of goals scored against conceded.
  const r = 38
  const c = 2 * Math.PI * r
  const forShare = goals > 0 ? s.goalsFor / goals : 0

  return (
    <div className="team-stats">
      <section className="card span-2">
        <h2>{t('stats.resultTitle')}</h2>
        <div className="result-row">
          <div className="big-number"><strong>{s.games}</strong><span>{t(s.games === 1 ? 'stats.gameOne' : 'stats.gameMany')}</span></div>
          <Ring value={s.wins} total={s.games} label={t('stats.winsLabel')} tone="ok" />
          <Ring value={s.draws} total={s.games} label={t('stats.drawsLabel')} tone="neutral" />
          <Ring value={s.losses} total={s.games} label={t('stats.lossesLabel')} tone="bad" />
        </div>
      </section>

      <section className="card">
        <h2>{t('stats.goalsTitle')}</h2>
        <div className="goals-row">
          <svg viewBox="0 0 100 100" className="donut" role="img" aria-label={`${t('stats.scored')} ${s.goalsFor}, ${t('stats.conceded')} ${s.goalsAgainst}`}>
            <circle cx="50" cy="50" r={r} className="against" />
            <circle cx="50" cy="50" r={r} className="for" strokeDasharray={`${c * forShare} ${c}`} transform="rotate(-90 50 50)" />
          </svg>
          <dl className="goals-legend">
            <div className="ok"><dt>{t('stats.scored')}</dt><dd>{s.goalsFor}</dd></div>
            <div className="bad"><dt>{t('stats.conceded')}</dt><dd>{s.goalsAgainst}</dd></div>
          </dl>
        </div>
      </section>

      <section className="card span-2">
        <h2>{t('stats.diffTitle')}</h2>
        <div className="diff-chart" role="img" aria-label={t('stats.diffTitle')}>
          {bars.map((b) => (
            <div key={b.diff} className={`diff ${b.diff > 0 ? 'ok' : b.diff < 0 ? 'bad' : 'neutral'}`}>
              <span className="count">{b.count > 0 ? b.count : ''}</span>
              <span className="col" style={{ height: `${(100 * b.count) / peak}%` }} />
              <span className="label">{b.diff > 0 ? `+${b.diff}` : b.diff}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t('stats.avgTitle')}</h2>
        <div className="avg-chart">
          <div className="avg ok"><span className="count">{s.avgFor}</span><span className="col" style={{ height: `${(100 * s.avgFor) / avgMax}%` }} /><span className="label">{t('stats.avgFor')}</span></div>
          <div className="avg bad"><span className="count">{s.avgAgainst}</span><span className="col" style={{ height: `${(100 * s.avgAgainst) / avgMax}%` }} /><span className="label">{t('stats.avgAgainst')}</span></div>
        </div>
      </section>

      <section className="card span-3">
        <h2>{t('stats.lastTitle', { n: String(s.last.length) })}</h2>
        <ol className="last-games">
          {s.last.map((g) => (
            <li key={g.result.event_id} className={g.outcome === 'W' ? 'ok' : g.outcome === 'L' ? 'bad' : 'neutral'}>
              <span className="badge" aria-label={outcomeWord(g.outcome)}>{t(OUTCOME_KEY[g.outcome])}</span>
              <span className="score">{g.result.score_for} : {g.result.score_against}</span>
              <span className="hint">{g.result.opponent ?? ''}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card span-3 streaks">
        <div>
          <h2>{t('stats.bestStreaks')}</h2>
          <Streak label={t('stats.streakWin')} streak={s.bestWin} total={s.games} tone="ok" />
          <Streak label={t('stats.streakUnbeaten')} streak={s.bestUnbeaten} total={s.games} tone="ok" />
        </div>
        <div>
          <h2>{t('stats.worstStreaks')}</h2>
          <Streak label={t('stats.streakLoss')} streak={s.worstLoss} total={s.games} tone="bad" />
          <Streak label={t('stats.streakWinless')} streak={s.worstWinless} total={s.games} tone="bad" />
        </div>
      </section>
    </div>
  )
}

function outcomeWord(o: Outcome) {
  return t(o === 'W' ? 'stats.winsLabel' : o === 'D' ? 'stats.drawsLabel' : 'stats.lossesLabel')
}
