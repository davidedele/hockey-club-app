import { useCallback, useEffect, useState } from 'react'
import { errorText, t } from '../i18n'
import { supabase } from '../lib/supabase'
import type { GameResultRow } from '../lib/types'

type Draft = { goals: string; assists: string; pim: string; shots: string; saves: string }
const FIELDS: { key: keyof Draft; label: 'stats.colGoals' | 'stats.colAssists' | 'stats.colPim' | 'stats.colShots' | 'stats.colSaves'; goalie?: boolean }[] = [
  { key: 'goals', label: 'stats.colGoals' },
  { key: 'assists', label: 'stats.colAssists' },
  { key: 'pim', label: 'stats.colPim' },
  { key: 'shots', label: 'stats.colShots', goalie: true },
  { key: 'saves', label: 'stats.colSaves', goalie: true },
]
const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const decimal = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const name = (r: GameResultRow) => `${r.last_name} ${r.first_name}`
const isGoalie = (r: GameResultRow) => r.position === 'goalie' || r.shots_against !== null
const count = (v: string) => (v.trim() === '' ? null : Number(v))

// The game part of an event page: the numbers of who played, the vote after the game, and its results.
// reloadKey changes when staff change the attendance, which decides who played.
export default function EventGame({ eventId, myId, isStaff, started, over, reloadKey }: {
  eventId: string
  myId: string
  isStaff: boolean
  started: boolean
  over: boolean
  reloadKey: string
}) {
  const [results, setResults] = useState<GameResultRow[]>([])
  const [myVote, setMyVote] = useState<string | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [mvp, setMvp] = useState('')
  const [ratings, setRatings] = useState<Record<string, string>>({})
  const [thanks, setThanks] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [r, v] = await Promise.all([
      supabase.rpc('game_results', { p_event_id: eventId }),
      supabase.from('mvp_votes').select('voted_id').eq('event_id', eventId).maybeSingle(),
    ])
    if (r.error) setError(errorText(r.error))
    setResults((r.data ?? []) as GameResultRow[])
    setMyVote((v.data as { voted_id: string } | null)?.voted_id ?? null)
  }, [eventId])

  useEffect(() => {
    if (started) void load()
  }, [load, started, reloadKey])

  if (!started || myVote === undefined) return null

  const played = results.filter((r) => r.played || r.goals !== null || r.shots_against !== null)
  const me = results.find((r) => r.user_id === myId)
  const iPlayed = Boolean(me?.played)
  const teammates = results.filter((r) => r.played && r.user_id !== myId)
  const canVote = iPlayed && over && myVote === null
  const visible = results.some((r) => r.rating_count !== null)
  const hasNumbers = played.some((r) => r.goals !== null || r.shots_against !== null)
  const hasGoalieNumbers = played.some((r) => r.shots_against !== null)
  // Staff store only the players with something to record; once numbers exist, the others played with zero.
  const shown = (v: number | null) => v ?? (hasNumbers ? 0 : '')
  const votes = results.reduce((n, r) => n + (r.mvp_votes ?? 0), 0)
  const podium = results.filter((r) => (r.mvp_votes ?? 0) > 0).sort((a, b) => (b.mvp_votes ?? 0) - (a.mvp_votes ?? 0)).slice(0, 3)
  const top = podium[0]?.mvp_votes ?? 0

  function startEditing() {
    setDraft(Object.fromEntries(played.map((r) => [r.user_id, {
      goals: r.goals?.toString() ?? '',
      assists: r.assists?.toString() ?? '',
      pim: r.penalty_minutes?.toString() ?? '',
      shots: r.shots_against?.toString() ?? '',
      saves: r.saves?.toString() ?? '',
    }])))
    setError('')
    setEditing(true)
  }

  async function saveStats() {
    const list = []
    for (const r of played) {
      const d = draft[r.user_id]
      const values = [d.goals, d.assists, d.pim, d.shots, d.saves].map(count)
      if (values.some((v) => v !== null && (!Number.isInteger(v) || v < 0))) return setError(t('error.stats_invalid'))
      const [goals, assists, pim, shots, saves] = values
      const keeper = shots !== null || saves !== null
      if (keeper && (saves ?? 0) > (shots ?? 0)) return setError(t('error.stats_check'))
      if (values.every((v) => v === null || v === 0) && !keeper) continue
      list.push({
        user_id: r.user_id, goals: goals ?? 0, assists: assists ?? 0, penalty_minutes: pim ?? 0,
        shots_against: keeper ? shots ?? 0 : null, saves: keeper ? saves ?? 0 : null,
      })
    }
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('save_game_stats', { p_event_id: eventId, p_stats: list })
    if (error) setError(errorText(error))
    else setEditing(false)
    await load()
    setBusy(false)
  }

  async function sendVote() {
    setBusy(true)
    setError('')
    const list = Object.entries(ratings).filter(([, v]) => v !== '').map(([user_id, v]) => ({ user_id, rating: Number(v) }))
    const { error } = await supabase.rpc('submit_game_vote', { p_event_id: eventId, p_mvp_id: mvp, p_ratings: list })
    if (error) setError(errorText(error))
    else setThanks(true)
    await load()
    setBusy(false)
  }

  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}

      {iPlayed && !over && (
        <>
          <h2>{t('game.voteTitle')}</h2>
          <p className="hint">{t('game.waitEnd')}</p>
        </>
      )}

      {canVote && teammates.length > 0 && (
        <section className="vote" aria-labelledby="vote-title">
          <h2 id="vote-title">{t('game.voteTitle')}</h2>
          <p className="hint">{t('game.voteHint')}</p>
          <label htmlFor="mvp">{t('game.mvpPick')}</label>
          <select id="mvp" className="full" value={mvp} onChange={(e) => setMvp(e.target.value)}>
            <option value="">{t('game.mvpNone')}</option>
            {teammates.map((r) => <option key={r.user_id} value={r.user_id}>{name(r)}</option>)}
          </select>
          <ul className="list rate">
            {teammates.map((r) => (
              <li key={r.user_id} className="row">
                <span>{name(r)}</span>
                <select
                  aria-label={t('game.ratingFor', { name: `${r.first_name} ${r.last_name}` })}
                  value={ratings[r.user_id] ?? ''}
                  onChange={(e) => setRatings({ ...ratings, [r.user_id]: e.target.value })}
                >
                  <option value="">{t('game.noRating')}</option>
                  {RATINGS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <div className="actions spaced">
            <button disabled={busy || mvp === ''} onClick={() => void sendVote()}>{t('game.send')}</button>
          </div>
        </section>
      )}

      {visible && over && (
        <>
          <h2>{t('game.resultsTitle')}</h2>
          {thanks && <p className="hint" role="status">{t('game.thanks')}</p>}
          {podium.length === 0 ? (
            <p className="hint">{t('game.noVotes')}</p>
          ) : (
            <>
              <ol className="list podium">
                {podium.map((r, i) => (
                  <li key={r.user_id} className={r.mvp_votes === top ? 'first' : undefined}>
                    <span className="rank">{r.mvp_votes === top ? t('game.mvp') : t('game.rank', { n: String(i + 1) })}</span>
                    <span className="podium-name">{name(r)}</span>
                    <span className="podium-votes">{r.mvp_votes === 1 ? t('game.voteOne') : t('game.votes', { n: String(r.mvp_votes) })}</span>
                  </li>
                ))}
              </ol>
              <p className="hint">{votes === 1 ? t('game.votersOne') : t('game.voters', { n: String(votes) })}</p>
            </>
          )}
        </>
      )}

      <h2>{t('game.statsTitle')}</h2>
      {played.length === 0 && <p className="hint">{isStaff ? t('game.nobodyPlayedStaff') : t('game.nobodyPlayed')}</p>}

      {played.length > 0 && !editing && (
        <>
          {!hasNumbers && <p className="hint">{t('game.noStats')}</p>}
          <div className="scroll">
            <table className="stats-table">
              <thead>
                <tr>
                  <th scope="col">{t('stats.colPlayer')}</th>
                  <th scope="col">{t('stats.colGoals')}</th>
                  <th scope="col">{t('stats.colAssists')}</th>
                  <th scope="col">{t('game.colPim')}</th>
                  {hasGoalieNumbers && <th scope="col">{t('game.colSaves')}</th>}
                  {visible && <th scope="col">{t('stats.colRating')}</th>}
                  {visible && <th scope="col">{t('stats.colMvp')}</th>}
                  {myVote !== null && <th scope="col">{t('game.myRating')}</th>}
                </tr>
              </thead>
              <tbody>
                {played.map((r) => (
                  <tr key={r.user_id}>
                    <th scope="row">{name(r)}</th>
                    <td>{shown(r.goals)}</td>
                    <td>{shown(r.assists)}</td>
                    <td>{shown(r.penalty_minutes)}</td>
                    {hasGoalieNumbers && <td>{r.shots_against !== null ? t('game.savesValue', { saves: String(r.saves), shots: String(r.shots_against) }) : ''}</td>}
                    {visible && <td>{r.rating_avg === null ? '' : decimal.format(r.rating_avg)}</td>}
                    {visible && <td>{r.mvp_votes || ''}</td>}
                    {myVote !== null && <td>{r.my_rating ?? ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isStaff && (
            <div className="actions spaced">
              <button className="secondary" onClick={startEditing}>{t('game.edit')}</button>
            </div>
          )}
        </>
      )}

      {isStaff && editing && (
        <>
          <ul className="list stat-edit">
            {played.map((r) => (
              <li key={r.user_id}>
                <div className="member-name">{name(r)}</div>
                <div className="statgrid">
                  {FIELDS.filter((f) => !f.goalie || isGoalie(r)).map((f) => (
                    <label key={f.key}>
                      {t(f.label)}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={draft[r.user_id]?.[f.key] ?? ''}
                        onChange={(e) => setDraft({ ...draft, [r.user_id]: { ...draft[r.user_id], [f.key]: e.target.value } })}
                      />
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="actions spaced">
            <button disabled={busy} onClick={() => void saveStats()}>{t('game.save')}</button>
            <button className="link" disabled={busy} onClick={() => setEditing(false)}>{t('common.cancel')}</button>
          </div>
        </>
      )}
    </>
  )
}
