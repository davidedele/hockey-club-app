import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import LoadError from '../components/LoadError'
import PageHeader from '../components/PageHeader'
import { PageSkeleton } from '../components/Skeleton'
import { errorText, t } from '../i18n'
import { today } from '../lib/documents'
import { personName } from '../lib/names'
import type { Requirement, RequirementAnswer, RequirementVersion } from '../lib/requirements'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDateYear } from '../lib/time'
import type { Profile } from '../lib/types'

const LINK_SECONDS = 600

// What the person sent and a staff member can confirm or send back. A staff member may confirm their own answer in a
// staff view; it is recorded as made by the person concerned, and a second list lets someone else check it again (decision 129).
interface Entry {
  req: Requirement
  version: RequirementVersion
  answer: RequirementAnswer & { reviewed_by?: string | null }
}

export default function RequirementReview() {
  const { profile, isStaff, isBoard } = useSession()
  const [people, setPeople] = useState<Map<string, Profile>>(new Map())
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [versions, setVersions] = useState<RequirementVersion[]>([])
  const [answers, setAnswers] = useState<Entry['answer'][]>([])
  const [links, setLinks] = useState<Map<string, string>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [p, r, v, a] = await Promise.all([
      supabase.from('profiles').select('*').is('deleted_at', null),
      supabase.from('requirements').select('*'),
      supabase.from('requirement_versions').select('*'),
      supabase.from('requirement_answers').select('*'),
    ])
    const failure = [p, r, v, a].find((x) => x.error)?.error
    if (failure) {
      setError(errorText(failure))
      return
    }
    setError('')
    const reqs = (r.data ?? []) as Requirement[]
    const vers = (v.data ?? []) as RequirementVersion[]
    const list = (a.data ?? []) as Entry['answer'][]
    setPeople(new Map(((p.data ?? []) as Profile[]).map((x) => [x.id, x])))
    setRequirements(reqs)
    setVersions(vers)
    setAnswers(list)
    // Links for the files of the answers that can appear on this page.
    const paths: string[] = []
    for (const ans of list) {
      const ver = vers.find((x) => x.requirement_id === ans.requirement_id && x.version === ans.version)
      for (const b of ver?.blocks ?? []) {
        const value = ans.answers[b.id]
        if (b.type === 'file' && typeof value === 'string' && (ans.status === 'pending' || ans.status === 'approved')) paths.push(value)
      }
    }
    if (paths.length) {
      const { data } = await supabase.storage.from('documents').createSignedUrls(paths, LINK_SECONDS)
      setLinks(new Map(((data ?? []) as { path: string | null; signedUrl: string }[]).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl])))
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (isStaff) void load()
  }, [isStaff, load])

  const nameOf = useCallback((id: string) => { const p = people.get(id); return p ? personName(p) : '' }, [people])

  const { queue, selfDone } = useMemo(() => {
    const entries: Entry[] = []
    for (const answer of answers) {
      const req = requirements.find((x) => x.id === answer.requirement_id)
      if (!req || (!isBoard && req.visibility === 'board') || answer.version !== req.current_version || !people.has(answer.user_id)) continue
      const version = versions.find((x) => x.requirement_id === req.id && x.version === req.current_version)
      if (version) entries.push({ req, version, answer })
    }
    const order = (a: Entry, b: Entry) => a.req.title.localeCompare(b.req.title, 'it') || nameOf(a.answer.user_id).localeCompare(nameOf(b.answer.user_id), 'it')
    return {
      queue: entries.filter((e) => e.answer.status === 'pending').sort(order),
      selfDone: entries.filter((e) => e.answer.status === 'approved' && e.answer.reviewed_by === e.answer.user_id).sort(order),
    }
  }, [answers, requirements, versions, people, isBoard, nameOf])

  if (!profile) return null
  if (!isStaff) return <Navigate to="/" replace />
  if (error && !loaded) return <LoadError title={t('review.title')} message={error} onRetry={() => void load()} back={{ to: '/members', label: t('members.title') }} />
  if (!loaded) return <PageSkeleton />

  async function decide(entry: Entry, approve: boolean, note: string, dates: Record<string, string>) {
    const { error: failure } = await supabase.rpc('review_requirement_answer', {
      p_requirement: entry.req.id,
      p_user: entry.answer.user_id,
      p_approve: approve,
      p_note: note,
      p_dates: approve && Object.keys(dates).length ? dates : null,
    })
    if (failure) return errorText(failure)
    await load()
    window.dispatchEvent(new Event('documents-changed'))
    return ''
  }

  const row = (entry: Entry, recheck: boolean) => (
    <ReviewRow key={`${entry.req.id}-${entry.answer.user_id}`} entry={entry} name={nameOf(entry.answer.user_id)} links={links} own={entry.answer.user_id === profile.id} recheck={recheck} onDecide={decide} />
  )

  return (
    <div className="page cert-review">
      <PageHeader title={t('review.title')} back={{ to: '/members', label: t('members.title') }} description={t('review.intro')} />
      <section className="card" aria-labelledby="review-queue">
        <h2 id="review-queue">{t(queue.length === 1 ? 'review.countOne' : 'review.countMany', { n: String(queue.length) })}</h2>
        {queue.length === 0 ? <p className="hint">{t('review.empty')}</p> : <ul className="review-list">{queue.map((e) => row(e, false))}</ul>}
      </section>
      {selfDone.length > 0 && (
        <section className="card" aria-labelledby="review-self">
          <h2 id="review-self">{t('review.selfTitle')}</h2>
          <p className="hint">{t('review.selfHint')}</p>
          <ul className="review-list">{selfDone.map((e) => row(e, true))}</ul>
        </section>
      )}
    </div>
  )
}

function ReviewRow(props: {
  entry: Entry
  name: string
  links: Map<string, string>
  own: boolean
  recheck: boolean
  onDecide: (entry: Entry, approve: boolean, note: string, dates: Record<string, string>) => Promise<string>
}) {
  const { entry, name, links, own, recheck, onDecide } = props
  const { req, version, answer } = entry
  const dateBlocks = version.blocks.filter((b) => b.type === 'date')
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(dateBlocks.map((b) => [b.id, typeof answer.answers[b.id] === 'string' ? (answer.answers[b.id] as string) : ''])))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const idBase = `review-${req.id}-${answer.user_id}`

  async function run(approve: boolean) {
    if (!approve && !note.trim()) {
      setError(t('review.noteNeeded'))
      return
    }
    if (approve && dateBlocks.some((b) => b.required !== false && !dates[b.id])) {
      setError(t('review.dateNeeded'))
      return
    }
    setBusy(true)
    setError(await onDecide(entry, approve, note.trim(), Object.fromEntries(Object.entries(dates).filter(([, v]) => v))))
    setBusy(false)
  }

  return (
    <li className="review-row review-item">
      <div className="review-who">
        <Link to={`/members/${answer.user_id}/documents`} className="review-name">{name}</Link>
        <span className="hint">{req.title}</span>
        {own && !recheck && <span className="hint">{t('review.own')}</span>}
        {recheck && <span className="hint">{t('docs.confirmedBySelf')}</span>}
      </div>
      <ul className="review-blocks">
        {version.blocks.map((b) => {
          const value = answer.answers[b.id]
          if (b.type === 'checkbox') return <li key={b.id}>{t(value === true ? 'review.accepted' : 'review.notAccepted', { label: b.label })}</li>
          if (b.type === 'file' && typeof value === 'string') {
            const link = links.get(value)
            return <li key={b.id}>{b.label}{link ? <> <a href={link} target="_blank" rel="noopener noreferrer">{t('review.openFile')}</a></> : null}</li>
          }
          if (b.type === 'date') {
            const origin = answer.sources[b.id] === 'read' ? t('review.dateRead') : t('review.dateTyped')
            return (
              <li key={b.id}>
                {!(recheck && own) ? (
                  <label htmlFor={`${idBase}-${b.id}`}>
                    {b.label}
                    <input id={`${idBase}-${b.id}`} type="date" max={today()} value={dates[b.id] ?? ''} onChange={(e) => setDates({ ...dates, [b.id]: e.target.value })} />
                  </label>
                ) : <>{b.label}: {dates[b.id] ? formatDateYear(dates[b.id]) : ''}</>}
                <span className="hint"> {origin}</span>
              </li>
            )
          }
          return null
        })}
      </ul>
      {!(recheck && own) && (
        <div className="review-form">
          {!recheck && (
            <label htmlFor={`${idBase}-note`}>
              {t('review.note')}
              <input id={`${idBase}-note`} type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            </label>
          )}
          <button type="button" className="secondary" disabled={busy} onClick={() => void run(true)}>{recheck ? t('review.recheck') : t('review.approve')}</button>
          {!recheck && <button type="button" className="secondary" disabled={busy} onClick={() => void run(false)}>{t('review.reject')}</button>}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  )
}
