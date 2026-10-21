import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { errorText, t, type MessageKey } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { SummaryRow } from '../lib/types'

const COLUMNS = [
  'events_total', 'answered_present', 'answered_absent', 'no_answer',
  'on_time', 'late', 'excused', 'unexcused', 'injured', 'not_called_up',
] as const

// Finished events per player: what players answered and what staff recorded.
export default function AttendanceSummary() {
  const { isStaff } = useSession()
  const [recent, setRecent] = useState(false)
  const [rows, setRows] = useState<SummaryRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoaded(false)
    void (async () => {
      const from = recent ? new Date(Date.now() - 30 * 86400000).toISOString() : null
      const { data, error } = await supabase.rpc('attendance_summary', { p_from: from, p_to: null })
      if (error) setError(errorText(error))
      else setError('')
      setRows((data ?? []) as SummaryRow[])
      setLoaded(true)
    })()
  }, [recent])

  if (!isStaff) return <Navigate to="/events" replace />

  return (
    <div className="page wide">
      <p><Link to="/events">{t('event.back')}</Link></p>
      <h1>{t('summary.title')}</h1>
      <p className="hint">{t('summary.intro')}</p>
      <div className="chips">
        <button className={!recent ? 'chip on' : 'chip'} aria-pressed={!recent} onClick={() => setRecent(false)}>{t('summary.all')}</button>
        <button className={recent ? 'chip on' : 'chip'} aria-pressed={recent} onClick={() => setRecent(true)}>{t('summary.last30')}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && !error && rows.length === 0 && <p className="hint">{t('summary.empty')}</p>}
      {rows.length > 0 && (
        <p className="hint">{t('summary.scrollHint')}</p>
      )}
      {rows.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('summary.player')}</th>
                {COLUMNS.map((c) => <th scope="col" key={c}>{t(`summary.${c}` as MessageKey)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <th scope="row">{r.last_name} {r.first_name}</th>
                  {COLUMNS.map((c) => <td key={c}>{r[c]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
