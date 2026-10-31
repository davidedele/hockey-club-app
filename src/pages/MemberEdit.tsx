import { ConfirmDialog } from '../components/ConfirmAction'
import { personName } from '../lib/names'
import { PageSkeleton } from '../components/Skeleton'
import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Group, Profile, Role } from '../lib/types'
import AbsencePeriods from '../components/AbsencePeriods'

const ROLES: Role[] = ['coach', 'board']

export default function MemberEdit() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isStaff, isBoard, profile: me, reload } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [person, setPerson] = useState<Profile | null>(null)
  const [memberOf, setMemberOf] = useState<number[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loaded, setLoaded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [g, p, m, r] = await Promise.all([
      supabase.from('groups').select('*').order('id'),
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('group_members').select('group_id').eq('user_id', id),
      supabase.from('user_roles').select('role').eq('user_id', id),
    ])
    setGroups((g.data ?? []) as Group[])
    setPerson((p.data as Profile | null) ?? null)
    setMemberOf(((m.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    setRoles(((r.data ?? []) as { role: Role }[]).map((x) => x.role))
    setLoaded(true)
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!isStaff) return <Navigate to="/members" replace />
  if (loaded && !person) return <Navigate to="/members" replace />
  if (!person) return <PageSkeleton />

  const isMe = me?.id === person.id

  // Every change reports the real outcome. A rule that blocks a change must not look like success.
  async function run(change: () => PromiseLike<{ error: { message?: string; code?: string } | null; data?: unknown[] | null }>) {
    setBusy(true)
    setError('')
    const { error, data } = await change()
    if (error) setError(errorText(error))
    else if (Array.isArray(data) && data.length === 0) setError(errorText({ message: 'forbidden' }))
    await refresh()
    if (isMe) await reload()
    setBusy(false)
  }

  function toggleGroup(groupId: number) {
    return run(() =>
      memberOf.includes(groupId)
        ? supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', id).select()
        : supabase.from('group_members').insert({ group_id: groupId, user_id: id }).select(),
    )
  }

  function toggleRole(role: Role) {
    return run(() =>
      roles.includes(role)
        ? supabase.from('user_roles').delete().eq('user_id', id).eq('role', role).select()
        : supabase.from('user_roles').insert({ user_id: id, role }).select(),
    )
  }

  // Deleting a member's data: the database function and the server function that removes the files and
  // the sign in account run together in delete-member. The club's history stays on an anonymous profile.
  async function remove() {
    setBusy(true)
    setError('')
    const { data, error } = await supabase.functions.invoke('delete-member', { body: { user_id: id } })
    const code = (data as { error?: string } | null)?.error
    if (error || code) {
      setError(t(code === 'last_board' ? 'member.deleteLastBoard' : code === 'cannot_delete_self' ? 'member.deleteSelf' : 'member.deleteFailed'))
      setConfirming(false)
      setBusy(false)
      return
    }
    navigate('/members', { replace: true })
  }

  const name = personName(person)

  return (
    <div className="page">
      <PageHeader title={name} back={{ to: '/members', label: t('nav.members') }} />
      {error && <p className="error" role="alert">{error}</p>}

      <h2>{t('member.groups')}</h2>
      <div className="chips wrap">
        {groups.map((g) => (
          <button
            key={g.id}
            className={memberOf.includes(g.id) ? 'chip on' : 'chip'}
            aria-pressed={memberOf.includes(g.id)}
            disabled={busy}
            onClick={() => void toggleGroup(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>
      <p className="hint">{t('member.groupsHint')}</p>

      <h2>{t('docs.title')}</h2>
      <p><Link className="button secondary small" to={`/members/${person.id}/documents`}>{t('docs.open')}</Link></p>

      <AbsencePeriods userId={person.id} name={person.first_name} />

      {isBoard && (
        <>
          <h2>{t('member.roles')}</h2>
          <div className="chips wrap">
            {ROLES.map((r) => (
              <button
                key={r}
                className={roles.includes(r) ? 'chip on' : 'chip'}
                aria-pressed={roles.includes(r)}
                disabled={busy}
                onClick={() => void toggleRole(r)}
              >
                {t(`role.${r}`)}
              </button>
            ))}
          </div>
          <p className="hint">{t('member.rolesHint')}</p>

          {!isMe && (
            <>
              <h2>{t('member.remove')}</h2>
              <p className="hint">{t('member.removeHint')}</p>
              <button className="danger" disabled={busy} onClick={() => setConfirming(true)}>
                {t('member.removeStart')}
              </button>
              <ConfirmDialog
                open={confirming}
                title={t('member.removeTitle', { name })}
                body={t('member.removeConfirm', { name })}
                busy={busy}
                choices={[{ label: t('member.removeNow', { name }), onChoose: () => void remove() }]}
                onClose={() => setConfirming(false)}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
