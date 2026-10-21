import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { supabase } from '../lib/supabase'
import Brand from '../components/Brand'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(t('common.error'))
    else setDone(true)
  }

  return (
    <div className="page narrow">
      <Brand />
      <h1>{t('reset.newTitle')}</h1>
      {done ? (
        <p>{t('reset.done')} <Link to="/">{t('nav.members')}</Link></p>
      ) : (
        <form onSubmit={submit}>
          <label>
            {t('common.password')}
            <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit">{t('reset.newSubmit')}</button>
        </form>
      )}
    </div>
  )
}
