import { useCallback, useEffect, useState } from 'react'
import { errorText, t } from '../i18n'
import { personName } from '../lib/names'
import { closedReason } from '../lib/predictions'
import { supabase } from '../lib/supabase'

interface Guess {
  user_id: string
  first_name: string
  last_name: string
  pred_for: number
  pred_against: number
  points: number | null
}

// Match predictions (V7). Before the game a player in the game's groups guesses the score, ours first, and
// can change it until the start. Others' guesses appear only after the start, with the points once the final
// score is in. canGuess is true only in the player view (decisions 93 and 106).
export default function Predictions({ eventId, myId, started, canGuess, inGroups }: { eventId: string; myId: string; started: boolean; canGuess: boolean; inGroups: boolean }) {
  const [mine, setMine] = useState<{ pred_for: number; pred_against: number } | null | undefined>(undefined)
  const [list, setList] = useState<Guess[]>([])
  const [us, setUs] = useState('')
  const [them, setThem] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (started) {
      const r = await supabase.rpc('game_prediction_list', { p_event_id: eventId })
      setList((r.data ?? []) as Guess[])
      setMine(null)
      return
    }
    const r = await supabase.from('game_predictions').select('pred_for, pred_against').eq('event_id', eventId).eq('user_id', myId).maybeSingle()
    const row = r.data as { pred_for: number; pred_against: number } | null
    setMine(row)
    setUs(row ? String(row.pred_for) : '')
    setThem(row ? String(row.pred_against) : '')
  }, [eventId, myId, started])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setError('')
    setSaved(false)
    const a = Number(us)
    const b = Number(them)
    if (us === '' || them === '' || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 30 || b > 30) return setError(t('predict.invalid'))
    setBusy(true)
    const { error: e } = await supabase.rpc('set_prediction', { p_event_id: eventId, p_for: a, p_against: b })
    setBusy(false)
    if (e) {
      if (!`${e.message ?? ''}`.includes('prediction_closed')) return setError(errorText(e))
      // One code for four causes: look at the game now to say which one.
      const g = await supabase.from('events').select('starts_at, cancelled_at').eq('id', eventId).maybeSingle()
      const row = g.data as { starts_at: string; cancelled_at: string | null } | null
      return setError(t(closedReason({ cancelled: row?.cancelled_at != null, started: started || (row ? new Date(row.starts_at).getTime() <= Date.now() : false), inGroups })))
    }
    setSaved(true)
    await load()
  }

  if (mine === undefined) return null
  if (started) {
    if (list.length === 0) return null
    return (
      <section className="card" aria-labelledby="predict-title">
        <h2 id="predict-title">{t('predict.title')}</h2>
        <ul className="list">
          {list.map((g) => (
            <li key={g.user_id} className="row">
              <span>{personName(g)}</span>
              <span>
                <strong>{g.pred_for} : {g.pred_against}</strong>
                {g.points !== null && <small className="hint"> {g.points === 1 ? t('predict.pointOne') : t('predict.points', { n: String(g.points) })}</small>}
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">{t('predict.listHint')}</p>
      </section>
    )
  }
  if (!canGuess) return null
  return (
    <section className="card" aria-labelledby="predict-title">
      <h2 id="predict-title">{t('predict.mine')}</h2>
      <div className="score">
        <label>
          {t('event.scoreUs')}
          <input type="number" inputMode="numeric" min={0} max={30} value={us} onChange={(e) => { setUs(e.target.value); setSaved(false) }} />
        </label>
        <label>
          {t('event.scoreThem')}
          <input type="number" inputMode="numeric" min={0} max={30} value={them} onChange={(e) => { setThem(e.target.value); setSaved(false) }} />
        </label>
      </div>
      <button disabled={busy || us === '' || them === ''} onClick={() => void save()}>{mine ? t('predict.change') : t('predict.save')}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {saved && <p className="hint" role="status">{t('predict.saved')}</p>}
      <p className="hint">{t('predict.hint')}</p>
    </section>
  )
}
