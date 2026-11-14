import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmAction'
import Fold, { useFolds } from '../components/Fold'
import LoadError from '../components/LoadError'
import PageHeader from '../components/PageHeader'
import { PageSkeleton } from '../components/Skeleton'
import { errorText, t, type MessageKey } from '../i18n'
import { useClub } from '../lib/club'
import { checked } from '../lib/formcheck'
import { blankDraft, fromRequirement, MAX_BLOCKS, moveBlock, newBlock, presetDraft, structureChanged, toSave, validateDraft, type Draft } from '../lib/requirementedit'
import type { Requirement, RequirementBlock, RequirementVersion } from '../lib/requirements'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDateYear } from '../lib/time'
import type { Group } from '../lib/types'

const MAX_PDF = 5 * 1024 * 1024
const BACK = { to: '/settings/documents', label: t('settings.documents') }
const TYPES: RequirementBlock['type'][] = ['text', 'checkbox', 'date', 'file']
const monthsText = (n: number) => (n === 12 ? t('reqdocs.year') : t(n === 1 ? 'reqdocs.monthsOne' : 'reqdocs.monthsMany', { n: String(n) }))

type Library = { title: string; file_path: string }

// Creating or changing one required document (decision 168): what the member has to do, who it is for, when it expires.
export default function RequirementEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const folds = useFolds()
  const club = useClub()
  const { isBoard } = useSession()
  const [original, setOriginal] = useState<{ req: Requirement; version: RequirementVersion } | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [groups, setGroups] = useState<Group[]>([])
  const [library, setLibrary] = useState<Library[]>([])
  const [answerCount, setAnswerCount] = useState(0)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [asking, setAsking] = useState(false)
  const [preset, setPreset] = useState(false)

  const load = useCallback(async () => {
    const [g, lib, r, v, a] = await Promise.all([
      supabase.from('groups').select('*').order('id'),
      supabase.from('club_documents').select('title, file_path').order('created_at', { ascending: false }),
      id ? supabase.from('requirements').select('*').eq('id', id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      id ? supabase.from('requirement_versions').select('*').eq('requirement_id', id) : Promise.resolve({ data: [], error: null }),
      id ? supabase.from('requirement_answers').select('user_id').eq('requirement_id', id) : Promise.resolve({ data: [], error: null }),
    ])
    const failure = [g, lib, r, v, a].find((x) => x.error)?.error
    if (failure) return setLoadError(errorText(failure))
    setGroups((g.data ?? []) as Group[])
    setLibrary((lib.data ?? []) as Library[])
    if (id) {
      const req = r.data as Requirement | null
      const version = ((v.data ?? []) as RequirementVersion[]).find((x) => req && x.version === req.current_version)
      if (!req || !version) return setMissing(true)
      setOriginal({ req, version })
      setDraft(fromRequirement(req, version))
      setAnswerCount((a.data ?? []).length)
    }
    setLoadError('')
    setReady(true)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (!isBoard) return <Navigate to="/settings/documents" replace />
  if (missing) return <Navigate to="/settings/documents" replace />
  if (loadError && !ready) return <LoadError title={t('reqedit.title')} message={loadError} onRetry={() => void load()} back={BACK} />
  if (!ready) return <PageSkeleton />

  const req = original?.req
  const isConsent = req?.slug === 'privacy_consent'
  const set = (values: Partial<Draft>) => setDraft((d) => ({ ...d, ...values }))
  const setBlock = (i: number, values: Partial<RequirementBlock>) => set({ blocks: draft.blocks.map((b, k) => (k === i ? { ...b, ...values } : b)) })
  const dateBlocks = draft.blocks.filter((b) => b.type === 'date')
  const hasFile = draft.blocks.some((b) => b.type === 'file')
  const changes = original ? structureChanged({ blocks: original.version.blocks, readingPath: original.version.reading_path }, draft) : false

  function addBlock(type: RequirementBlock['type']) {
    if (draft.blocks.length >= MAX_BLOCKS) return setError(t('reqedit.errTooMany'))
    set({ blocks: [...draft.blocks, newBlock(type, draft.blocks)] })
  }

  function removeBlock(i: number) {
    const gone = draft.blocks[i]
    set({ blocks: draft.blocks.filter((_, k) => k !== i), ...(gone.id === draft.expiryBlock ? { expiryBlock: '', expiryMonths: '' } : {}) })
  }

  async function uploadReading(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.type !== 'application/pdf' || file.size > MAX_PDF) return setError(t('reqedit.pdfOnly'))
    setBusy(true)
    setError('')
    // The privacy notice keeps its own name, as the rest of the app expects it.
    const path = `club/${isConsent ? 'privacy' : 'doc'}-${Date.now()}.pdf`
    const up = await supabase.storage.from('documents').upload(path, file, { contentType: 'application/pdf' })
    if (up.error) {
      setBusy(false)
      return setError(errorText(up.error))
    }
    if (!isConsent) {
      const row = await supabase.from('club_documents').insert({ title: draft.title.trim() || file.name.replace(/\.pdf$/i, ''), file_path: path }).select('title, file_path').single()
      if (row.error) {
        await supabase.storage.from('documents').remove([path])
        setBusy(false)
        return setError(errorText(row.error))
      }
      setLibrary((l) => [row.data as Library, ...l])
    }
    set({ readingPath: path })
    setBusy(false)
  }

  async function write() {
    setBusy(true)
    setError('')
    const { fields, content } = toSave(draft)
    const result = await supabase.rpc('save_requirement', { p_id: id ?? null, p_fields: fields, p_content: content, p_mode: !id ? 'new' : changes ? 'version' : 'correction' })
    if (result.error) {
      setBusy(false)
      return setError(errorText(result.error))
    }
    // The privacy notice is also kept where the rest of the app still reads it.
    if (isConsent && draft.readingPath && draft.readingPath !== club.privacyNoticePath && /^club\/privacy-/.test(draft.readingPath)) {
      await supabase.from('club_settings').update({ privacy_notice_path: draft.readingPath }).eq('id', true)
      await club.reload()
    }
    window.dispatchEvent(new Event('documents-changed'))
    navigate('/settings/documents')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const problem = validateDraft(draft)
    if (problem) return setError(t(problem))
    if (original && changes && answerCount > 0) return setAsking(true)
    await write()
  }

  async function setActive(active: boolean) {
    setBusy(true)
    setError('')
    const result = await supabase.rpc('save_requirement', { p_id: id, p_fields: { active }, p_content: null, p_mode: 'correction' })
    if (result.error) {
      setBusy(false)
      return setError(errorText(result.error))
    }
    navigate('/settings/documents')
  }

  const readingOptions = [...library]
  if (draft.readingPath && !readingOptions.some((l) => l.file_path === draft.readingPath)) readingOptions.push({ title: t('reqedit.readingCurrent'), file_path: draft.readingPath })
  const label = (b: RequirementBlock) => t(`reqedit.type.${b.type}` as MessageKey)
  const whoSummary = [draft.groupIds.length ? groups.filter((g) => draft.groupIds.includes(g.id)).map((g) => g.name).join(', ') : t('requests.allMembers'), draft.deadline ? t('req.due', { date: formatDateYear(draft.deadline) }) : ''].filter(Boolean).join(' · ')
  const validSummary = [draft.expiryBlock && draft.expiryMonths ? t('reqedit.expires', { months: monthsText(Number(draft.expiryMonths)) }) : t('reqedit.noExpiry'), t(`reqedit.reviewShort.${draft.review}` as MessageKey)].join(' · ')
  const optionsSummary = [t(`reqedit.visibility.${draft.visibility}` as MessageKey), draft.blocking ? t('reqedit.blockingShort') : t('reqedit.notBlockingShort')].join(' · ')

  return (
    <div className="section req-edit">
      <PageHeader title={req ? req.title : t('reqedit.newTitle')} back={BACK} crumb={req ? req.title : t('reqedit.newTitle')} />
      {!req && !preset && draft.blocks.length === 0 && (
        <section aria-labelledby="req-start">
          <h2 id="req-start">{t('reqedit.start')}</h2>
          <div className="chips wrap">
            {(['consent', 'read', 'upload'] as const).map((k) => (
              <button type="button" className="chip" key={k} onClick={() => { setDraft(presetDraft(k)); setPreset(true) }}>{t(`reqedit.preset.${k}` as MessageKey)}</button>
            ))}
            <button type="button" className="chip" onClick={() => { setDraft(blankDraft()); setPreset(true) }}>{t('reqedit.preset.blank')}</button>
          </div>
        </section>
      )}
      {(req || preset || draft.blocks.length > 0) && (
        <form className="form-col" {...checked(save)}>
          <fieldset disabled={busy}>
            <label>{t('reqedit.fTitle')}<input required maxLength={80} value={draft.title} onChange={(e) => set({ title: e.target.value })} /></label>
            <label>{t('reqedit.fReason')}<textarea required maxLength={500} value={draft.reason} onChange={(e) => set({ reason: e.target.value })} /><span className="hint">{t('reqedit.fReasonHint')}</span></label>
            <label>{t('reqedit.fDescription')}<textarea maxLength={2000} value={draft.description} onChange={(e) => set({ description: e.target.value })} /></label>

            <label>
              {t('reqedit.reading')}
              <select value={draft.readingPath ?? ''} onChange={(e) => set({ readingPath: e.target.value || null })}>
                <option value="">{t('reqedit.readingNone')}</option>
                {readingOptions.map((l) => <option key={l.file_path} value={l.file_path}>{l.title}</option>)}
              </select>
              <span className="hint">{t('reqedit.readingHint')}</span>
            </label>
            <label className="button file secondary">{t('reqedit.readingUpload')}<input type="file" accept="application/pdf" onChange={(e) => void uploadReading(e)} /></label>

            <h2>{t('reqedit.blocks')}</h2>
            <p className="hint">{t('reqedit.blocksHint')}</p>
            <ol className="req-blocks">
              {draft.blocks.map((b, i) => (
                <li className="req-block" key={b.id}>
                  <div className="req-block-head">
                    <strong>{i + 1}. {label(b)}</strong>
                    <span className="actions">
                      <button type="button" className="secondary" disabled={i === 0} aria-label={t('reqedit.upNamed', { n: String(i + 1) })} onClick={() => set({ blocks: moveBlock(draft.blocks, i, -1) })}>{t('reqedit.up')}</button>
                      <button type="button" className="secondary" disabled={i === draft.blocks.length - 1} aria-label={t('reqedit.downNamed', { n: String(i + 1) })} onClick={() => set({ blocks: moveBlock(draft.blocks, i, 1) })}>{t('reqedit.down')}</button>
                      <button type="button" className="secondary" aria-label={t('reqedit.removeNamed', { n: String(i + 1) })} onClick={() => removeBlock(i)}>{t('reqedit.remove')}</button>
                    </span>
                  </div>
                  <label>
                    {t('reqedit.blockLabel')}
                    {b.type === 'text'
                      ? <textarea required maxLength={2000} value={b.label} onChange={(e) => setBlock(i, { label: e.target.value })} />
                      : <input required maxLength={200} value={b.label} onChange={(e) => setBlock(i, { label: e.target.value })} />}
                  </label>
                  {b.type !== 'text' && (
                    <label className="check"><input type="checkbox" checked={Boolean(b.required)} onChange={(e) => setBlock(i, { required: e.target.checked })} />{t('reqedit.required')}</label>
                  )}
                  {b.type === 'date' && hasFile && (
                    <label className="check">
                      <input type="checkbox" checked={Boolean(b.read_from_file)} onChange={(e) => setBlock(i, { read_from_file: e.target.checked })} />
                      {t('reqedit.readFromFile')}
                    </label>
                  )}
                </li>
              ))}
            </ol>
            <div className="chips wrap" role="group" aria-label={t('reqedit.addBlock')}>
              {TYPES.map((k) => <button type="button" className="chip" key={k} onClick={() => addBlock(k)}>{t(`reqedit.add.${k}` as MessageKey)}</button>)}
            </div>
          </fieldset>

          <Fold id="who" title={t('reqedit.fold.who')} summary={whoSummary} open={folds.open === 'who'} onToggle={() => folds.toggle('who')}>
            <fieldset disabled={busy}>
              <legend>{t('reqedit.groups')}</legend>
              <div className="chips wrap">
                <button type="button" className={draft.groupIds.length ? 'chip' : 'chip on'} aria-pressed={!draft.groupIds.length} onClick={() => set({ groupIds: [] })}>{t('requests.allMembers')}</button>
                {groups.map((g) => (
                  <button type="button" className={draft.groupIds.includes(g.id) ? 'chip on' : 'chip'} aria-pressed={draft.groupIds.includes(g.id)} key={g.id} onClick={() => set({ groupIds: draft.groupIds.includes(g.id) ? draft.groupIds.filter((x) => x !== g.id) : [...draft.groupIds, g.id] })}>{g.name}</button>
                ))}
              </div>
              <label>{t('reqedit.deadline')}<input type="date" value={draft.deadline} onChange={(e) => set({ deadline: e.target.value })} /></label>
            </fieldset>
          </Fold>

          <Fold id="valid" title={t('reqedit.fold.valid')} summary={validSummary} open={folds.open === 'valid'} onToggle={() => folds.toggle('valid')}>
            <fieldset disabled={busy}>
              <label className="check">
                <input type="checkbox" checked={Boolean(draft.expiryBlock) || draft.expiryMonths !== ''} disabled={dateBlocks.length === 0} onChange={(e) => set(e.target.checked ? { expiryBlock: dateBlocks[0]?.id ?? '', expiryMonths: draft.expiryMonths || '12' } : { expiryBlock: '', expiryMonths: '' })} />
                {t('reqedit.expiryOn')}
              </label>
              {dateBlocks.length === 0 && <p className="hint">{t('reqedit.expiryNeedsDate')}</p>}
              {draft.expiryBlock !== '' && (
                <>
                  <label>
                    {t('reqedit.expiryBlock')}
                    <select value={draft.expiryBlock} onChange={(e) => set({ expiryBlock: e.target.value })}>
                      {dateBlocks.map((b) => <option key={b.id} value={b.id}>{b.label || t('reqedit.type.date')}</option>)}
                    </select>
                  </label>
                  <label>{t('reqedit.expiryMonths')}<input type="number" required min={1} max={120} step={1} value={draft.expiryMonths} onChange={(e) => set({ expiryMonths: e.target.value })} /></label>
                </>
              )}
              <label>
                {t('reqedit.review')}
                <select value={draft.review} onChange={(e) => set({ review: e.target.value as Draft['review'] })}>
                  <option value="none">{t('reqedit.review.none')}</option>
                  <option value="always">{t('reqedit.review.always')}</option>
                  <option value="unless_read" disabled={!draft.blocks.some((b) => b.type === 'date' && b.read_from_file)}>{t('reqedit.review.unless_read')}</option>
                </select>
              </label>
            </fieldset>
          </Fold>

          <Fold id="options" title={t('reqedit.fold.options')} summary={optionsSummary} open={folds.open === 'options'} onToggle={() => folds.toggle('options')}>
            <fieldset disabled={busy}>
              <label>
                {t('reqedit.visibility')}
                <select value={draft.visibility} onChange={(e) => set({ visibility: e.target.value as Draft['visibility'] })}>
                  <option value="staff">{t('reqedit.visibility.staff')}</option>
                  <option value="board">{t('reqedit.visibility.board')}</option>
                </select>
              </label>
              <label className="check"><input type="checkbox" checked={draft.blocking} onChange={(e) => set({ blocking: e.target.checked })} />{t('reqedit.blocking')}</label>
              {isConsent
                ? <p className="hint">{t('reqedit.consentNote')}</p>
                : <label className="check"><input type="checkbox" checked={draft.staffCanSubmit} onChange={(e) => set({ staffCanSubmit: e.target.checked })} />{t('reqedit.staffSubmit')}</label>}
            </fieldset>
          </Fold>

          {error && <p className="error" role="alert">{error}</p>}
          {req && <p className="hint">{t(changes ? 'reqedit.hintVersion' : 'reqedit.hintCorrection')}</p>}
          <div className="actions">
            <button type="submit" disabled={busy}>{t(req ? 'reqedit.save' : 'reqedit.publish')}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => navigate('/settings/documents')}>{t('common.cancel')}</button>
          </div>
          {req && (
            <div className="actions">
              {req.active
                ? <ArchiveButton title={req.title} busy={busy} onConfirm={() => void setActive(false)} />
                : <button type="button" className="secondary" disabled={busy} onClick={() => void setActive(true)}>{t('reqedit.restore')}</button>}
            </div>
          )}
        </form>
      )}
      <ConfirmDialog open={asking} title={t('reqedit.versionTitle')} body={answerCount === 1 ? t('reqedit.versionBodyOne') : t('reqedit.versionBody', { n: String(answerCount) })} busy={busy} choices={[{ label: t('reqedit.versionConfirm'), onChoose: () => void write() }]} onClose={() => setAsking(false)} choiceClassName="" />
    </div>
  )
}

function ArchiveButton({ title, busy, onConfirm }: { title: string; busy: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="link" disabled={busy} onClick={(e) => { e.currentTarget.focus(); setOpen(true) }}>{t('reqedit.archive')}</button>
      <ConfirmDialog open={open} title={t('reqedit.archiveTitle', { title })} body={t('reqedit.archiveBody')} choices={[{ label: t('reqedit.archive'), onChoose: onConfirm }]} onClose={() => setOpen(false)} />
    </>
  )
}
