import { useCallback, useEffect, useState } from 'react'
import ClubDocuments from './ClubDocuments'
import Fold, { useFolds } from '../components/Fold'
import LoadError from '../components/LoadError'
import PageHeader from '../components/PageHeader'
import RequirementCard from '../components/RequirementCard'
import { PageSkeleton } from '../components/Skeleton'
import { errorText, t } from '../i18n'
import { appliesTo, requirementStatus, type Requirement, type RequirementAnswer, type RequirementVersion } from '../lib/requirements'
import { useSession } from '../lib/session'
import { today } from '../lib/documents'
import { supabase } from '../lib/supabase'

// The signed in person's own required documents (Profilo, Documenti): one card for each thing the club asks.
export default function MyDocuments() {
  const folds = useFolds()
  const { profile, isStaff } = useSession()
  const userId = profile?.id ?? ''
  const [requirements, setRequirements] = useState<Requirement[]>([])
  const [versions, setVersions] = useState<RequirementVersion[]>([])
  const [answers, setAnswers] = useState<RequirementAnswer[]>([])
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!userId) return
    const [r, v, a, g] = await Promise.all([
      supabase.from('requirements').select('*').order('created_at'),
      supabase.from('requirement_versions').select('*'),
      supabase.from('requirement_answers').select('*').eq('user_id', userId),
      supabase.from('group_members').select('group_id').eq('user_id', userId),
    ])
    const failure = [r, v, a, g].find((x) => x.error)?.error
    if (failure) {
      setError(errorText(failure))
      return
    }
    setError('')
    setRequirements((r.data ?? []) as Requirement[])
    setVersions((v.data ?? []) as RequirementVersion[])
    setAnswers((a.data ?? []) as RequirementAnswer[])
    setGroupIds(((g.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    setReady(true)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  if (!profile) return null
  if (error && !ready) return <LoadError title={t('docs.title')} message={error} onRetry={() => void load()} back={{ to: '/profile', label: t('profile.back') }} />
  if (!ready) return <PageSkeleton />

  const versionOf = (id: string, version: number) => versions.find((x) => x.requirement_id === id && x.version === version)
  // Staff can read every requirement, so only the ones for this person's groups, or already answered, are shown.
  const shown = requirements
    .map((req) => ({ req, answer: answers.find((a) => a.requirement_id === req.id) }))
    .filter(({ req, answer }) => (req.active && appliesTo(req, groupIds)) || answer)
    .filter(({ req }) => versionOf(req.id, req.current_version))

  const items = shown.map(({ req, answer }) => ({ req, answer, status: requirementStatus(req, answer, today()) }))
  const todo = items.filter((i) => ['missing', 'outdated', 'rejected', 'expired'].includes(i.status.state))
  const waiting = items.filter((i) => ['pending', 'expiring'].includes(i.status.state))
  const done = items.filter((i) => i.status.state === 'done')
  const card = ({ req, answer }: (typeof items)[number]) => (
    <RequirementCard
      key={req.id}
      requirement={req}
      version={versionOf(req.id, req.current_version)!}
      answeredVersion={answer ? versionOf(req.id, answer.version) : undefined}
      answer={answer}
      userId={userId}
      onChanged={load}
    />
  )

  return (
    <div className="section doc-page">
      <PageHeader title={t('docs.title')} back={{ to: '/profile', label: t('profile.back') }} description={t('docs.intro')} crumb={t('docs.title')} />
      {error && <p className="error" role="alert">{error}</p>}
      {items.length === 0 && <p className="hint">{t('req.empty')}</p>}
      {items.length > 0 && todo.length === 0 && <p className="doc-allok"><span className="dot" aria-hidden="true" />{t('req.allDone')}</p>}
      {todo.length > 0 && (
        <>
          <h2 className="doc-group-title">{t('req.group.todo', { n: String(todo.length) })}</h2>
          <div className="doc-cards">{todo.map(card)}</div>
        </>
      )}
      {waiting.length > 0 && (
        <>
          <h2 className="doc-group-title">{t('req.group.waiting', { n: String(waiting.length) })}</h2>
          <p className="hint">{t('req.group.waitingHint')}</p>
          <div className="doc-cards">{waiting.map(card)}</div>
        </>
      )}
      {done.length > 0 && (
        <Fold id="done" title={t('req.group.done', { n: String(done.length) })} summary={t('req.group.doneHint')} open={folds.open === 'done'} onToggle={() => folds.toggle('done')}>
          <div className="doc-cards">{done.map(card)}</div>
        </Fold>
      )}
      {!isStaff && <Fold id="library" title={t('requests.library')} summary={t('requests.libraryHint')} open={folds.open === 'library'} onToggle={() => folds.toggle('library')}><ClubDocuments embedded /></Fold>}
    </div>
  )
}
