import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { errorText, t } from '../i18n'
import { useClub } from '../lib/club'
import { checked } from '../lib/formcheck'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

// "Documenti richiesti" (decision 132, phase 1): the parts of the two requirements the board can set. Board only.
export default function DocumentSettings() {
  const { isBoard, loading } = useSession()
  const club = useClub()
  const [months, setMonths] = useState(String(club.certificateMonths))
  const [review, setReview] = useState(club.certificateReview)
  const [mode, setMode] = useState(club.consentMode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setMonths(String(club.certificateMonths))
    setReview(club.certificateReview)
    setMode(club.consentMode)
  }, [club.certificateMonths, club.certificateReview, club.consentMode])

  if (!loading && !isBoard) return <Navigate to="/settings" replace />

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = Number(months)
    if (!Number.isInteger(n) || n < 1 || n > 36) return setError(t('reqdocs.monthsInvalid'))
    setBusy(true)
    setError('')
    setMessage('')
    // A refusal by row level security comes back with no rows.
    const { data, error: e2 } = await supabase.from('club_settings').update({ certificate_months: n, certificate_review: review, consent_mode: mode }).eq('id', true).select()
    setBusy(false)
    if (e2 || !data || data.length === 0) return setError(errorText(e2 ?? { message: 'forbidden' }))
    setMessage(t('reqdocs.saved'))
    await club.reload()
  }

  return (
    <div className="section">
      <PageHeader title={t('settings.documents')} back={{ to: '/settings', label: t('settings.title') }} description={t('reqdocs.intro')} />
      <form className="form-col" {...checked(save)}>
        <h2>{t('reqdocs.certTitle')}</h2>
        <label>{t('reqdocs.months')}
          <input type="number" required min={1} max={36} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} />
          <span className="hint">{t('reqdocs.monthsHint')}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
          {t('reqdocs.review')}
        </label>
        <p className="hint">{t('reqdocs.reviewHint')}</p>
        <h2>{t('reqdocs.consentTitle')}</h2>
        <div role="radiogroup" aria-labelledby="consent-mode-label">
          <span id="consent-mode-label" className="legend">{t('reqdocs.consentMode')}</span>
          <label className="check"><input type="radio" name="consent-mode" checked={mode === 'button'} onChange={() => setMode('button')} />{t('reqdocs.consentButton')}</label>
          <label className="check"><input type="radio" name="consent-mode" checked={mode === 'tick'} onChange={() => setMode('tick')} />{t('reqdocs.consentTick')}</label>
        </div>
        <p className="hint">{t('reqdocs.consentHint')}</p>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="hint" role="status">{message}</p>}
        <button type="submit" disabled={busy}>{t('reqdocs.save')}</button>
      </form>
    </div>
  )
}
