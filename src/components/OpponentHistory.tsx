import { useEffect, useState } from 'react'
import { t } from '../i18n'
import { supabase } from '../lib/supabase'
import { dayKey, formatDateYear } from '../lib/time'
import { tally, type Meeting } from '../lib/opponent'

// The last meetings with the same team, from the club's own games and the stored league games (V1).
// Shows nothing while loading or when there is no earlier meeting.
export default function OpponentHistory({ eventId, opponent }: { eventId: string; opponent: string }) {
  const [rows, setRows] = useState<Meeting[] | null>(null)

  useEffect(() => {
    let live = true
    void supabase.rpc('opponent_history', { p_event_id: eventId }).then(({ data }) => {
      if (live) setRows((data ?? []) as Meeting[])
    })
    return () => { live = false }
  }, [eventId])

  if (!rows || rows.length === 0) return null
  const sum = tally(rows)
  return (
    <section className="card history" aria-labelledby="history-title">
      <h2 id="history-title">{t('history.title', { opponent })}</h2>
      <p className="hint">{t('history.summary', { wins: String(sum.wins), draws: String(sum.draws), losses: String(sum.losses) })}</p>
      <ul className="list">
        {rows.map((m) => (
          <li key={`${m.starts_at}-${m.source}`} className="row">
            <span>{formatDateYear(dayKey(m.starts_at))}</span>
            <span className="hint">{t(m.home_away === 'home' ? 'event.home' : 'event.away')}</span>
            <strong>
              {m.score_for} : {m.score_against}
            </strong>
          </li>
        ))}
      </ul>
    </section>
  )
}
