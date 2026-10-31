import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { errorText, t } from '../i18n'
import { prettyName } from '../lib/league'
import { tidyName } from '../lib/names'
import { supabase } from '../lib/supabase'

interface Person { number: string | null; name: string }
interface Side { name: string; score: number | null; roster: { role: string; players: Person[] }[] }
interface Detail {
  id: number
  status: string
  championship: string
  date: string
  time: string
  venue: string
  home: Side
  away: Side
  goals: { side: 'home' | 'away'; time: string; scorer: Person; assists: Person[]; kind: string | null }[]
  penalties: { side: 'home' | 'away'; time: string; player: Person; infraction: string; minutes: string; serving: string | null }[]
}

const SITE = 'https://www.legahockeylibertas.it'
const who = (p: Person) => `${p.number ? `#${p.number} ` : ''}${tidyName(p.name)}`

// "PP1" is a goal in power play, "SH1" short handed; other marks are shown as the league writes them.
function kindText(kind: string | null): string {
  if (!kind) return ''
  if (/^PP/i.test(kind)) return t('match.pp')
  if (/^SH/i.test(kind)) return t('match.sh')
  if (/^EN/i.test(kind)) return t('match.en')
  if (/^PS/i.test(kind)) return t('match.ps')
  return kind
}

// One league game as the league website reports it: score, goals, penalties and line-ups. It is read
// when the page opens and not stored in the app.
export default function LeagueMatch() {
  const { matchId } = useParams()
  const [params] = useSearchParams()
  const eventId = params.get('event')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const id = Number(matchId)
    if (!Number.isInteger(id)) return setError(t('match.notFound'))
    void supabase.functions.invoke('league-match', { body: { id } }).then(({ data, error }) => {
      if (error || !data || (data as { error?: string }).error) setError(error ? errorText(error) : t('match.unreachable'))
      else setDetail(data as Detail)
    })
  }, [matchId])

  const home = detail ? prettyName(detail.home.name) : ''
  const away = detail ? prettyName(detail.away.name) : ''
  const sideName = (s: 'home' | 'away') => (s === 'home' ? home : away)

  return (
    <div className="page wide match-page">
      <PageHeader
        title={detail ? t('match.title', { home, away }) : t('match.loadingTitle')}
        back={{ to: '/campionato', label: t('champ.title') }}
        crumb={detail ? t('match.title', { home, away }) : t('match.loadingTitle')}
        actions={eventId ? <Link className="button secondary" to={`/events/${eventId}`}>{t('match.openEvent')}</Link> : undefined}
      />
      {error && <p className="error" role="alert">{error}</p>}
      {!detail && !error && (
        <div aria-busy="true">
          <p className="sr-only" role="status">{t('match.loading')}</p>
          <div className="skeleton sb-skel" />
          <div className="match-grid">
            <div className="skeleton list-skel" />
            <div className="skeleton list-skel" />
          </div>
        </div>
      )}
      {detail && (
        <>
          <section className="scoreboard" aria-label={t('match.result')}>
            <p className="sb-meta">{prettyName(detail.championship)} · {detail.date} {detail.time} · {prettyName(detail.venue)}</p>
            <div className="sb-row">
              <span className="sb-team">{home}</span>
              <span className="sb-score">{detail.home.score ?? '–'} <span aria-hidden="true">:</span> {detail.away.score ?? '–'}</span>
              <span className="sb-team">{away}</span>
            </div>
            <p className="sb-meta">{detail.status}</p>
          </section>

          <div className="match-grid">
            <section aria-labelledby="goals-title">
              <h2 id="goals-title">{t('match.goals')}</h2>
              {detail.goals.length === 0 ? <p className="hint">{t('match.noGoals')}</p> : (
                <div className="table-wrap">
                  <table className="stats-table match-table">
                    <thead><tr><th scope="col">{t('match.time')}</th><th scope="col">{t('match.team')}</th><th scope="col">{t('match.scorer')}</th><th scope="col">{t('match.assists')}</th></tr></thead>
                    <tbody>
                      {detail.goals.map((g, i) => (
                        <tr key={i}>
                          <td>{g.time}</td>
                          <td>{sideName(g.side)}</td>
                          <th scope="row">{who(g.scorer)}{g.kind && <span className="tag"> {kindText(g.kind)}</span>}</th>
                          <td>{g.assists.length ? g.assists.map(who).join(', ') : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h2 id="pen-title">{t('match.penalties')}</h2>
              {detail.penalties.length === 0 ? <p className="hint">{t('match.noPenalties')}</p> : (
                <div className="table-wrap">
                  <table className="stats-table match-table" aria-labelledby="pen-title">
                    <thead><tr><th scope="col">{t('match.time')}</th><th scope="col">{t('match.team')}</th><th scope="col">{t('match.player')}</th><th scope="col">{t('match.infraction')}</th><th scope="col">{t('match.minutes')}</th></tr></thead>
                    <tbody>
                      {detail.penalties.map((p, i) => (
                        <tr key={i}>
                          <td>{p.time}</td>
                          <td>{sideName(p.side)}</td>
                          <th scope="row">{who(p.player)}</th>
                          <td>{p.infraction}</td>
                          <td>{p.minutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section aria-labelledby="lineups-title">
              <h2 id="lineups-title">{t('match.lineups')}</h2>
              <div className="lineups">
                {[detail.home, detail.away].map((side, i) => (
                  <div key={i} className="lineup-card">
                    <h3>{i === 0 ? home : away}</h3>
                    {side.roster.length === 0 && <p className="hint">{t('match.noLineup')}</p>}
                    {side.roster.map((g) => (
                      <div key={g.role}>
                        <p className="lineup-role">{tidyName(g.role)}</p>
                        <ul>
                          {g.players.map((p, j) => <li key={j}><span className="num">{p.number ?? ''}</span>{tidyName(p.name)}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </div>

          <p className="hint league-source">
            {t('match.source')} <a href={`${SITE}/matches/${detail.id}`} target="_blank" rel="noopener noreferrer">{t('match.sourceLink')}</a>
          </p>
        </>
      )}
    </div>
  )
}
