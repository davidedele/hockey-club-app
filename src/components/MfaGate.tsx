import { useState, type FormEvent } from 'react'
import Brand from './Brand'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { cleanCode, validCode } from '../lib/mfa'
import { signOut } from '../lib/session'
import { supabase } from '../lib/supabase'

// The second step of signing in: the code of the authenticator app. Shown instead of the app while a
// session has only passed the password.
export default function MfaGate({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!validCode(code)) return setError(t('mfa.codeInvalid'))
    setBusy(true)
    setError('')
    const factors = await supabase.auth.mfa.listFactors()
    const factor = factors.data?.totp?.[0]
    if (!factor) { setBusy(false); return setError(t('mfa.noFactor')) }
    const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: cleanCode(code) })
    setBusy(false)
    if (e2) return setError(/invalid|expired/i.test(e2.message) ? t('mfa.codeWrong') : errorText(e2))
    onDone()
  }

  return (
    <div className="page narrow">
      <Brand />
      <h1>{t('mfa.gateTitle')}</h1>
      <p>{t('mfa.gateText')}</p>
      <form {...checked(submit)}>
        <label>{t('mfa.code')}
          <input required inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>{t('mfa.verify')}</button>
      </form>
      <p><button className="link" onClick={() => void signOut()}>{t('common.signOut')}</button></p>
      <p className="hint">{t('mfa.lost')}</p>
    </div>
  )
}
