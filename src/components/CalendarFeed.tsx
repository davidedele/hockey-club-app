import { useState } from 'react'
import { errorText, t } from '../i18n'
import { supabase } from '../lib/supabase'

const base = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/functions/v1/calendar-feed`

// The person's private calendar link. The link is made on first use and shown only on request.
export default function CalendarFeed({ heading = true }: { heading?: boolean }) {
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmNew, setConfirmNew] = useState(false)

  const link = token ? `${base}?t=${token}` : ''
  const webcal = link.replace(/^https?:/, 'webcal:')

  async function load(fresh: boolean) {
    setBusy(true)
    setError('')
    setCopied(false)
    setConfirmNew(false)
    const { data, error: e } = await supabase.rpc(fresh ? 'new_calendar_token' : 'my_calendar_token')
    if (e || typeof data !== 'string') setError(errorText(e))
    else setToken(data)
    setBusy(false)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError(t('calendar.copyFailed'))
    }
  }

  return (
    <section aria-labelledby={heading ? 'calendar-title' : undefined} aria-label={heading ? undefined : t('calendar.title')}>
      {heading && <h2 id="calendar-title">{t('calendar.title')}</h2>}
      <p className="hint">{t('calendar.intro')}</p>
      {!token && <button type="button" className="secondary small" disabled={busy} onClick={() => void load(false)}>{t('calendar.show')}</button>}
      {token && (
        <>
          <label>{t('calendar.linkLabel')}
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <p>
            <button type="button" className="secondary small" onClick={() => void copy()}>{copied ? t('common.copied') : t('common.copy')}</button>{' '}
            <a className="button secondary small" href={webcal}>{t('calendar.open')}</a>
          </p>
          <p className="hint">{t('calendar.privateHint')}</p>
          <p className="hint">{t('calendar.delayHint')}</p>
          {!confirmNew && <button type="button" className="link" disabled={busy} onClick={() => setConfirmNew(true)}>{t('calendar.renew')}</button>}
          {confirmNew && (
            <p>
              <span className="hint">{t('calendar.renewWarning')}</span>{' '}
              <button type="button" className="link danger-link" disabled={busy} onClick={() => void load(true)}>{t('calendar.renewConfirm')}</button>{' '}
              <button type="button" className="link" onClick={() => setConfirmNew(false)}>{t('common.cancel')}</button>
            </p>
          )}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
