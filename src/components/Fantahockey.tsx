import { useCallback, useEffect, useMemo, useState } from 'react'
import { errorText, t } from '../i18n'
import { personName } from '../lib/names'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/time'
import { groupRound, type RoundPick } from '../lib/fanta'
import TableScroll from './TableScroll'

interface NextRound { round_day: string; starts_at: string; games: number }
interface LastRound extends NextRound { over: boolean }
interface Candidate { user_id: string; first_name: string; last_name: string; jersey_number: number | null }
interface TableRow { user_id: string; first_name: string; last_name: string; rounds: number; points: number }

// Fantahockey (V9): before a game day each member picks three players of the club. The picks stay private until the
// first game of the day of the picker starts, then the people who share a group read them with the points. canPick is
// true only in the Giocatore view, which is also the only view limited to the person's own groups.
export default function Fantahockey({ season, myId, canPick }: { season: number; myId: string; canPick: boolean }) {
  // In the Giocatore view everything follows the person's own groups; the staff views look at every group (decision 138).
  const all = !canPick
  const [next, setNext] = useState<NextRound | null | undefined>(undefined)
  const [last, setLast] = useState<LastRound | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [mine, setMine] = useState<string[]>([])
  const [picks, setPicks] = useState<string[]>(['', '', ''])
  const [round, setRound] = useState<RoundPick[]>([])
  const [table, setTable] = useState<TableRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const [n, l, c, tb] = await Promise.all([
      supabase.rpc('fanta_next_round', { p_all: all }),
      supabase.rpc('fanta_last_round', { p_all: all }),
      supabase.rpc('fanta_candidates', { p_all: all }),
      supabase.rpc('fanta_table', { p_season: season, p_all: all }),
    ])
    const nextRound = ((n.data ?? []) as NextRound[])[0] ?? null
    const lastRound = ((l.data ?? []) as LastRound[])[0] ?? null
    setNext(nextRound)
    setLast(lastRound)
    setCandidates((c.data ?? []) as Candidate[])
    setTable((tb.data ?? []) as TableRow[])
    if (nextRound) {
      const own = await supabase.from('fanta_picks').select('player_id').eq('round_day', nextRound.round_day).eq('user_id', myId)
      const ids = ((own.data ?? []) as { player_id: string }[]).map((x) => x.player_id)
      setMine(ids)
      setPicks(ids.length === 3 ? ids : ['', '', ''])
    }
    if (lastRound) {
      const r = await supabase.rpc('fanta_round_list', { p_day: lastRound.round_day, p_all: all })
      setRound((r.data ?? []) as RoundPick[])
    } else setRound([])
  }, [season, myId, all])

  useEffect(() => { void load() }, [load])

  async function save() {
    if (!next) return
    setError('')
    setSaved(false)
    if (picks.some((p) => !p) || new Set(picks).size !== 3) return setError(t('fanta.invalid'))
    setBusy(true)
    const { error: e } = await supabase.rpc('set_fanta_picks', { p_day: next.round_day, p_players: picks })
    setBusy(false)
    if (e) return setError(errorText(e))
    setSaved(true)
    await load()
  }

  const people = useMemo(() => groupRound(round), [round])
  const named = (id: string) => {
    const c = candidates.find((x) => x.user_id === id)
    return c ? personName(c) : ''
  }

  return (
    <>
      <p className="hint">{t(canPick ? 'fanta.intro' : 'fanta.introStaff')}</p>

      {next !== undefined && (
        <section className="card" aria-labelledby="fanta-next">
          <h2 id="fanta-next">{t('fanta.next')}</h2>
          {next === null ? (
            <p className="hint">{t(canPick ? 'fanta.noNext' : 'fanta.noNextStaff')}</p>
          ) : (
            <>
              <p>{t(canPick ? 'fanta.nextWhen' : 'fanta.nextWhenStaff', { day: formatDay(next.starts_at), time: formatTime(next.starts_at), n: String(next.games) })}</p>
              {canPick ? (
                <>
                  {[0, 1, 2].map((i) => (
                    <label key={i}>
                      {t('fanta.pickN', { n: String(i + 1) })}
                      <select value={picks[i]} onChange={(e) => { setPicks(picks.map((p, k) => (k === i ? e.target.value : p))); setSaved(false) }}>
                        <option value="">{t('fanta.choose')}</option>
                        {candidates.map((c) => <option key={c.user_id} value={c.user_id}>{personName(c)}</option>)}
                      </select>
                    </label>
                  ))}
                  <button disabled={busy || picks.some((p) => !p)} onClick={() => void save()}>{mine.length === 3 ? t('fanta.change') : t('fanta.save')}</button>
                  {error && <p className="error" role="alert">{error}</p>}
                  {saved && <p className="hint" role="status">{t('fanta.saved')}</p>}
                  <p className="hint">{t('fanta.hint')}</p>
                </>
              ) : (
                <p className="hint">{t('fanta.playerViewOnly')}</p>
              )}
              {!canPick || mine.length !== 3 ? null : <p className="hint">{t('fanta.yours', { names: mine.map(named).filter(Boolean).join(', ') })}</p>}
            </>
          )}
        </section>
      )}

      {last && (
        <section className="card" aria-labelledby="fanta-last">
          <h2 id="fanta-last">{last.over ? t('fanta.last') : t('fanta.running')}</h2>
          <p className="hint">{formatDay(last.starts_at)}</p>
          {people.length === 0 ? (
            <p className="hint">{t('fanta.nobody')}</p>
          ) : (
            <ul className="list">
              {people.map((p) => (
                <li key={p.user_id} className="fanta-person">
                  <span className="fanta-head"><strong data-person-name>{personName(p)}</strong><span className="fanta-total">{t('fanta.points', { n: String(p.total) })}</span></span>
                  <span className="fanta-picks">{p.picks.map((k) => `${personName({ first_name: k.player_first_name, last_name: k.player_last_name })} (${k.points})`).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
          {!last.over && <p className="hint">{t('fanta.rules')}</p>}
        </section>
      )}

      <h2>{t('fanta.table')}</h2>
      {table !== null && table.length === 0 && <p className="hint">{t('fanta.tableEmpty')}</p>}
      {table !== null && table.length > 0 && (
        <TableScroll>
          <table className="stats-table">
            <thead>
              <tr>
                <th scope="col">{t('predict.colPlayer')}</th>
                <th scope="col">{t('fanta.colRounds')}</th>
                <th scope="col">{t('fanta.colPoints')}</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.user_id}>
                  <th scope="row"><span data-person-name>{personName(r)}</span></th>
                  <td>{r.rounds}</td>
                  <td className="strong">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </>
  )
}
