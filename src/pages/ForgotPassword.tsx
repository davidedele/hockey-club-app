import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
    // The same answer whether or not the address exists.
    setSent(true)
  }

  return (
    <div className="page narrow">
      <h1>{t('reset.title')}</h1>
      {sent ? (
        <p>{t('reset.sent')}</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            {t('common.email')}
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit">{t('reset.submit')}</button>
        </form>
      )}
      <p><Link to="/login">{t('login.title')}</Link></p>
    </div>
  )
}
