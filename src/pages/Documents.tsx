import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useClub } from '../lib/club'
import { certificateState, consentState, shrinkDocument, type Level } from '../lib/documents'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { MemberDocument } from '../lib/types'

const MAX_BYTES = 5 * 1024 * 1024
const LINK_SECONDS = 600

function Status({ level, text }: { level: Level; text: string }) {
  return <p className={`doc-status ${level}`}><span className="dot" aria-hidden="true" />{text}</p>
}

// A member's paperwork: the medical certificate and the privacy consent.
// Without an id it is the signed in person's own page; staff open anyone's from the member page.
export default function Documents() {
  const { id } = useParams()
  const { profile, isStaff } = useSession()
  const club = useClub()
  const userId = id ?? profile?.id ?? ''
  const own = Boolean(profile) && userId === profile?.id
  const [person, setPerson] = useState<{ first_name: string; last_name: string } | null>(null)
  const [docs, setDocs] = useState<MemberDocument[]>([])
  const [links, setLinks] = useState<Map<string, string>>(new Map())
  const [date, setDate] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    const [p, d] = await Promise.all([
      supabase.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle(),
      supabase.from('member_documents').select('*').eq('user_id', userId),
    ])
    const list = (d.data ?? []) as MemberDocument[]
    setPerson((p.data as { first_name: string; last_name: string } | null) ?? null)
    setDocs(list)
    const cert = list.find((x) => x.kind === 'medical_certificate')
    setDate(cert?.valid_until ?? '')
    const paths = [cert?.file_path, club.privacyNoticePath].filter((x): x is string => Boolean(x))
    if (paths.length) {
      const { data } = await supabase.storage.from('documents').createSignedUrls(paths, LINK_SECONDS)
      setLinks(new Map(((data ?? []) as { path: string | null; signedUrl: string }[]).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl])))
    }
    setLoaded(true)
  }, [userId, club.privacyNoticePath])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile) return null
  if (!own && !isStaff) return <Navigate to="/documents" replace />
  if (loaded && !person) return <Navigate to="/" replace />

  const cert = docs.find((x) => x.kind === 'medical_certificate')
  const consent = docs.find((x) => x.kind === 'privacy_consent')
  const certNow = certificateState(cert)
  const consentNow = consentState(consent, club.privacyNoticePath)
  const name = person ? `${person.first_name} ${person.last_name}` : ''

  // Every change reports its real outcome, then the page and the banner reload.
  async function finish(problem: string, done = '') {
    setError(problem)
    setMessage(problem ? '' : done)
    await load()
    window.dispatchEvent(new Event('documents-changed'))
    setBusy(false)
  }

  async function writeCertificate(values: { valid_until?: string | null; file_path?: string | null }) {
    const { error } = await supabase
      .from('member_documents')
      .upsert({ user_id: userId, kind: 'medical_certificate', valid_until: cert?.valid_until ?? null, file_path: cert?.file_path ?? null, ...values }, { onConflict: 'user_id,kind' })
      .select()
    return error ? errorText(error) : ''
  }

  async function saveDate(e: FormEvent) {
    e.preventDefault()
    if (!date) return
    setBusy(true)
    await finish(await writeCertificate({ valid_until: date }), t('common.saved'))
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const pdf = file.type === 'application/pdf'
    if (!pdf && !file.type.startsWith('image/')) return setError(t('docs.fileType'))
    if (pdf && file.size > MAX_BYTES) return setError(t('docs.fileTooBig'))
    setBusy(true)
    setError('')
    let body: Blob = file
    if (!pdf) {
      try {
        body = await shrinkDocument(file)
      } catch {
        return finish(t('docs.fileType'))
      }
    }
    const path = `${userId}/medical_certificate-${Date.now()}.${pdf ? 'pdf' : 'jpg'}`
    const up = await supabase.storage.from('documents').upload(path, body, { contentType: pdf ? 'application/pdf' : 'image/jpeg' })
    if (up.error) return finish(errorText(up.error))
    const problem = await writeCertificate({ file_path: path })
    if (problem) await supabase.storage.from('documents').remove([path])
    else if (cert?.file_path) await supabase.storage.from('documents').remove([cert.file_path])
    await finish(problem, t('common.saved'))
  }

  async function removeFile() {
    if (!cert?.file_path) return
    setBusy(true)
    const old = cert.file_path
    const problem = await writeCertificate({ file_path: null })
    if (!problem) await supabase.storage.from('documents').remove([old])
    await finish(problem)
  }

  async function accept() {
    setBusy(true)
    const { error } = await supabase
      .from('member_documents')
      .upsert({ user_id: userId, kind: 'privacy_consent', accepted_at: new Date().toISOString(), file_path: club.privacyNoticePath }, { onConflict: 'user_id,kind' })
      .select()
    await finish(error ? errorText(error) : '')
  }

  async function withdraw() {
    setBusy(true)
    const { error, data } = await supabase.from('member_documents').delete().eq('user_id', userId).eq('kind', 'privacy_consent').select()
    await finish(error || !data || data.length === 0 ? errorText(error ?? { message: 'forbidden' }) : '')
  }

  const certLink = cert?.file_path ? links.get(cert.file_path) : undefined
  const noticeLink = club.privacyNoticePath ? links.get(club.privacyNoticePath) : undefined

  return (
    <div className="page narrow">
      <p><Link to={own ? '/profile' : `/members/${userId}`}>{own ? t('profile.title') : name}</Link></p>
      <h1>{own ? t('docs.title') : t('docs.titleOf', { name })}</h1>
      <p className="hint">{own ? t('docs.intro') : t('docs.introStaff', { name: person?.first_name ?? '' })}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}

      <section className="doc-card" aria-labelledby="cert-title">
        <h2 id="cert-title">{t('docs.cert')}</h2>
        {loaded && <Status level={certNow.level} text={certNow.text} />}
        <form onSubmit={saveDate}>
          <label>
            {t('docs.certDate')}
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            <span className="hint">{t('docs.certDateHint')}</span>
          </label>
          <button type="submit" className="secondary" disabled={busy || !date || date === cert?.valid_until}>{t('docs.certSaveDate')}</button>
        </form>
        <div className="doc-file">
          {cert?.file_path ? (
            certLink && <a href={certLink} target="_blank" rel="noopener noreferrer">{t('docs.certOpen')}</a>
          ) : (
            <p className="hint">{t('docs.certNoFile')}</p>
          )}
          <div className="actions">
            <label className="button file">
              {t(cert?.file_path ? 'docs.certReplace' : 'docs.certUpload')}
              <input type="file" accept="image/*,application/pdf" disabled={busy} onChange={(e) => void upload(e)} />
            </label>
            {cert?.file_path && <button className="link" disabled={busy} onClick={() => void removeFile()}>{t('docs.certRemoveFile')}</button>}
          </div>
        </div>
      </section>

      <section className="doc-card" aria-labelledby="consent-title">
        <h2 id="consent-title">{t('docs.consent')}</h2>
        {loaded && <Status level={consentNow.level} text={consentNow.text} />}
        {noticeLink && <p><a href={noticeLink} target="_blank" rel="noopener noreferrer">{t('docs.noticeOpen')}</a></p>}
        {own && club.privacyNoticePath && (
          <div className="actions">
            {consentNow.level !== 'ok' && <button disabled={busy} onClick={() => void accept()}>{t('docs.consentAccept')}</button>}
            {consent && <button className="link" disabled={busy} onClick={() => void withdraw()}>{t('docs.consentWithdraw')}</button>}
          </div>
        )}
        {!own && <p className="hint">{t('docs.consentOnlyMember')}</p>}
      </section>
    </div>
  )
}
