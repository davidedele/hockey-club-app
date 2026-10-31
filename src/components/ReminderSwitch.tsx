import { useEffect, useState } from 'react'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

// The person's own choice about reminder emails. On unless they switched it off.
export default function ReminderSwitch({ heading = true }: { heading?: boolean }) {
  const { profile } = useSession()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile) return
    void supabase
      .from('reminder_prefs')
      .select('enabled')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => setEnabled((data as { enabled: boolean } | null)?.enabled ?? true))
  }, [profile])

  async function change(next: boolean) {
    setBusy(true)
    setError('')
    const { error: e } = await supabase.rpc('set_reminders', { p_enabled: next })
    if (e) setError(errorText(e))
    else setEnabled(next)
    setBusy(false)
  }

  if (enabled === null) return null
  return (
    <section aria-labelledby={heading ? 'reminders-title' : undefined} aria-label={heading ? undefined : t('reminders.title')}>
      {heading && <h2 id="reminders-title">{t('reminders.title')}</h2>}
      <label className="check">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => void change(e.target.checked)} />
        {t('reminders.label')}
      </label>
      <p className="hint">{t('reminders.hint')}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
