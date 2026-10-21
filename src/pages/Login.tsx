import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { getPendingInvite } from '../lib/invite'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import Brand from '../components/Brand'

export default function Login() {
  const { loading, session, profile } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && session && profile) return <Navigate to="/" replace />
  const pending = getPendingInvite()
  if (!loading && session && !profile && pending) return <Navigate to={`/join/${pending}`} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(/email_not_confirmed/.test(`${error.code} ${error.message}`) ? errorText(error) : t('login.invalid'))
    setBusy(false)
  }

  return (
    <div className="page narrow">
      <Brand />
      <h1>{t('login.title')}</h1>
      <form onSubmit={submit}>
        <label>
          {t('common.email')}
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('common.password')}
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>{t('login.submit')}</button>
      </form>
      <p><Link to="/forgot-password">{t('login.forgot')}</Link></p>
      <p className="hint">{t('login.noInvite')}</p>
      {session && !profile && !loading && (
        <button className="link" onClick={() => supabase.auth.signOut()}>{t('common.signOut')}</button>
      )}
    </div>
  )
}
