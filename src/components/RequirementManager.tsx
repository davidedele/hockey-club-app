import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import LoadError from './LoadError'
import { PageSkeleton } from './Skeleton'
import { errorText, t } from '../i18n'
import type { Requirement } from '../lib/requirements'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Group } from '../lib/types'

const monthsText = (n: number) => (n === 12 ? t('reqdocs.year') : t(n === 1 ? 'reqdocs.monthsOne' : 'reqdocs.monthsMany', { n: String(n) }))

// The list of what the club asks its members (decision 168). The board adds and changes them; coaches only read the list.
export default function RequirementManager() {
  const { isBoard } = useSession()
  const [items, setItems] = useState<Requirement[] | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [r, g] = await Promise.all([supabase.from('requirements').select('*').order('created_at'), supabase.from('groups').select('*').order('id')])
    const failure = r.error ?? g.error
    if (failure) return setError(errorText(failure))
    setError('')
    setItems((r.data ?? []) as Requirement[])
    setGroups((g.data ?? []) as Group[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error && !items) return <LoadError title={t('reqedit.title')} message={error} onRetry={() => void load()} />
  if (!items) return <PageSkeleton band={false} />

  const line = (r: Requirement) => [
    r.group_ids.length ? groups.filter((g) => r.group_ids.includes(g.id)).map((g) => g.name).join(', ') : t('requests.allMembers'),
    r.expiry_months ? t('reqedit.expires', { months: monthsText(r.expiry_months) }) : '',
    r.review !== 'none' ? t('reqedit.reviewed') : '',
    r.visibility === 'board' ? t('reqedit.boardOnly') : '',
  ].filter(Boolean).join(' · ')

  const active = items.filter((r) => r.active)
  const archived = items.filter((r) => !r.active)
  const row = (r: Requirement) => (
    <li className="req-row" key={r.id}>
      <div>
        <p className="req-row-title">{r.title}{!r.active && <span className="hint"> · {t('reqedit.archived')}</span>}</p>
        <p className="hint">{line(r)}</p>
      </div>
      {isBoard && <Link className="button secondary" to={`/settings/documents/${r.id}`} aria-label={t('reqedit.editNamed', { title: r.title })}>{t('reqedit.edit')}</Link>}
    </li>
  )

  return (
    <section className="section req-manager" aria-labelledby="req-manager-title">
      <div className="page-head">
        <h2 id="req-manager-title">{t('reqedit.title')}</h2>
        {isBoard && <Link className="button" to="/settings/documents/new">{t('reqedit.add')}</Link>}
      </div>
      <p className="hint">{t('reqedit.intro')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {items.length === 0 && <p className="hint">{t('reqedit.empty')}</p>}
      {active.length > 0 && <ul className="req-list">{active.map(row)}</ul>}
      {archived.length > 0 && (
        <>
          <h3>{t('reqedit.archivedTitle', { n: String(archived.length) })}</h3>
          <ul className="req-list">{archived.map(row)}</ul>
        </>
      )}
    </section>
  )
}
