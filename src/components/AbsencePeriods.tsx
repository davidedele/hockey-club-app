import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { errorText, t, type MessageKey } from '../i18n'
import { checked } from '../lib/formcheck'
import { supabase } from '../lib/supabase'
import { dayKey, daysBetween, formatDate, rangeParts } from '../lib/time'
import type { AbsencePeriod, AbsenceReason } from '../lib/types'

const REASONS: AbsenceReason[] = ['work', 'injury', 'illness', 'travel', 'other']

export const absenceRange = (p: { starts_on: string; ends_on: string }) =>
  p.starts_on === p.ends_on ? t('absence.oneDay', { day: formatDate(p.starts_on) }) : t('absence.range', rangeParts(p.starts_on, p.ends_on))

// Planned absences of one person, with a form to add one. Used on the own profile and by staff on a member's page.
// name is given when staff look at someone else.
export default function AbsencePeriods({ userId, name, heading = true }: { userId: string; name?: string; heading?: boolean }) {
  const today = dayKey(new Date().toISOString())
  const [periods, setPeriods] = useState<AbsencePeriod[]>([])
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [reason, setReason] = useState<AbsenceReason | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('absence_periods').select('*').eq('user_id', userId).gte('ends_on', today).order('starts_on')
    setPeriods((data ?? []) as AbsencePeriod[])
  }, [userId, today])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (to < from) return setError(t('absence.toBeforeFrom'))
    if (daysBetween(from, to) > 365) return setError(t('absence.tooLong'))
    setBusy(true)
    const { error } = await supabase.rpc('add_absence', { p_user_id: userId, p_starts_on: from, p_ends_on: to, p_reason: reason || null })
    if (error) setError(errorText(error))
    else setReason('')
    await load()
    window.dispatchEvent(new Event('attendance-changed'))
    setBusy(false)
  }

  async function remove(id: string) {
    setBusy(true)
    setError('')
    const { error, data } = await supabase.from('absence_periods').delete().eq('id', id).select()
    if (error || !data || data.length === 0) setError(errorText(error ?? { message: 'forbidden' }))
    await load()
    window.dispatchEvent(new Event('attendance-changed'))
    setBusy(false)
  }

  return (
    <section aria-labelledby={heading ? 'absences-title' : undefined} aria-label={heading ? undefined : t('absence.title')}>
      {heading && <h2 id="absences-title">{t('absence.title')}</h2>}
      <p className="hint">{name ? t('absence.introStaff', { name }) : t('absence.intro')}</p>
      {periods.length === 0 ? (
        <p className="hint">{t('absence.none')}</p>
      ) : (
        <ul className="list">
          {periods.map((p) => (
            <li key={p.id} className="row">
              <span>
                {absenceRange(p)}
                {p.reason && <span className="hint absence-reason">{t(`reason.${p.reason}` as MessageKey)}</span>}
              </span>
              <button className="link" disabled={busy} aria-label={t('absence.removeLabel', { range: absenceRange(p) })} onClick={() => void remove(p.id)}>
                {t('absence.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="absence-form" {...checked(add)}>
        <div className="absence-dates">
          <label>
            {t('absence.from')}
            <input type="date" required min={today} value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} />
          </label>
          <label>
            {t('absence.to')}
            <input type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        <label htmlFor="absence-reason">{t('absence.reason')}</label>
        <select id="absence-reason" className="full" value={reason} onChange={(e) => setReason(e.target.value as AbsenceReason | '')}>
          <option value="">{t('absence.reasonNone')}</option>
          {REASONS.map((r) => <option key={r} value={r}>{t(`reason.${r}` as MessageKey)}</option>)}
        </select>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" className="secondary" disabled={busy}>{t('absence.add')}</button>
      </form>
    </section>
  )
}
