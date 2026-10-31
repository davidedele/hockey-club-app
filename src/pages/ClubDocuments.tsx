import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import ConfirmAction from '../components/ConfirmAction'
import PageHeader from '../components/PageHeader'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { useClub } from '../lib/club'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDateYear, dayKey } from '../lib/time'

const MAX_BYTES = 5 * 1024 * 1024
const LINK_SECONDS = 600

interface ClubDocument {
  id: string
  title: string
  file_path: string
  created_at: string
}

// The club's papers (V3): the privacy notice and the PDF files the board adds. Members read; the board adds,
// renames and removes. Links expire after ten minutes, like the other documents.
export default function ClubDocuments() {
  const { isBoard } = useSession()
  const club = useClub()
  const [docs, setDocs] = useState<ClubDocument[] | null>(null)
  const [links, setLinks] = useState<Map<string, string>>(new Map())
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('club_documents').select('id, title, file_path, created_at').order('created_at', { ascending: false })
    const list = (data ?? []) as ClubDocument[]
    setDocs(list)
    const paths = [...list.map((d) => d.file_path), ...(club.privacyNoticePath ? [club.privacyNoticePath] : [])]
    if (paths.length) {
      const signed = await supabase.storage.from('documents').createSignedUrls(paths, LINK_SECONDS)
      setLinks(new Map(((signed.data ?? []) as { path: string | null; signedUrl: string }[]).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl])))
    }
  }, [club.privacyNoticePath])

  useEffect(() => {
    void load()
  }, [load])

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    setMessage('')
    if (f && (f.type !== 'application/pdf' || f.size > MAX_BYTES)) {
      setFile(null)
      return setError(t('clubdocs.type'))
    }
    setError('')
    setFile(f)
    if (f && title.trim() === '') setTitle(f.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').slice(0, 80))
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!file || title.trim() === '') return
    setBusy(true)
    setError('')
    setMessage('')
    const { data: me } = await supabase.auth.getUser()
    const path = `club/doc-${Date.now()}.pdf`
    const up = await supabase.storage.from('documents').upload(path, file, { contentType: 'application/pdf' })
    if (up.error) setError(errorText(up.error))
    else {
      const row = await supabase.from('club_documents').insert({ title: title.trim(), file_path: path, created_by: me.user?.id }).select()
      if (row.error || !row.data || row.data.length === 0) {
        await supabase.storage.from('documents').remove([path])
        setError(row.error ? errorText(row.error) : errorText({ message: 'forbidden' }))
      } else {
        setTitle('')
        setFile(null)
        setMessage(t('clubdocs.added'))
        await load()
      }
    }
    setBusy(false)
  }

  async function remove(d: ClubDocument) {
    setBusy(true)
    setError('')
    setMessage('')
    const row = await supabase.from('club_documents').delete().eq('id', d.id).select()
    if (row.error || !row.data || row.data.length === 0) setError(row.error ? errorText(row.error) : errorText({ message: 'forbidden' }))
    else {
      await supabase.storage.from('documents').remove([d.file_path])
      setMessage(t('clubdocs.removed'))
      await load()
    }
    setBusy(false)
  }

  const noticeLink = club.privacyNoticePath ? links.get(club.privacyNoticePath) : undefined
  const empty = docs !== null && docs.length === 0 && !club.privacyNoticePath
  return (
    <div className="section">
      <PageHeader title={t('clubdocs.title')} description={t('clubdocs.description')} back={{ to: '/profile', label: t('profile.back') }} />
      {docs === null ? (
        <p className="hint">{t('common.loading')}</p>
      ) : empty ? (
        <p className="hint">{isBoard ? t('clubdocs.emptyBoard') : t('clubdocs.empty')}</p>
      ) : (
        <ul className="list club-docs">
          {club.privacyNoticePath && (
            <li className="row">
              <span>{t('club.notice')}</span>
              {noticeLink ? <a href={noticeLink} target="_blank" rel="noopener noreferrer">{t('clubdocs.open')}</a> : null}
            </li>
          )}
          {docs.map((d) => (
            <li key={d.id} className="row">
              <span>
                {d.title}
                <small className="hint"> {formatDateYear(dayKey(d.created_at))}</small>
              </span>
              <span className="row-actions">
                {links.get(d.file_path) && <a href={links.get(d.file_path)} target="_blank" rel="noopener noreferrer" aria-label={t('clubdocs.openNamed', { title: d.title })}>{t('clubdocs.open')}</a>}
                {isBoard && <ConfirmAction label={t('clubdocs.remove')} title={t('clubdocs.removeTitle')} body={t('clubdocs.removeBody', { title: d.title })} confirm={t('clubdocs.remove')} disabled={busy} onConfirm={() => void remove(d)} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}
      {isBoard && (
        <form className="form-col" {...checked(add)}>
          <h2>{t('clubdocs.addTitle')}</h2>
          <label>{t('clubdocs.name')}
            <input required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="actions">
            <label className="button file secondary">
              {file ? t('clubdocs.change') : t('clubdocs.choose')}
              <input type="file" accept="application/pdf" disabled={busy} onChange={pick} />
            </label>
            {file && <span className="hint">{file.name}</span>}
          </div>
          <p className="hint">{t('clubdocs.hint')}</p>
          <button type="submit" disabled={busy || !file || title.trim() === ''}>{t('clubdocs.add')}</button>
        </form>
      )}
    </div>
  )
}
