import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import LoadError from '../components/LoadError'
import PageHeader from '../components/PageHeader'
import RequirementCard from '../components/RequirementCard'
import { PageSkeleton } from '../components/Skeleton'
import { errorText, t } from '../i18n'
import { today } from '../lib/documents'
import { personName } from '../lib/names'
import { isWaiting, needsAction, staffItemsFor, type Requirement, type RequirementAnswer, type RequirementVersion } from '../lib/requirements'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

// What the club asks of one member and where it stands, for staff. A staff member can send an answer for the person
// only where the requirement allows it; confirming what the person sent is done on the review page.
export default function MemberDocuments() {
  const { id = '' } = useParams()
  const { profile, isStaff, isBoard } = useSession()
  const [person, setPerson] = useState<{ first_name: string; last_name: string } | null>(null)
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [versions, setVersions] = useState<RequirementVersion[]>([])
  const [answers, setAnswers] = useState<RequirementAnswer[]>([])
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    const [p, r, v, a, g] = await Promise.all([
      supabase.from('profiles').select('first_name, last_name').eq('id', id).is('deleted_at', null).maybeSingle(),
      supabase.from('requirements').select('*').order('created_at'),
      supabase.from('requirement_versions').select('*'),
      supabase.from('requirement_answers').select('*').eq('user_id', id),
      supabase.from('group_members').select('group_id').eq('user_id', id),
    ])
    const failure = [p, r, v, a, g].find((x) => x.error)?.error
    if (failure) {
      setError(errorText(failure))
      return
    }
    setError('')
    setPerson((p.data as { first_name: string; last_name: string } | null) ?? null)
    setRequirements((r.data ?? []) as Requirement[])
    setVersions((v.data ?? []) as RequirementVersion[])
    setAnswers((a.data ?? []) as RequirementAnswer[])
    setGroupIds(((g.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    setReady(true)
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile) return null
  if (!isStaff) return <Navigate to="/profile/documents" replace />
  // The own page is the player page, where the person answers for themselves.
  if (id === profile.id) return <Navigate to="/profile/documents" replace />
  if (error && !ready) return <LoadError title={t('docs.title')} message={error} onRetry={() => void load()} back={{ to: '/members', label: t('members.title') }} />
  if (!ready) return <PageSkeleton />
  if (!person) return <Navigate to="/members" replace />

  const name = personName(person)
  const versionOf = (reqId: string, version: number) => versions.find((x) => x.requirement_id === reqId && x.version === version)
  const items = staffItemsFor(requirements, answers, groupIds, today(), isBoard).filter(({ req }) => versionOf(req.id, req.current_version))
  const todo = items.filter(needsAction)
  const waiting = items.filter(isWaiting)
  const done = items.filter((i) => !needsAction(i) && !isWaiting(i))
  const card = ({ req, answer }: (typeof items)[number]) => (
    <RequirementCard
      key={req.id}
      requirement={req}
      version={versionOf(req.id, req.current_version)!}
      answeredVersion={answer ? versionOf(req.id, answer.version) : undefined}
      answer={answer}
      userId={id}
      onBehalf
      onChanged={load}
    />
  )

  return (
    <div className="page doc-page">
      <PageHeader title={t('docs.titleOf', { name })} back={{ to: `/members/${id}`, label: name }} description={t('member.docsIntro')} crumb={name} />
      {error && <p className="error" role="alert">{error}</p>}
      {items.length === 0 && <p className="hint">{t('member.docsEmpty')}</p>}
      {answers.some((a) => a.status === 'pending') && <p><Link to="/members/review">{t('member.reviewLink')}</Link></p>}
      {todo.length > 0 && (
        <>
          <h2 className="doc-group-title">{t('req.group.todo', { n: String(todo.length) })}</h2>
          <div className="doc-cards">{todo.map(card)}</div>
        </>
      )}
      {waiting.length > 0 && (
        <>
          <h2 className="doc-group-title">{t('req.group.waiting', { n: String(waiting.length) })}</h2>
          <div className="doc-cards">{waiting.map(card)}</div>
        </>
      )}
      {done.length > 0 && (
        <>
          <h2 className="doc-group-title">{t('req.group.done', { n: String(done.length) })}</h2>
          <div className="doc-cards">{done.map(card)}</div>
        </>
      )}
    </div>
  )
}
