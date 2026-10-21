import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

export default function Join() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { loading, session, reload } = useSession()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const redeemed = useRef(false)

  // Signed in (after confirming the email, or an existing member): use the invite once.
  useEffect(() => {
    if (loading || !session || redeemed.current) return
    redeemed.current = true
    setBusy(true)
    const meta = session.user.user_metadata as { first_name?: string; last_name?: string }
    supabase
      .rpc('redeem_invite', { p_token: token, p_first_name: meta.first_name ?? null, p_last_name: meta.last_name ?? null })
      .then(async ({ error }) => {
        if (error) {
          setError(errorText(error))
          setBusy(false)
          return
        }
        await reload()
        navigate('/', { replace: true })
      })
  }, [loading, session, token, reload, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.href,
        data: { first_name: firstName.trim(), last_name: lastName.trim() },
      },
    })
    if (error) setError(errorText(error))
    else setSent(true)
    setBusy(false)
  }

  if (loading || session) {
    return (
      <div className="page narrow">
        <h1>{t('join.title')}</h1>
        {error ? <p className="error">{error}</p> : <p>{t('join.working')}</p>}
        {error && <p><Link to="/">{t('nav.members')}</Link></p>}
      </div>
    )
  }

  if (sent) {
    return (
      <div className="page narrow">
        <h1>{t('join.title')}</h1>
        <p>{t('join.checkEmail')}</p>
      </div>
    )
  }

  return (
    <div className="page narrow">
      <h1>{t('join.title')}</h1>
      <p>{t('join.intro')}</p>
      <form onSubmit={submit}>
        <label>
          {t('common.firstName')}
          <input required autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label>
          {t('common.lastName')}
          <input required autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
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
