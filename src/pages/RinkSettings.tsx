import { useCallback, useEffect, useState, type FormEvent } from 'react'
import PageHeader from '../components/PageHeader'
import { Navigate } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { centsToEuro, euroToCents } from '../lib/ice'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Rink, RinkPrice } from '../lib/types'

// The board names the club's rinks and, if it wants the cost as well as the hours, sets a price per hour.
export default function RinkSettings() {
  const { isBoard, loading } = useSession()
  const [rinks, setRinks] = useState<Rink[]>([])
  const [prices, setPrices] = useState<Map<number, number>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([
      supabase.from('rinks').select('id, name').order('name'),
      supabase.from('rink_prices').select('rink_id, price_cents'),
    ])
    setRinks((r.data ?? []) as Rink[])
    setPrices(new Map(((p.data ?? []) as RinkPrice[]).map((x) => [x.rink_id, x.price_cents])))
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!loading && !isBoard) return <Navigate to="/settings" replace />

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('rinks').insert({ name: newName.trim() })
    if (error) return setError(rinkError(error))
    setNewName('')
    await load()
  }

  return (
    <div className="section">
      <PageHeader title={t('settings.rinks')} back={{ to: '/settings', label: t('settings.title') }} description={t('rinks.intro')} />
      {error && <p className="error" role="alert">{error}</p>}
      {loaded && rinks.length === 0 && <p className="hint">{t('rinks.empty')}</p>}
      {rinks.length > 0 && (
        <ul className="list rinks">
          {rinks.map((r) => <RinkRow key={r.id} rink={r} price={prices.get(r.id) ?? null} onChange={load} />)}
        </ul>
      )}
      <h2>{t('rinks.add')}</h2>
      <form onSubmit={add}>
        <label>{t('rinks.name')}
          <input required maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
        <button type="submit">{t('rinks.add')}</button>
      </form>
    </div>
  )
}

function rinkError(error: { message?: string; code?: string }) {
  const text = `${error.code ?? ''} ${error.message ?? ''}`
  if (/23505|duplicate key/.test(text)) return t('rinks.nameTaken')
  if (/23503|foreign key/.test(text)) return t('rinks.inUse')
  return errorText(error)
}

function RinkRow({ rink, price, onChange }: { rink: Rink; price: number | null; onChange: () => Promise<void> }) {
  const [name, setName] = useState(rink.name)
  const [euros, setEuros] = useState(price === null ? '' : centsToEuro(price))
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    const cents = euroToCents(euros)
    if (Number.isNaN(cents)) return setError(t('rinks.priceInvalid'))
    setBusy(true)
    // A change that a rule silently refuses comes back with no rows, and must not look like it worked.
    const named = await supabase.from('rinks').update({ name: name.trim() }).eq('id', rink.id).select()
    if (named.error) { setBusy(false); return setError(rinkError(named.error)) }
    if (!named.data || named.data.length === 0) { setBusy(false); return setError(errorText({ message: 'forbidden' })) }
    const priced = cents === null
      ? await supabase.from('rink_prices').delete().eq('rink_id', rink.id)
      : await supabase.from('rink_prices').upsert({ rink_id: rink.id, price_cents: cents })
    setBusy(false)
    if (priced.error) return setError(errorText(priced.error))
    await onChange()
  }

  async function remove() {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.from('rinks').delete().eq('id', rink.id).select()
    setBusy(false)
    setConfirming(false)
    if (error || !data || data.length === 0) return setError(rinkError(error ?? { message: 'forbidden' }))
    await onChange()
  }

  return (
    <li>
      <form onSubmit={save}>
        <label>{t('rinks.name')}
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>{t('rinks.price')}
          <input inputMode="decimal" value={euros} onChange={(e) => setEuros(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" disabled={busy}>{t('rinks.save')}</button>
          {!confirming && <button type="button" className="danger" disabled={busy} onClick={() => setConfirming(true)}>{t('rinks.remove')}</button>}
        </div>
      </form>
      {confirming && (
        <div className="box" role="alertdialog" aria-label={t('rinks.remove')}>
          <p>{t('rinks.removeConfirm', { name: rink.name })}</p>
          <div className="actions">
            <button className="danger" disabled={busy} onClick={() => void remove()}>{t('rinks.remove')}</button>
            <button className="link" disabled={busy} onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </li>
  )
}
