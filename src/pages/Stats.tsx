import { readableInk } from '../lib/colour'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import PageHeader from '../components/PageHeader'
import { Link, useSearchParams } from 'react-router-dom'
import { errorText, locale, t } from '../i18n'
import Avatar from '../components/Avatar'
import GroupBadge from '../components/GroupBadge'
import SeasonTabs from '../components/SeasonTabs'
import { useAvatarUrls } from '../lib/avatars'
import TeamStats from '../components/TeamStats'
import { useGroupFilter } from '../lib/groupfilter'
import { useSession } from '../lib/session'
import type { Result } from '../lib/teamstats'
import { supabase } from '../lib/supabase'
import { seasonLabel, seasonOf } from '../lib/time'
import type { Group, SeasonRecord, SeasonStatRow } from '../lib/types'

// The app holds no games before this season.
const FIRST_SEASON = 2026

const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const one = (n: number | null) => (n === null ? '' : decimal.format(n))

// Season numbers for the whole club: the team's results from the final scores, then players and goalies.
export default function Stats() {
  const { profile } = useSession()
  const current = seasonOf(new Date().toISOString())
  const seasons = useMemo(() => Array.from({ length: Math.max(1, current - FIRST_SEASON + 1) }, (_, i) => current - i), [current])
  const [season, setSeason] = useState(current)
  const [groups, setGroups] = useState<Group[]>([])
  const { groupId: group, setGroupId: setGroup } = useGroupFilter()
  const [rows, setRows] = useState<SeasonStatRow[]>([])
  const [record, setRecord] = useState<SeasonRecord | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [params] = useSearchParams()
  const tab = params.get('tab') === 'players' ? 'players' : 'team'
  const [avatars, setAvatars] = useState<Map<string, string | null>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    void (async () => {
      const [g, p] = await Promise.all([
        supabase.from('groups').select('*').order('id'),
        supabase.from('profiles').select('id, avatar_path'),
      ])
      setGroups((g.data ?? []) as Group[])
      setAvatars(new Map(((p.data ?? []) as { id: string; avatar_path: string | null }[]).map((x) => [x.id, x.avatar_path])))
    })()
  }, [profile])

  useEffect(() => {
    if (!profile) return
    setLoaded(false)
    void (async () => {
      const [s, r, g] = await Promise.all([
        supabase.rpc('season_player_stats', { p_season: season, p_group_id: group }),
        supabase.rpc('season_record', { p_season: season, p_group_id: group }),
        supabase.rpc('season_results', { p_season: season, p_group_id: group }),
      ])
      setError(s.error || r.error || g.error ? errorText(s.error ?? r.error ?? g.error) : '')
      setResults((g.data ?? []) as Result[])
      setRows((s.data ?? []) as SeasonStatRow[])
      setRecord((((r.data ?? []) as SeasonRecord[])[0]) ?? null)
      setLoaded(true)
    })()
  }, [season, group, profile])

  const photos = useAvatarUrls(rows.map((r) => avatars.get(r.user_id) ?? null))
  const skaters = rows.filter((r) => r.position !== 'goalie')
  const goalies = rows.filter((r) => r.position === 'goalie')
  const picked = groups.find((g) => g.id === group)
  const colours = picked?.game_dark && picked.game_light
    ? ({ '--team-dark': picked.game_dark, '--team-light': picked.game_light, '--band-ink': readableInk(picked.game_dark) } as CSSProperties)
    : undefined

  function who(r: SeasonStatRow) {
    const path = avatars.get(r.user_id)
    return (
      <th scope="row">
        <span className="who">
          <Avatar first={r.first_name} last={r.last_name} url={path ? photos.get(path) : null} size="small" />
          <span data-person-name>{r.last_name} {r.first_name}</span>
        </span>
      </th>
    )
  }

  return (
    <div className="page wide">
      <PageHeader title={t('stats.title')} />
      <SeasonTabs />
      <p className="hint">{t('stats.intro')}</p>
      <div className="stats-filters">
        {seasons.length > 1 ? (
          <div>
            <label htmlFor="season">{t('stats.season')}</label>
            <select id="season" value={season} onChange={(e) => setSeason(Number(e.target.value))}>
              {seasons.map((s) => <option key={s} value={s}>{seasonLabel(s)}</option>)}
            </select>
          </div>
        ) : (
          <p className="season-name">{t('stats.season')} {seasonLabel(season)}</p>
        )}
        <div className="chips">
          <button className={group === null ? 'chip on' : 'chip'} aria-pressed={group === null} onClick={() => setGroup(null)}>{t('stats.allGroups')}</button>
          {groups.map((g) => (
            <button key={g.id} className={group === g.id ? 'chip on' : 'chip'} aria-pressed={group === g.id} onClick={() => setGroup(g.id)}>
              <GroupBadge group={g} size="small" />{g.name}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <nav className="ev-tabs" aria-label={t('stats.tabs')}>
        <Link to={{ search: '' }} replace aria-current={tab === 'team' ? 'page' : undefined}>{t('stats.tabTeam')}</Link>
        <Link to={{ search: '?tab=players' }} replace aria-current={tab === 'players' ? 'page' : undefined}>{t('stats.tabPlayers')}</Link>
      </nav>

      {tab === 'team' && <div style={colours}><TeamStats results={results} loaded={loaded} /></div>}

      {tab === 'players' && (
        <>
        <dl className="record" style={colours} aria-label={t('stats.record')}>
          <div><dt>{t('stats.games')}</dt><dd>{record?.games ?? 0}</dd></div>
          <div><dt>{t('stats.wins')}</dt><dd>{record?.wins ?? 0}</dd></div>
          <div><dt>{t('stats.draws')}</dt><dd>{record?.draws ?? 0}</dd></div>
          <div><dt>{t('stats.losses')}</dt><dd>{record?.losses ?? 0}</dd></div>
          <div className="wide"><dt>{t('stats.goalsForAgainst')}</dt><dd>{t('stats.goalsValue', { for: String(record?.goals_for ?? 0), against: String(record?.goals_against ?? 0) })}</dd></div>
        </dl>

        <h2>{t('stats.players')}</h2>
        {skaters.length > 0 && <p className="hint phone-only">{t('summary.scrollHint')}</p>}
        <div className="scroll">
          <table className="stats-table">
            <thead>
              <tr>
                <th scope="col">{t('stats.colPlayer')}</th>
                <th scope="col">{t('stats.colGames')}</th>
                <th scope="col">{t('stats.colGoals')}</th>
                <th scope="col">{t('stats.colAssists')}</th>
                <th scope="col">{t('stats.colPoints')}</th>
                <th scope="col">{t('stats.colPim')}</th>
                <th scope="col">{t('stats.colMvp')}</th>
                <th scope="col">{t('stats.colRating')}</th>
              </tr>
            </thead>
            <tbody>
              {skaters.map((r) => (
                <tr key={r.user_id}>
                  {who(r)}
                  <td>{r.games}</td>
                  <td>{r.goals}</td>
                  <td>{r.assists}</td>
                  <td className="strong">{r.points}</td>
                  <td>{r.penalty_minutes}</td>
                  <td>{r.mvp}</td>
                  <td>{one(r.rating_avg)}</td>
                </tr>
              ))}
              {loaded && skaters.length === 0 && (
                <tr><td colSpan={8} className="empty-cell">{t('stats.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {goalies.length > 0 && (
          <>
            <h2>{t('stats.goalies')}</h2>
            <div className="scroll">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th scope="col">{t('stats.colPlayer')}</th>
                    <th scope="col">{t('stats.colGames')}</th>
                    <th scope="col">{t('stats.colShots')}</th>
                    <th scope="col">{t('stats.colSaves')}</th>
                    <th scope="col">{t('stats.colSavePct')}</th>
                    <th scope="col">{t('stats.colAgainst')}</th>
                    <th scope="col">{t('stats.colMvp')}</th>
                    <th scope="col">{t('stats.colRating')}</th>
                  </tr>
                </thead>
                <tbody>
                  {goalies.map((r) => (
                    <tr key={r.user_id}>
                      {who(r)}
                      <td>{r.games}</td>
                      <td>{r.shots_against ?? ''}</td>
                      <td>{r.saves ?? ''}</td>
                      <td className="strong">{r.shots_against ? one((100 * (r.saves ?? 0)) / r.shots_against) : ''}</td>
                      <td>{r.shots_against !== null && r.saves !== null ? r.shots_against - r.saves : ''}</td>
                      <td>{r.mvp}</td>
                      <td>{one(r.rating_avg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        </>
      )}
    </div>
  )
}
