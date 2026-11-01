import { useEffect, useState, type FormEvent } from 'react'
import ConfirmAction from '../components/ConfirmAction'
import PageHeader from '../components/PageHeader'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { cleanCode, deadlineParts, keepSetup, savedSetup, useFactors, validCode, type PendingSetup } from '../lib/mfa'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { dayKey } from '../lib/time'

// "Sicurezza": the second step of signing in, with an authenticator app. It is optional for everybody, the board
// included (decision 130). The board may require it from a date it chooses; the page then says what happens.
export default function Security() {
  const { realRoles } = useSession()
  const { factors, unfinished, reload } = useFactors()
  const [from, setFrom] = useState<string | null>(null)
  const [setup, setSetup] = useState<PendingSetup | null>(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [startDate, setStartDate] = useState(() => dayKey(new Date(Date.now() + 30 * 864e5).toISOString()))
  const board = realRoles.includes('board')

  const loadDate = () => supabase.from('club_settings').select('mfa_required_from').maybeSingle().then(({ data }) => setFrom((data as { mfa_required_from: string | null } | null)?.mfa_required_from ?? null))
  useEffect(() => { void loadDate() }, [])
  // After a reload the QR code of an unfinished setup comes back from this tab, when it is the same app.
  useEffect(() => {
    if (!unfinished) return
    const kept = savedSetup()
    if (kept && kept.id === unfinished.id) setSetup((now) => now ?? kept)
  }, [unfinished])

  async function start() {
    setBusy(true)
    setError('')
    setCodeError('')
    setMessage('')
    // An unfinished setup would block a new one: it goes first.
    const all = await supabase.auth.mfa.listFactors()
    for (const f of (all.data?.all ?? []) as { id: string; status: string }[]) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: t('mfa.factorName') })
    setBusy(false)
    if (e || !data) return setError(errorText(e ?? { message: 'mfa' }))
    const next = { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
    keepSetup(next)
    setSetup(next)
    setCode('')
    await reload()
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    const factorId = setup?.id ?? unfinished?.id
    if (!factorId) return
    if (!validCode(code)) return setCodeError(t('mfa.codeInvalid'))
    setBusy(true)
    setError('')
    setCodeError('')
    const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: cleanCode(code) })
    setBusy(false)
    if (e2) {
      if (/invalid|expired/i.test(e2.message)) setCodeError(t('mfa.codeWrong'))
      else setError(errorText(e2))
      return
    }
    keepSetup(null)
    setSetup(null)
    setCode('')
    setMessage(t('mfa.done'))
    await supabase.auth.refreshSession()
    await reload()
  }

  async function remove(id: string) {
    setBusy(true)
    setError('')
    const { error: e } = await supabase.auth.mfa.unenroll({ factorId: id })
    setBusy(false)
    if (e) return setError(errorText(e))
    setMessage(t('mfa.removed'))
    await reload()
  }

  async function requireFromDate() {
    const tomorrow = dayKey(new Date(Date.now() + 864e5).toISOString())
    if (!startDate || startDate < tomorrow) return setError(t('mfa.clubDateInvalid'))
    setBusy(true)
    setError('')
    const { error: e } = await supabase.from('club_settings').update({ mfa_required_from: new Date(`${startDate}T00:00:00`).toISOString() }).eq('id', true)
    setBusy(false)
    if (e) return setError(errorText(e))
    await loadDate()
  }

  async function stopRequiring() {
    setBusy(true)
    setError('')
    const { error: e } = await supabase.from('club_settings').update({ mfa_required_from: null }).eq('id', true)
    setBusy(false)
    if (e) return setError(errorText(e))
    await loadDate()
  }

  const on = (factors?.length ?? 0) > 0
  const required = from !== null && new Date(from).getTime() <= Date.now()
  const deadline = from ? deadlineParts(from) : null
  const unfinishedForm = !on && Boolean(setup || unfinished)
  return (
    <div className="section">
      <PageHeader title={t('mfa.title')} back={{ to: '/profile', label: t('profile.back') }} description={t('mfa.intro')} />
      {board && !on && deadline && <p className="box" role="status">{required ? t('mfa.boardRequired') : t('mfa.boardDeadline', deadline)}</p>}
      {board && on && deadline && <p className="hint">{t('mfa.boardOn')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}
      {factors === null ? <p className="hint">{'–'}</p> : on ? (
        <section aria-labelledby="mfa-on">
          <h2 id="mfa-on">{t('mfa.statusOn')}</h2>
          {factors.map((f) => (
            <ConfirmAction key={f.id} label={t('mfa.remove')} title={t('mfa.removeTitle')} body={t(board && from ? 'mfa.removeBodyRequired' : 'mfa.removeBody')} confirm={t('mfa.remove')} disabled={busy} onConfirm={() => void remove(f.id)} />
          ))}
        </section>
      ) : unfinishedForm ? (
        <form {...checked(confirm)}>
          <h2>{t('mfa.setupTitle')}</h2>
          {!setup && <p className="box" role="status">{t('mfa.unfinished')}</p>}
          {setup && (
            <>
              <ol>
                <li>{t('mfa.step1')}</li>
                <li>{t('mfa.step2')}</li>
                <li>{t('mfa.step3')}</li>
              </ol>
              <img className="qr" src={setup.qr} alt={t('mfa.qrAlt')} width={200} height={200} />
              <p className="hint">{t('mfa.secretHint')} <code>{setup.secret}</code></p>
            </>
          )}
          <label>{t('mfa.code')}
            <input required inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} aria-invalid={codeError ? true : undefined} aria-describedby={codeError ? 'mfa-code-error' : undefined} onChange={(e) => { setCode(e.target.value); setCodeError('') }} />
          </label>
          {codeError && <p className="error" id="mfa-code-error" role="alert">{codeError}</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>{t('mfa.verify')}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void start()}>{t('mfa.restart')}</button>
            <button type="button" className="link" disabled={busy} onClick={() => { void (async () => { if (unfinished) await supabase.auth.mfa.unenroll({ factorId: unfinished.id }); keepSetup(null); setSetup(null); setCode(''); setCodeError(''); await reload() })() }}>{t('common.cancel')}</button>
          </div>
        </form>
      ) : (
        <section aria-labelledby="mfa-off">
          <h2 id="mfa-off">{t('mfa.statusOff')}</h2>
          <p className="hint">{t('mfa.whatFor')}</p>
          <button type="button" disabled={busy} onClick={() => void start()}>{t('mfa.enable')}</button>
        </section>
      )}
      {board && factors !== null && (
        <section aria-labelledby="mfa-club">
          <h2 id="mfa-club">{t('mfa.clubTitle')}</h2>
          {deadline ? (
            <>
              <p className="hint">{t('mfa.clubOn', deadline)}</p>
              <ConfirmAction label={t('mfa.clubTurnOff')} title={t('mfa.clubTurnOffTitle')} body={t('mfa.clubTurnOffBody')} confirm={t('mfa.clubTurnOff')} disabled={busy} onConfirm={() => void stopRequiring()} />
            </>
          ) : (
            <>
              <p className="hint">{t('mfa.clubOff')}</p>
              {!on ? <p className="hint">{t('mfa.clubNeedOwn')}</p> : (
                <>
                  <label>{t('mfa.clubFrom')}
                    <input type="date" value={startDate} min={dayKey(new Date(Date.now() + 864e5).toISOString())} onChange={(e) => setStartDate(e.target.value)} />
                  </label>
                  <ConfirmAction label={t('mfa.clubTurnOn')} title={t('mfa.clubTurnOnTitle')} body={t('mfa.clubTurnOnBody')} confirm={t('mfa.clubTurnOn')} disabled={busy || !startDate} onConfirm={() => void requireFromDate()} />
                </>
              )}
            </>
          )}
        </section>
      )}
    </div>
  )
}
