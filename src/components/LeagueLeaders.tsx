import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { t } from '../i18n'
import TabStrip from './TabStrip'
import { prettyName, refreshLeagueDetails } from '../lib/league'
import { LEADER_KINDS, rankLeaders, type LeaderKind } from '../lib/leagueleaders'
import { supabase } from '../lib/supabase'
import type { LeaguePlayerTotal } from '../lib/types'

const SHOWN = 10
const KIND_TEXT = { goals: 'champ.kind.goals', assists: 'champ.kind.assists', points: 'champ.kind.points', penalties: 'champ.kind.penalties' } as const

// Top scorers, most assists, points and penalties of one championship, for the players of every team, added up from
// the game pages of the league website. The server reads a few new games each time somebody opens the page.
export default function LeagueLeaders(props: { championshipId: number; finishedIds: number[] }) {
  const { championshipId, finishedIds } = props
  const [params] = useSearchParams()
  const asked = params.get('stats')
  const kind: LeaderKind = LEADER_KINDS.find((k) => k === asked) ?? 'goals'
  const [rows, setRows] = useState<LeaguePlayerTotal[]>([])
  const [readIds, setReadIds] = useState<Set<number>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [more, setMore] = useState(0)

  const load = useCallback(async () => {
    const [totals, reads] = await Promise.all([
      supabase.rpc('league_player_totals', { p_championship: championshipId }),
      supabase.from('league_match_reads').select('match_id'),
    ])
    setRows((totals.data ?? []) as LeaguePlayerTotal[])
    setReadIds(new Set(((reads.data ?? []) as { match_id: number }[]).map((r) => r.match_id)))
    setLoaded(true)
  }, [championshipId])

  const finishedKey = finishedIds.join(',')
  useEffect(() => {
    setLoaded(false)
    setMore(0)
    void load().then(async () => {
      // Games not read yet: ask the server for the next few, then show the new totals.
      const { data } = await supabase.from('league_match_reads').select('match_id')
      const have = new Set(((data ?? []) as { match_id: number }[]).map((r) => r.match_id))
      if (finishedIds.some((id) => !have.has(id)) && (await refreshLeagueDetails()) > 0) await load()
    })
    // finishedIds is compared through finishedKey, so a new array with the same games does not read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, finishedKey])

  const ranked = useMemo(() => rankLeaders(rows, kind), [rows, kind])
  const shown = ranked.slice(0, SHOWN + more)
  const read = finishedIds.filter((id) => readIds.has(id)).length

  const head: Record<LeaderKind, { col: 'champ.colGoals' | 'champ.colPowerPlay' | 'champ.colAssists' | 'champ.colPts' | 'champ.colPenMinutes' | 'champ.colPenalties'; value: (r: LeaguePlayerTotal) => number }[]> = {
    goals: [{ col: 'champ.colGoals', value: (r) => r.goals }, { col: 'champ.colPowerPlay', value: (r) => r.pp_goals }],
    assists: [{ col: 'champ.colAssists', value: (r) => r.assists }],
    points: [{ col: 'champ.colPts', value: (r) => r.points }, { col: 'champ.colGoals', value: (r) => r.goals }, { col: 'champ.colAssists', value: (r) => r.assists }],
    penalties: [{ col: 'champ.colPenMinutes', value: (r) => r.penalty_minutes }, { col: 'champ.colPenalties', value: (r) => r.penalties }],
  }
  const cols = head[kind]

  return (
    <section className="league-leaders" aria-labelledby="leaders-title">
      <h2 id="leaders-title">{t('champ.leaders')}</h2>
      <TabStrip label={t('champ.leadersTabs')}>
        {LEADER_KINDS.map((k) => (
          <Link key={k} to={{ search: k === 'goals' ? '' : `?stats=${k}` }} replace aria-current={k === kind ? 'page' : undefined}>
            {t(KIND_TEXT[k])}
          </Link>
        ))}
      </TabStrip>

      {loaded && ranked.length === 0 ? (
        <p className="hint">{finishedIds.length > 0 && read < finishedIds.length ? t('champ.leadersFilling') : t('champ.leadersEmpty')}</p>
      ) : (
        <div className="scroll">
          <table className="stats-table leaders">
            <thead>
              <tr>
                <th scope="col">{t('champ.colPlayer')}</th>
                {cols.map((c) => <th key={c.col} scope="col">{t(c.col)}</th>)}
                <th scope="col">{t('champ.colGames')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.team}|${r.player_name}`}>
                  <th scope="row">
                    <span className="leader-rank">{r.rank}</span>
                    <span className="leader-who">
                      <span className="leader-name">{prettyName(r.player_name)}{r.player_number ? ` ${t('champ.number', { n: r.player_number })}` : ''}</span>
                      <span className="leader-team">{prettyName(r.team)}</span>
                    </span>
                  </th>
                  {cols.map((c, i) => <td key={c.col} className={i === 0 ? 'strong' : undefined}>{c.value(r)}</td>)}
                  <td>{r.games}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ranked.length > SHOWN && (
        <div className="list-more">
          <span className="hint" role="status">{t('champ.count', { shown: String(shown.length), total: String(ranked.length) })}</span>
          {shown.length < ranked.length && (
            <button type="button" className="secondary" onClick={() => setMore(more + SHOWN)}>{t('champ.more', { n: String(Math.min(SHOWN, ranked.length - shown.length)) })}</button>
          )}
        </div>
      )}

      <p className="hint" role="status">
        {t('champ.leadersSource')}{' '}
        {finishedIds.length > 0 && t('champ.leadersProgress', { read: String(read), total: String(finishedIds.length) })}
      </p>
    </section>
  )
}
