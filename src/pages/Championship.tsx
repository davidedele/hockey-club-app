import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import SeasonTabs from '../components/SeasonTabs'
import { leagueSync, prettyName, refreshLeague } from '../lib/league'
import { useGroupFilter } from '../lib/groupfilter'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatShortDay, formatTime } from '../lib/time'
import type { Group, LeagueChampionship, LeagueMatch, LeagueStanding, LeagueSync } from '../lib/types'

const SHOWN = 10

// The league as the website shows it, for the club's teams: standings, next games and results
// of each competition a group plays in, with the club's own games marked.
export default function Championship() {
  const { profile, isStaff, isBoard } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [mine, setMine] = useState<number[]>([])
  const [champs, setChamps] = useState<LeagueChampionship[]>([])
  const [matches, setMatches] = useState<LeagueMatch[]>([])
  const [standings, setStandings] = useState<LeagueStanding[]>([])
  const [eventOf, setEventOf] = useState<Map<number, string>>(new Map())
  const [sync, setSync] = useState<LeagueSync | null>(null)
  const { groupId } = useGroupFilter()
  const [compId, setCompId] = useState<number | null>(null)
  const [onlyOurs, setOnlyOurs] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    const [g, m, c, lm, ls, ev, s] = await Promise.all([
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
      supabase.from('league_championships').select('*').order('position'),
      supabase.from('league_matches').select('*').order('starts_at'),
      supabase.from('league_standings').select('*').order('position'),
      supabase.from('events').select('id, league_match_id').not('league_match_id', 'is', null),
      leagueSync(),
    ])
    setGroups((g.data ?? []) as Group[])
    setMine(((m.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    setChamps((c.data ?? []) as LeagueChampionship[])
    setMatches((lm.data ?? []) as LeagueMatch[])
    setStandings((ls.data ?? []) as LeagueStanding[])
    setEventOf(new Map(((ev.data ?? []) as { id: string; league_match_id: number }[]).map((x) => [x.league_match_id, x.id])))
    setSync(s)
    setLoaded(true)
  }, [profile])

  // Show what is stored at once, then ask for a fresh reading when it is old.
  useEffect(() => { setCompId(null) }, [groupId])

  useEffect(() => {
    void load().then(async () => {
      setRefreshing(true)
      if (await refreshLeague()) await load()
      setRefreshing(false)
    })
  }, [load])

  const linked = useMemo(() => groups.filter((g) => g.league_team && (g.league_championships ?? []).length), [groups])
  // The group comes from the selector of the whole app. With all groups chosen, or a group with no
  // league team, the person's own linked group is shown, and the page says which one.
  const chosen = linked.find((g) => g.id === groupId)
  const group = chosen ?? linked.find((g) => mine.includes(g.id)) ?? linked[0]
  const chosenNotLinked = groupId !== null && !chosen
  const comps = champs.filter((c) => (group?.league_championships ?? []).includes(c.id))
  const comp = comps.find((c) => c.id === compId) ?? comps[0]
  const team = group?.league_team ?? ''
  const ours = (m: LeagueMatch) => m.home === team || m.away === team
  const inComp = matches.filter((m) => m.championship_id === comp?.id && (!onlyOurs || ours(m)))
  const now = Date.now()
  const upcoming = inComp.filter((m) => m.home_score === null && Date.parse(m.starts_at) > now - 3 * 3600 * 1000).slice(0, SHOWN)
  const results = inComp.filter((m) => m.home_score !== null).reverse().slice(0, SHOWN)
  const table = standings.filter((s) => s.championship_id === comp?.id)

  async function forceRefresh() {
    setRefreshing(true)
    await refreshLeague(true)
    await load()
    setRefreshing(false)
  }

  // A result opens the game's details from the league; a coming game of ours opens its event.
  function row(m: LeagueMatch) {
    const eventId = ours(m) ? eventOf.get(m.id) : undefined
    const played = m.home_score !== null
    const to = played ? `/campionato/partita/${m.id}${eventId ? `?event=${eventId}` : ''}` : eventId ? `/events/${eventId}` : null
    const score = m.home_score !== null ? `${m.home_score} : ${m.away_score}` : ''
    const body = (
      <>
        <span className="lm-when">{formatShortDay(m.starts_at)} <strong>{formatTime(m.starts_at)}</strong></span>
        <span className="lm-teams">
          <span className={m.home === team ? 'lm-team us' : 'lm-team'}>{prettyName(m.home)}</span>
          {score ? <span className="lm-score">{score}</span> : <span className="lm-vs">{t('champ.against')}</span>}
          <span className={m.away === team ? 'lm-team us' : 'lm-team'}>{prettyName(m.away)}</span>
        </span>
        {m.venue && <span className="lm-venue">{prettyName(m.venue)}</span>}
      </>
    )
    return (
      <li key={m.id} className={ours(m) ? 'lmatch ours' : 'lmatch'}>
        {to ? <Link to={to}>{body}</Link> : <div>{body}</div>}
      </li>
    )
  }

  const syncLine = sync?.finished_at
    ? sync.ok === false
      ? t('champ.sourceFailed')
      : t('champ.source', { when: t('champ.when', { day: formatShortDay(sync.finished_at), time: formatTime(sync.finished_at) }) })
    : t('champ.sourceNever')

  return (
    <div className="page wide">
      <PageHeader title={t('champ.title')} />
      <SeasonTabs />

      {loaded && linked.length === 0 && (
        <div className="box">
          <p>{t('champ.notLinked')}</p>
          {isBoard && (
            <>
              <p className="hint">{t('champ.notLinkedBoard')}</p>
              <Link className="button secondary small" to="/settings/groups">{t('champ.openGroups')}</Link>
            </>
          )}
        </div>
      )}

      {linked.length > 0 && (
        <>
          <p className="hint tab-intro">
            {chosenNotLinked ? t('champ.groupNotLinked', { group: group?.name ?? '' }) : t('champ.groupNote', { group: group?.name ?? '' })}
          </p>
          {comps.length > 1 && (
            <div className="chips" role="group" aria-label={t('champ.competition')}>
              {comps.map((c) => (
                <button key={c.id} className={c.id === comp?.id ? 'chip on' : 'chip'} aria-pressed={c.id === comp?.id} onClick={() => setCompId(c.id)}>
                  {prettyName(c.name)}
                </button>
              ))}
            </div>
          )}

          <div className="league">
            <section aria-labelledby="standings-title">
              <h2 id="standings-title">{comp ? `${t('champ.standings')}: ${prettyName(comp.name)}` : t('champ.standings')}</h2>
              {table.length === 0 ? (
                <p className="hint">{t('champ.noStandings')}</p>
              ) : (
                <div className="scroll">
                  <table className="stats-table standings">
                    <thead>
                      <tr>
                        <th scope="col">{t('champ.colPos')}</th>
                        <th scope="col">{t('champ.colTeam')}</th>
                        <th scope="col">{t('champ.colPlayed')}</th>
                        <th scope="col">{t('champ.colPoints')}</th>
                        <th scope="col">{t('champ.colDiff')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.map((r) => (
                        <tr key={r.position} className={r.team === team ? 'ours' : undefined}>
                          <td>{r.position}</td>
                          <th scope="row">{prettyName(r.team)}</th>
                          <td>{r.played}</td>
                          <td className="strong">{r.points}</td>
                          <td>{r.goal_diff > 0 ? `+${r.goal_diff}` : r.goal_diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="games-title">
              <div className="row league-head">
                <h2 id="games-title">{t('champ.next')}</h2>
                <div className="chips">
                  <button className={!onlyOurs ? 'chip on' : 'chip'} aria-pressed={!onlyOurs} onClick={() => setOnlyOurs(false)}>{t('champ.allGames')}</button>
                  <button className={onlyOurs ? 'chip on' : 'chip'} aria-pressed={onlyOurs} onClick={() => setOnlyOurs(true)}>{t('champ.onlyTeam', { team: prettyName(team) })}</button>
                </div>
              </div>
              {upcoming.length === 0 ? <p className="hint">{t('champ.noNext')}</p> : <ul className="list lmatches">{upcoming.map(row)}</ul>}
              <h2>{t('champ.results')}</h2>
              {results.length > 0 && <p className="hint">{t('champ.resultsHint')}</p>}
              {results.length === 0 ? <p className="hint">{t('champ.noResults')}</p> : <ul className="list lmatches">{results.map(row)}</ul>}
            </section>
          </div>
        </>
      )}

      <p className="hint league-source" role="status">
        {refreshing ? t('champ.refreshing') : syncLine}
      </p>
      {isStaff && <button className="secondary small" disabled={refreshing} onClick={() => void forceRefresh()}>{t('champ.refresh')}</button>}
    </div>
  )
}
