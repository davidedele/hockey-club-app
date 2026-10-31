import ConfirmAction from '../components/ConfirmAction'
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import PageHeader from '../components/PageHeader'
import { Navigate } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { checked } from '../lib/formcheck'
import { shrinkDocument } from '../lib/documents'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Drill } from '../lib/types'

const MAX_BYTES = 5 * 1024 * 1024
const LINK_SECONDS = 600

// The club's drill library. Coaches and the board write it, and reuse a drill in any training.
export default function Drills() {
  const { isStaff } = useSession()
  const [items, setItems] = useState<Drill[]>([])
  const [used, setUsed] = useState<Map<string, number>>(new Map())
  const [links, setLinks] = useState<Map<string, string>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [video, setVideo] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [editing, setEditing] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editVideo, setEditVideo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [d, u] = await Promise.all([
      supabase.from('drills').select('*').order('title'),
      supabase.from('event_plan_drills').select('drill_id'),
    ])
    const list = (d.data ?? []) as Drill[]
    setItems(list)
    const counts = new Map<string, number>()
    for (const row of (u.data ?? []) as { drill_id: string }[]) {
      counts.set(row.drill_id, (counts.get(row.drill_id) ?? 0) + 1)
    }
    setUsed(counts)
    const paths = list.map((x) => x.file_path).filter((x): x is string => Boolean(x))
    if (paths.length) {
      const { data } = await supabase.storage.from('drills').createSignedUrls(paths, LINK_SECONDS)
      setLinks(new Map(((data ?? []) as { path: string | null; signedUrl: string }[])
        .filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl])))
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!isStaff) return <Navigate to="/events" replace />

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null
    if (chosen && chosen.type !== 'application/pdf' && !chosen.type.startsWith('image/')) {
      e.target.value = ''
      setFile(null)
      setError(t('drills.fileType'))
      return
    }
    if (chosen && chosen.type === 'application/pdf' && chosen.size > MAX_BYTES) {
      e.target.value = ''
      setFile(null)
      setError(t('drills.fileTooBig'))
      return
    }
    setError('')
    setFile(chosen)
  }

  // The drill gets its name before the file is sent, because the file is stored in a folder
  // named after it. If writing the drill fails, the file is taken back out.
  async function add(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const id = crypto.randomUUID()
    let path: string | null = null
    if (file) {
      const pdf = file.type === 'application/pdf'
      let body: Blob = file
      if (!pdf) {
        try {
          body = await shrinkDocument(file)
        } catch {
          setBusy(false)
          setError(t('drills.fileType'))
          return
        }
      }
      path = `${id}/drill-${Date.now()}.${pdf ? 'pdf' : 'jpg'}`
      const up = await supabase.storage.from('drills').upload(path, body, { contentType: pdf ? 'application/pdf' : 'image/jpeg' })
      if (up.error) {
        setBusy(false)
        setError(errorText(up.error))
        return
      }
    }
    const { error } = await supabase.from('drills').insert({
      id,
      title,
      notes: notes.trim() || null,
      video_url: video.trim() || null,
      file_path: path,
    })
    if (error) {
      if (path) await supabase.storage.from('drills').remove([path])
      setBusy(false)
      setError(errorText(error))
      return
    }
    setTitle('')
    setNotes('')
    setVideo('')
    setFile(null)
    await load()
    setBusy(false)
  }

  function startEdit(d: Drill) {
    setEditing(d.id)
    setEditTitle(d.title)
    setEditNotes(d.notes ?? '')
    setEditVideo(d.video_url ?? '')
    setError('')
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { data, error } = await supabase.from('drills')
      .update({ title: editTitle, notes: editNotes.trim() || null, video_url: editVideo.trim() || null })
      .eq('id', editing).select()
    if (error || !data || data.length === 0) setError(errorText(error ?? { message: 'forbidden' }))
    else setEditing('')
    await load()
    setBusy(false)
  }

  async function remove(d: Drill) {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.from('drills').delete().eq('id', d.id).select()
    if (error || !data || data.length === 0) setError(errorText(error ?? { message: 'forbidden' }))
    else if (d.file_path) await supabase.storage.from('drills').remove([d.file_path])
    await load()
    setBusy(false)
  }

  return (
    <div className="page narrow two-col">
      <PageHeader title={t('drills.title')} description={t('drills.intro')} />
      {error && <p className="error" role="alert">{error}</p>}

      <form {...checked(add)} aria-label={t('drills.new')}>
        <h2>{t('drills.new')}</h2>
        <label>
          {t('drills.name')}
          <input value={title} maxLength={80} required onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          {t('drills.notes')}
          <textarea value={notes} maxLength={1000} rows={3} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label>
          {t('drills.video')}
          <input type="url" value={video} maxLength={300} placeholder="https://" onChange={(e) => setVideo(e.target.value)} />
          <span className="hint">{t('drills.videoHint')}</span>
        </label>
        <div className="field">
          <span className="label">{t('drills.file')}</span>
          <div className="actions">
            <label className="button file">
              {file ? t('drills.fileChosen') : t('drills.fileChoose')}
              <input type="file" accept="image/*,application/pdf" disabled={busy} onChange={pickFile} />
            </label>
            {file && <span className="hint">{file.name}</span>}
          </div>
        </div>
        <button type="submit" disabled={busy}>{busy ? t('drills.saving') : t('drills.add')}</button>
      </form>

      {loaded && items.length === 0 && <p className="hint">{t('drills.empty')}</p>}
      <ul className="ann-list">
        {items.map((d) => {
          const link = d.file_path ? links.get(d.file_path) : undefined
          const count = used.get(d.id) ?? 0
          if (editing === d.id) {
            return (
              <li key={d.id} className="ann">
                <form {...checked(saveEdit)} aria-label={t('drills.edit')}>
                  <label>
                    {t('drills.name')}
                    <input value={editTitle} maxLength={80} required onChange={(e) => setEditTitle(e.target.value)} />
                  </label>
                  <label>
                    {t('drills.notes')}
                    <textarea value={editNotes} maxLength={1000} rows={3} onChange={(e) => setEditNotes(e.target.value)} />
                  </label>
                  <label>
                    {t('drills.video')}
                    <input type="url" value={editVideo} maxLength={300} placeholder="https://" onChange={(e) => setEditVideo(e.target.value)} />
                  </label>
                  <div className="actions">
                    <button type="submit" disabled={busy}>{t('common.save')}</button>
                    <button type="button" className="link" disabled={busy} onClick={() => setEditing('')}>{t('common.cancel')}</button>
                  </div>
                </form>
              </li>
            )
          }
          return (
            <li key={d.id} className="ann">
              <h2>{d.title}</h2>
              {d.notes && <p className="ann-body">{d.notes}</p>}
              <div className="actions">
                {link && <a href={link} target="_blank" rel="noopener noreferrer">{t('drills.open')}</a>}
                {d.video_url && <a className="inline-action" href={d.video_url} target="_blank" rel="noopener noreferrer">{t('drills.watch')}</a>}
              </div>
              <p className="hint">{count === 0 ? t('drills.usedNever') : t(count === 1 ? 'drills.usedOne' : 'drills.used', { n: String(count) })}</p>
              <div className="actions">
                <button type="button" className="link" disabled={busy} onClick={() => startEdit(d)}>{t('drills.edit')}</button>
                <ConfirmAction
                  label={t('drills.delete')}
                  title={t('drills.deleteTitle')}
                  body={`${t('drills.deleteBody', { title: d.title })}${count > 0 ? ` ${t(count === 1 ? 'drills.deleteWarningOne' : 'drills.deleteWarning', { n: String(count) })}` : ''}`}
                  confirm={t('drills.delete')}
                  disabled={busy}
                  onConfirm={() => void remove(d)}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
