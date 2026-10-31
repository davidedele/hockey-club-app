import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { nameHasDigits, tidyName } from '../lib/names'
import { clearPendingInvite, savePendingInvite } from '../lib/invite'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import Brand from '../components/Brand'

export default function Join() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { loading, session, profile, reload } = useSession()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [wait, setWait] = useState(0)
  const redeemed = useRef(false)

  useEffect(() => {
    if (token) savePendingInvite(token)
  }, [token])

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  async function resend() {
    setError('')
    setResent(false)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/join/${token}` },
    })
    if (error) setError(errorText(error))
    else setResent(true)
    setWait(60)
  }

  async function redeem() {
    if (!session) return
    setBusy(true)
    setError('')
    const meta = session.user.user_metadata as { first_name?: string; last_name?: string }
    const { error } = await supabase.rpc('redeem_invite', {
      p_token: token,
      p_first_name: meta.first_name ?? null,
      p_last_name: meta.last_name ?? null,
    })
    if (error) {
      setError(errorText(error))
      setBusy(false)
      return
    }
    clearPendingInvite()
    await reload()
    navigate('/', { replace: true })
  }

  // A new person (signed up, no profile yet) is joined automatically. A member who is
  // already signed in must press the button, so opening a link by accident uses nothing.
  useEffect(() => {
    if (loading || !session || profile || redeemed.current) return
    redeemed.current = true
    void redeem()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session, profile])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (nameHasDigits(firstName) || nameHasDigits(lastName)) return setError(t('error.name_digits'))
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/join/${token}`,
        data: { first_name: tidyName(firstName), last_name: tidyName(lastName) },
      },
    })
    if (error) setError(errorText(error))
    else {
      savePendingInvite(token)
      setSent(true)
      setWait(60)
    }
    setBusy(false)
  }

  if (loading || session) {
    return (
      <div className="page narrow">
      <Brand />
        <h1>{t('join.title')}</h1>
        {loading && <p>{t('common.loading')}</p>}
        {!loading && profile && !busy && !error && <p>{t('join.existing')}</p>}
        {!loading && profile && !busy && !error && <button onClick={redeem}>{t('join.useInvite')}</button>}
        {!loading && error && <p className="error">{error}</p>}
        {!loading && !error && (!profile || busy) && <p>{t('join.working')}</p>}
        {error && <p><Link to="/">{t('nav.home')}</Link></p>}
      </div>
    )
  }

  if (sent) {
    return (
      <div className="page narrow">
      <Brand />
        <h1>{t('join.sentTitle')}</h1>
        <p>{t('join.sentText', { email })}</p>
        <ol className="steps">
          <li>{t('join.sentStep1')}</li>
          <li>{t('join.sentStep2')}</li>
        </ol>
        {error && <p className="error">{error}</p>}
        {resent && <p role="status">{t('join.resent')}</p>}
        <button className="link" onClick={resend} disabled={wait > 0}>
          {wait > 0 ? t('join.resendWait', { n: String(wait) }) : t('join.resend')}
        </button>
        <p className="hint">{t('join.spam')}</p>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <Brand />
      <h1>{t('join.title')}</h1>
      <p>{t('join.intro')}</p>
      <form {...checked(submit)}>
        <label>
          {t('common.firstName')}
          <input required autoComplete="given-name" autoCapitalize="words" value={firstName} onChange={(e) => setFirstName(e.target.value)} onBlur={() => { setFirstName(tidyName(firstName)); if (nameHasDigits(firstName)) setError(t('error.name_digits')) }} />
        </label>
        <label>
          {t('common.lastName')}
          <input required autoComplete="family-name" autoCapitalize="words" value={lastName} onChange={(e) => setLastName(e.target.value)} onBlur={() => { setLastName(tidyName(lastName)); if (nameHasDigits(lastName)) setError(t('error.name_digits')) }} />
        </label>
        <label>
          {t('common.email')}
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('common.password')}
          <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="hint">{t('join.passwordHint')}</span>
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{t('join.submit')}</button>
      </form>
      <p className="hint">{t('join.haveAccount')}</p>
      <p><Link to="/login">{t('login.title')}</Link></p>
    </div>
  )
}
