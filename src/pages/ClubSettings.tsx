import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Crest from '../components/Crest'
import { errorText, t } from '../i18n'
import { useClub } from '../lib/club'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_BYTES = 1024 * 1024

// Staff set the club name, logo and game day colours here.
export default function ClubSettings() {
  const { isStaff, loading } = useSession()
  const club = useClub()
  const [name, setName] = useState(club.name)
  const [dark, setDark] = useState(club.gameDark)
  const [light, setLight] = useState(club.gameLight)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setName(club.name)
    setDark(club.gameDark)
    setLight(club.gameLight)
  }, [club.name, club.gameDark, club.gameLight])

  if (!loading && !isStaff) return <Navigate to="/events" replace />

  // An update that row level security silently refuses comes back with no rows.
  async function update(values: Record<string, string | null>) {
    const { data, error } = await supabase.from('club_settings').update(values).eq('id', true).select()
    if (error) return errorText(error)
    if (!data || data.length === 0) return errorText({ message: 'forbidden' })
    return ''
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const problem = await update({ name: name.trim(), game_dark: dark, game_light: light })
    if (problem) setError(problem)
    else {
      setError('')
      setMessage(t('common.saved'))
      await club.reload()
    }
    setBusy(false)
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMessage('')
    const ext = TYPES[file.type]
    if (!ext) return setError(t('club.logoType'))
    if (file.size > MAX_BYTES) return setError(t('club.logoTooBig'))
    setBusy(true)
    const path = `logo-${Date.now()}.${ext}`
    const up = await supabase.storage.from('club').upload(path, file, { contentType: file.type })
    const problem = up.error ? errorText(up.error) : await update({ logo_path: path })
    if (problem && !up.error) await supabase.storage.from('club').remove([path])
    if (!problem && club.logoPath) await supabase.storage.from('club').remove([club.logoPath])
    if (problem) setError(problem)
    else {
      setError('')
      setMessage(t('common.saved'))
      await club.reload()
    }
    setBusy(false)
  }

  async function removeLogo() {
    setBusy(true)
    setMessage('')
    const problem = await update({ logo_path: null })
    if (!problem && club.logoPath) await supabase.storage.from('club').remove([club.logoPath])
    if (problem) setError(problem)
    else {
      setError('')
      await club.reload()
    }
    setBusy(false)
  }

  return (
    <div className="page narrow">
      <p><Link to="/settings">{t('settings.title')}</Link></p>
      <h1>{t('club.title')}</h1>
      <p className="hint">{t('club.intro')}</p>

      <h2>{t('club.logo')}</h2>
      <div className="logo-row">
        <span className="logo-big"><Crest /></span>
        <div>
          {!club.logoPath && <p className="hint">{t('club.logoNone')}</p>}
          <label className="button file">
            {t('club.logoChoose')}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => void upload(e)} />
          </label>
          {club.logoPath && <button className="link" disabled={busy} onClick={() => void removeLogo()}>{t('club.logoRemove')}</button>}
          <p className="hint">{t('club.logoHint')}</p>
        </div>
      </div>

      <form onSubmit={save}>
        <label>{t('club.name')}
          <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <h2>{t('club.colours')}</h2>
        <p className="hint">{t('club.coloursHint')}</p>
        <div className="colours">
          <label>{t('club.dark')}
            <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} />
          </label>
          <label>{t('club.light')}
            <input type="color" value={light} onChange={(e) => setLight(e.target.value)} />
          </label>
        </div>
        <div className="swatch" style={{ background: dark, color: light }} aria-label={t('club.preview')}>
          <span>{t('club.preview')}</span>
          <strong>20:45</strong>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="hint" role="status">{message}</p>}
        <button type="submit" disabled={busy}>{t('common.save')}</button>
      </form>
    </div>
  )
}
