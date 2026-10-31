import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatPhone, phoneLink } from '../lib/phone'
import type { UnansweredRow } from '../lib/types'

const WINDOWS = [3, 7, 14]

// A tab of the attendance page for coaches: who still has to answer, with the contacts to reach them.
export default function Unanswered() {
  const { isStaff } = useSession()
  const [days, setDays] = useState(7)
  const [rows, setRows] = useState<UnansweredRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoaded(false)
    void (async () => {
      const { data, error } = await supabase.rpc('unanswered_people', { p_days: days })
      if (error) setError(errorText(error))
      else setError('')
      setRows((data ?? []) as UnansweredRow[])
      setLoaded(true)
    })()
  }, [days])

  if (!isStaff) return <Navigate to="/events" replace />

  return (
    <>
      <p className="hint tab-intro">{t('unanswered.intro')}</p>
      <div className="chips" role="group" aria-label={t('unanswered.window')}>
        {WINDOWS.map((n) => (
          <button key={n} className={days === n ? 'chip on' : 'chip'} aria-pressed={days === n} onClick={() => setDays(n)}>
            {t('unanswered.days', { n: String(n) })}
          </button>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && !error && rows.length === 0 && <p className="hint">{t('unanswered.empty')}</p>}
      <ul className="list">
        {rows.map((r) => (
          <li key={r.user_id}>
            <div className="row">
              <strong data-person-name>{r.last_name} {r.first_name}</strong>
              <span className="tag todo">{r.missing === 1 ? t('unanswered.one') : t('unanswered.many', { n: String(r.missing) })}</span>
            </div>
            <div className="contacts">
              {r.phone && <a href={phoneLink(r.phone)}>{formatPhone(r.phone)}</a>}
              <a href={`mailto:${r.email}`}>{r.email}</a>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
