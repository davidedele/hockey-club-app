import { useEffect, useState, type FormEvent } from 'react'
import ConfirmAction from '../components/ConfirmAction'
import PageHeader from '../components/PageHeader'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { cleanCode, deadlineParts, useFactors, validCode } from '../lib/mfa'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

// "Sicurezza": the second step of signing in, with an authenticator app. Everybody can switch it on; the
// board has to, after the date the club set (the database then asks the second step for board powers).
export default function Security() {
  const { realRoles } = useSession()
  const { factors, reload } = useFactors()
  const [from, setFrom] = useState<string | null>(null)
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const board = realRoles.includes('board')

  useEffect(() => {
    void supabase.from('club_settings').select('mfa_required_from').maybeSingle().then(({ data }) => setFrom((data as { mfa_required_from: string | null } | null)?.mfa_required_from ?? null))
  }, [])

  async function start() {
    setBusy(true)
    setError('')
    setMessage('')
    // A set up that was never finished would block a new one.
    const all = await supabase.auth.mfa.listFactors()
    for (const f of (all.data?.all ?? []) as { id: string; status: string }[]) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: t('mfa.factorName') })
    setBusy(false)
    if (e || !data) return setError(errorText(e ?? { message: 'mfa' }))
    setSetup({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!setup) return
    if (!validCode(code)) return setError(t('mfa.codeInvalid'))
    setBusy(true)
    setError('')
    const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: setup.id, code: cleanCode(code) })
    setBusy(false)
    if (e2) return setError(/invalid|expired/i.test(e2.message) ? t('mfa.codeWrong') : errorText(e2))
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

  const on = (factors?.length ?? 0) > 0
  const deadline = from ? deadlineParts(from) : null
  return (
    <div className="section">
      <PageHeader title={t('mfa.title')} back={{ to: '/profile', label: t('profile.back') }} description={t('mfa.intro')} />
      {board && !on && <p className="box" role="status">{deadline ? t('mfa.boardDeadline', deadline) : t('mfa.boardNoDate')}</p>}
      {board && on && <p className="hint">{t('mfa.boardOn')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}
      {factors === null ? <p className="hint">{'–'}</p> : on ? (
        <section aria-labelledby="mfa-on">
          <h2 id="mfa-on">{t('mfa.statusOn')}</h2>
          {factors.map((f) => (
            <ConfirmAction key={f.id} label={t('mfa.remove')} title={t('mfa.removeTitle')} body={t('mfa.removeBody')} confirm={t('mfa.remove')} disabled={busy} onConfirm={() => void remove(f.id)} />
          ))}
        </section>
      ) : setup ? (
        <form {...checked(confirm)}>
          <h2>{t('mfa.setupTitle')}</h2>
          <ol>
            <li>{t('mfa.step1')}</li>
            <li>{t('mfa.step2')}</li>
            <li>{t('mfa.step3')}</li>
          </ol>
          <img className="qr" src={setup.qr} alt={t('mfa.qrAlt')} width={200} height={200} />
          <p className="hint">{t('mfa.secretHint')} <code>{setup.secret}</code></p>
          <label>{t('mfa.code')}
            <input required inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <div className="actions">
            <button type="submit" disabled={busy}>{t('mfa.verify')}</button>
            <button type="button" className="link" disabled={busy} onClick={() => { setSetup(null); setCode('') }}>{t('common.cancel')}</button>
          </div>
        </form>
      ) : (
        <section aria-labelledby="mfa-off">
          <h2 id="mfa-off">{t('mfa.statusOff')}</h2>
          <p className="hint">{t('mfa.whatFor')}</p>
          <button type="button" disabled={busy} onClick={() => void start()}>{t('mfa.enable')}</button>
        </section>
      )}
    </div>
  )
}
