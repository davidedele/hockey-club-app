import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import ConfirmAction from '../components/ConfirmAction'
import { Navigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Crest from '../components/Crest'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { useClub } from '../lib/club'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_BYTES = 1024 * 1024
const MAX_NOTICE_BYTES = 5 * 1024 * 1024

// The board sets the club name, logo and colours here.
export default function ClubSettings() {
  const { isBoard, loading } = useSession()
  const club = useClub()
  const [name, setName] = useState(club.name)
  const [dark, setDark] = useState(club.gameDark)
  const [light, setLight] = useState(club.gameLight)
  const [jerseyLight, setJerseyLight] = useState(club.jerseyLight)
  const [jerseyDark, setJerseyDark] = useState(club.jerseyDark)
  const [noticeLink, setNoticeLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [savedGroup, setSavedGroup] = useState<'identity' | 'colours' | 'docs' | null>(null)

  useEffect(() => {
    setName(club.name)
    setDark(club.gameDark)
    setLight(club.gameLight)
    setJerseyLight(club.jerseyLight)
    setJerseyDark(club.jerseyDark)
  }, [club.name, club.gameDark, club.gameLight, club.jerseyLight, club.jerseyDark])

  // The notice is private to members, so it opens through a short lived link.
  useEffect(() => {
    if (!club.privacyNoticePath) return setNoticeLink(null)
    void supabase.storage.from('documents').createSignedUrls([club.privacyNoticePath], 600).then(({ data }) => {
      setNoticeLink(((data ?? []) as { signedUrl: string }[])[0]?.signedUrl ?? null)
    })
  }, [club.privacyNoticePath])

  if (!loading && !isBoard) return <Navigate to="/settings" replace />

  // An update that row level security silently refuses comes back with no rows.
  async function update(values: Record<string, string | null>) {
    const { data, error } = await supabase.from('club_settings').update(values).eq('id', true).select()
    if (error) return errorText(error)
    if (!data || data.length === 0) return errorText({ message: 'forbidden' })
    return ''
  }

  // Each group of fields is saved on its own, so changing the colours never touches the name.
  async function save(e: FormEvent, group: 'identity' | 'colours') {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    const values: Record<string, string> = group === 'identity'
      ? { name: name.trim() }
      : { game_dark: dark, game_light: light, jersey_light_name: jerseyLight.trim(), jersey_dark_name: jerseyDark.trim() }
    const problem = await update(values)
    if (problem) setError(problem)
    else {
      setError('')
      setMessage(t('common.saved'))
      setSavedGroup(group)
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
      setSavedGroup('identity')
      await club.reload()
    }
    setBusy(false)
  }

  async function uploadNotice(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMessage('')
    if (file.type !== 'application/pdf' || file.size > MAX_NOTICE_BYTES) return setError(t('club.noticeType'))
    setBusy(true)
    const path = `club/privacy-${Date.now()}.pdf`
    const up = await supabase.storage.from('documents').upload(path, file, { contentType: 'application/pdf' })
    const problem = up.error ? errorText(up.error) : await update({ privacy_notice_path: path })
    if (problem && !up.error) await supabase.storage.from('documents').remove([path])
    if (!problem && club.privacyNoticePath) await supabase.storage.from('documents').remove([club.privacyNoticePath])
    if (problem) setError(problem)
    else {
      setError('')
      setMessage(t('common.saved'))
      setSavedGroup('docs')
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

  const status = (group: 'identity' | 'colours' | 'docs') => (
    <>
      {error && savedGroup === group && <p className="error" role="alert">{error}</p>}
      {message && savedGroup === group && <p className="hint" role="status">{message}</p>}
    </>
  )

  return (
    <div className="section">
      <PageHeader title={t('club.title')} back={{ to: '/settings', label: t('settings.title') }} description={t('club.intro')} crumb={t('settings.club')} />
      {error && savedGroup === null && <p className="error" role="alert">{error}</p>}

      <section className="set-group" aria-labelledby="club-identity">
        <div className="set-label">
          <h2 id="club-identity">{t('club.groupIdentity')}</h2>
          <p className="hint">{t('club.groupIdentityHint')}</p>
        </div>
        <div className="set-body">
          <div className="logo-row">
            <span className="logo-big"><Crest /></span>
            <div>
              {!club.logoPath && <p className="hint">{t('club.logoNone')}</p>}
              <div className="actions">
                <label className="button file secondary">
                  {t('club.logoChoose')}
                  <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { setSavedGroup('identity'); void upload(e) }} />
                </label>
                {club.logoPath && <ConfirmAction label={t('club.logoRemove')} title={t('club.logoRemoveTitle')} body={t('club.logoRemoveBody')} confirm={t('club.logoRemove')} disabled={busy} onConfirm={() => { setSavedGroup('identity'); void removeLogo() }} />}
              </div>
              <p className="hint">{t('club.logoHint')}</p>
            </div>
          </div>
          <form {...checked((e) => void save(e, 'identity'))}>
            <label>{t('club.name')}
              <input required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            {status('identity')}
            <button type="submit" disabled={busy}>{t('common.save')}</button>
          </form>
        </div>
      </section>

      <section className="set-group" aria-labelledby="club-colours">
        <div className="set-label">
          <h2 id="club-colours">{t('club.groupColours')}</h2>
          <p className="hint">{t('club.coloursHint')}</p>
        </div>
        <form className="set-body" {...checked((e) => void save(e, 'colours'))}>
          <h3>{t('club.colours')}</h3>
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
          <h3>{t('club.jerseys')}</h3>
          <p className="hint">{t('club.jerseysHint')}</p>
          <div className="colours">
            <label>{t('club.jerseyLight')}
              <input required maxLength={20} value={jerseyLight} onChange={(e) => setJerseyLight(e.target.value)} />
            </label>
            <label>{t('club.jerseyDark')}
              <input required maxLength={20} value={jerseyDark} onChange={(e) => setJerseyDark(e.target.value)} />
            </label>
          </div>
          {status('colours')}
          <button type="submit" disabled={busy}>{t('common.save')}</button>
        </form>
      </section>

      <section className="set-group" aria-labelledby="club-docs">
        <div className="set-label">
          <h2 id="club-docs">{t('club.groupDocs')}</h2>
          <p className="hint">{t('club.noticeHint')}</p>
        </div>
        <div className="set-body">
          <h3>{t('club.notice')}</h3>
          {club.privacyNoticePath ? (
            noticeLink && <p><a href={noticeLink} target="_blank" rel="noopener noreferrer">{t('club.noticeOpen')}</a></p>
          ) : (
            <p className="hint">{t('club.noticeNone')}</p>
          )}
          {status('docs')}
          <label className="button file secondary">
            {t(club.privacyNoticePath ? 'club.noticeReplace' : 'club.noticeUpload')}
            <input type="file" accept="application/pdf" disabled={busy} onChange={(e) => void uploadNotice(e)} />
          </label>
        </div>
      </section>
    </div>
  )
}
