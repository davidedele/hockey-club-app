import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import ConfirmAction from './ConfirmAction'
import { errorText, t } from '../i18n'
import { today, shrinkDocument } from '../lib/documents'
import { checked } from '../lib/formcheck'
import { findIssueDate } from '../lib/issued'
import { readText } from '../lib/ocr'
import { canSubmit, requirementStatus, statusText, type Requirement, type RequirementAnswer, type RequirementBlock, type RequirementVersion } from '../lib/requirements'
import { supabase } from '../lib/supabase'
import { dayKey, formatDateYear } from '../lib/time'

const MAX_BYTES = 5 * 1024 * 1024
const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }

const monthsText = (n: number) => (n === 12 ? t('reqdocs.year') : t(n === 1 ? 'reqdocs.monthsOne' : 'reqdocs.monthsMany', { n: String(n) }))

// Opens a stored file in a new tab through a short lived link.
async function openStored(path: string): Promise<string> {
  const preview = window.open('about:blank', '_blank')
  if (preview) preview.opener = null
  const link = await supabase.storage.from('documents').createSignedUrl(path, 600)
  if (link.error || !link.data?.signedUrl) {
    preview?.close()
    return errorText(link.error ?? { message: 'forbidden' })
  }
  if (preview) preview.location.replace(link.data.signedUrl)
  else window.location.assign(link.data.signedUrl)
  return ''
}

// One required document, as the signed in person sees it: what is asked, how they stand, and the form to answer.
export default function RequirementCard(props: {
  requirement: Requirement
  version: RequirementVersion
  // The version the person answered, which may be an older one than the current.
  answeredVersion?: RequirementVersion
  answer?: RequirementAnswer
  userId: string
  // A staff member looking at another person: they can send only what the requirement lets staff send, and cannot withdraw.
  onBehalf?: boolean
  onChanged: () => Promise<void>
}) {
  const { requirement: req, version, answer, userId, onBehalf } = props
  const now = today()
  const status = requirementStatus(req, answer, now)
  const [draft, setDraft] = useState<Record<string, boolean | string>>({})
  const [sources, setSources] = useState<Record<string, 'read' | 'typed'>>({})
  const [files, setFiles] = useState<Record<string, File>>({})
  const [readingFile, setReadingFile] = useState(false)
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  // The date found in a photo, kept to tell a date that was read from one that was typed.
  const proposed = useRef<Record<string, string>>({})

  const blocks = version.blocks
  const hasFile = blocks.some((b) => b.type === 'file')
  const formOpen = canSubmit(req, answer) && (!onBehalf || req.staff_can_submit) && status.state !== 'pending' && status.state !== 'done'
  const answeredBlocks = props.answeredVersion?.blocks ?? blocks

  async function finish(problem: string, done = '') {
    setError(problem)
    setMessage(problem ? '' : done)
    if (!problem) {
      setDraft({})
      setSources({})
      setFiles({})
      setOpened(false)
    }
    await props.onChanged()
    window.dispatchEvent(new Event('documents-changed'))
    setBusy(false)
  }

  async function readFrom(file: Blob, block: RequirementBlock) {
    const dateBlock = blocks.find((b) => b.type === 'date' && b.read_from_file)
    if (!dateBlock || block.type !== 'file') return
    setReadingFile(true)
    try {
      const found = findIssueDate(await readText(file), now)
      if (found) {
        proposed.current[dateBlock.id] = found
        setDraft((d) => ({ ...d, [dateBlock.id]: found }))
        setSources((s) => ({ ...s, [dateBlock.id]: 'read' }))
        setMessage(t('req.dateRead'))
      } else {
        setMessage(t('req.dateNotRead'))
      }
    } catch {
      // The reading engine could not be fetched or made nothing of the photo. The person types the date.
      setMessage(t('req.dateNotRead'))
    }
    setReadingFile(false)
  }

  async function pick(e: ChangeEvent<HTMLInputElement>, block: RequirementBlock) {
    const file = e.target.files?.[0]
    if (!file) return
    const pdf = file.type === 'application/pdf'
    if (!EXTENSIONS[file.type] && !file.type.startsWith('image/')) {
      e.target.value = ''
      return setError(t('docs.fileType'))
    }
    if (pdf && file.size > MAX_BYTES) {
      e.target.value = ''
      return setError(t('docs.fileTooBig'))
    }
    setError('')
    let body: Blob = file
    let name = file.name
    if (!pdf) {
      try {
        body = await shrinkDocument(file)
        name = name.replace(/\.[^.]+$/, '') + '.jpg'
      } catch {
        e.target.value = ''
        return setError(t('docs.fileType'))
      }
    }
    setFiles((f) => ({ ...f, [block.id]: new File([body], name, { type: pdf ? 'application/pdf' : 'image/jpeg' }) }))
    if (!pdf) void readFrom(body, block)
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    if (version.reading_path && !opened) return setError(t('req.readFirst'))
    setBusy(true)
    setError('')
    const uploaded: string[] = []
    const values: Record<string, boolean | string> = {}
    for (const b of blocks) {
      if (b.type === 'checkbox') values[b.id] = draft[b.id] === true
      if (b.type === 'date' && typeof draft[b.id] === 'string' && draft[b.id]) values[b.id] = draft[b.id]
    }
    for (const b of blocks.filter((x) => x.type === 'file')) {
      const file = files[b.id]
      if (!file) continue
      const path = `${userId}/req-${req.id}-${crypto.randomUUID()}.${file.type === 'application/pdf' ? 'pdf' : 'jpg'}`
      const up = await supabase.storage.from('documents').upload(path, file, { contentType: file.type })
      if (up.error) {
        if (uploaded.length) await supabase.storage.from('documents').remove(uploaded)
        return finish(errorText(up.error))
      }
      uploaded.push(path)
      values[b.id] = path
    }
    // A date counts as read only while it is still the one the reader found.
    const sent: Record<string, string> = {}
    for (const b of blocks) {
      if (b.type === 'date' && values[b.id]) sent[b.id] = sources[b.id] === 'read' && values[b.id] === proposed.current[b.id] ? 'read' : 'typed'
    }
    const result = await supabase.rpc('submit_requirement', { p_requirement: req.id, p_user: userId, p_answers: values, p_sources: sent })
    if (result.error) {
      if (uploaded.length) await supabase.storage.from('documents').remove(uploaded)
      return finish(errorText(result.error))
    }
    // The files of an earlier answer are no longer in use.
    const old = Object.values(answer?.answers ?? {}).filter((v): v is string => typeof v === 'string' && /\/req-/.test(v))
    if (old.length) await supabase.storage.from('documents').remove(old)
    await finish('', t('req.sent'))
  }

  async function withdraw() {
    setBusy(true)
    const old = Object.values(answer?.answers ?? {}).filter((v): v is string => typeof v === 'string' && /\/req-/.test(v))
    const result = await supabase.rpc('withdraw_requirement_answer', { p_requirement: req.id })
    if (!result.error && old.length) await supabase.storage.from('documents').remove(old)
    await finish(result.error ? errorText(result.error) : '')
  }

  async function open(path: string) {
    setError(await openStored(path))
  }

  const titleId = `req-${req.id}`
  const dateBlock = (b: RequirementBlock) => {
    const isExpiry = req.expiry_block === b.id && req.expiry_months
    return (
      <label key={b.id}>
        {b.required ? b.label : `${b.label} (${t('req.optional')})`}
        <input
          type="date"
          required={Boolean(b.required)}
          max={isExpiry ? now : undefined}
          value={typeof draft[b.id] === 'string' ? (draft[b.id] as string) : ''}
          onChange={(e) => {
            setDraft((d) => ({ ...d, [b.id]: e.target.value }))
            setSources((s) => ({ ...s, [b.id]: 'typed' }))
          }}
        />
        {isExpiry && <span className="hint">{t('req.expiryHint', { months: monthsText(req.expiry_months!) })}</span>}
      </label>
    )
  }

  return (
    <section className={`doc-card req-card ${status.level}`} aria-labelledby={titleId} data-requirement={req.slug ?? req.id}>
      <h3 id={titleId}>{req.title}</h3>
      <p className={`doc-status ${status.level}`}><span className="dot" aria-hidden="true" />{statusText(req, answer, status)}</p>
      {req.deadline && status.state !== 'done' && <p className={status.overdue ? 'error' : 'hint'}>{t('req.due', { date: formatDateYear(req.deadline) })}</p>}
      <p>{req.reason}</p>
      {answer?.review_note && status.state === 'rejected' && <p>{answer.review_note}</p>}
      {answer && <p className="hint">{t('req.recorded', { date: formatDateYear(dayKey(answer.submitted_at)) })}</p>}
      {answer && answeredBlocks.filter((b) => b.type === 'date' && typeof answer.answers[b.id] === 'string').map((b) => (
        <p key={b.id}>{b.label}: {formatDateYear(answer.answers[b.id] as string)}</p>
      ))}
      {answer && answeredBlocks.filter((b) => b.type === 'file' && typeof answer.answers[b.id] === 'string').map((b) => (
        <p key={b.id}><button type="button" className="secondary" disabled={busy} onClick={() => void open(answer.answers[b.id] as string)}>{t(answeredBlocks.filter((x) => x.type === 'file').length > 1 ? 'req.openSentNamed' : 'req.openSent', { label: b.label })}</button></p>
      ))}

      {formOpen && (
        <form {...checked(send)} className="doc-panel">
          <p className="doc-panel-title">{t(onBehalf ? 'req.todoFor' : 'req.todo')}</p>
          {version.description && <p className="request-instructions">{version.description}</p>}
          {version.reading_path && (
            <p>
              <button type="button" className="secondary" disabled={busy} onClick={() => { setOpened(true); void open(version.reading_path!) }}>{t('req.openReading')}</button>
              {!opened && <span className="hint"> {t('req.readingHint')}</span>}
            </p>
          )}
          {blocks.map((b) => {
            if (b.type === 'text') return <p key={b.id}>{b.label}</p>
            if (b.type === 'checkbox') {
              return (
                <label className="check" key={b.id}>
                  <input type="checkbox" required={Boolean(b.required)} checked={draft[b.id] === true} disabled={busy} onChange={(e) => setDraft((d) => ({ ...d, [b.id]: e.target.checked }))} />
                  {b.required ? b.label : `${b.label} (${t('req.optional')})`}
                </label>
              )
            }
            // A date that is read from the file waits for the file (decision 94): a date without a file counts for nothing.
            if (b.type === 'date') return b.read_from_file && !blocks.some((x) => x.type === 'file' && files[x.id]) ? null : dateBlock(b)
            return (
              <div key={b.id}>
                <label className="button file secondary">
                  {t('req.chooseFile', { label: b.required ? b.label : `${b.label} (${t('req.optional')})` })}
                  <input type="file" required={Boolean(b.required) && !files[b.id]} accept="image/*,application/pdf" disabled={busy} onChange={(e) => void pick(e, b)} />
                </label>
                <p className="hint">{files[b.id]?.name ?? t('req.uploadHint')}</p>
              </div>
            )
          })}
          {readingFile && <p className="hint" role="status">{t('req.reading')}</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>{t(hasFile ? 'req.send' : 'req.confirm')}</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="hint" role="status">{message}</p>}
      {answer && !onBehalf && (
        <div className="actions">
          <ConfirmAction label={t('req.withdraw')} title={t('req.withdrawTitle', { title: req.title })} body={t('req.withdrawBody')} confirm={t('req.withdraw')} disabled={busy} onConfirm={() => void withdraw()} />
        </div>
      )}
    </section>
  )
}
