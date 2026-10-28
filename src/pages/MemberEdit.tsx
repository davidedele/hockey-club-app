import { useCallback, useEffect, useState } from 'react'
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

  if (!isStaff) return <Navigate to="/" replace />
  if (loaded && !person) return <Navigate to="/" replace />
  if (!person) return <p className="center">{t('common.loading')}</p>

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

  async function remove() {
    setBusy(true)
    setError('')
    const photo = person!.avatar_path
    const { error, data } = await supabase.from('profiles').delete().eq('id', id).select()
    if (error || !data || data.length === 0) {
      setError(errorText(error ?? { message: 'forbidden' }))
      setConfirming(false)
      setBusy(false)
      return
    }
    // A removed member's picture goes too. Only the storage API removes the file itself.
    if (photo) await supabase.storage.from('avatars').remove([photo])
    navigate('/', { replace: true })
  }

  const name = `${person.first_name} ${person.last_name}`

  return (
    <div className="page">
      <p><Link to="/">{t('nav.members')}</Link></p>
      <h1>{name}</h1>
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
              {!confirming ? (
                <button className="danger" disabled={busy} onClick={() => setConfirming(true)}>
                  {t('member.removeStart')}
                </button>
              ) : (
                <div className="box" role="alertdialog" aria-label={t('member.remove')}>
                  <p>{t('member.removeConfirm', { name })}</p>
                  <div className="actions">
                    <button className="danger" disabled={busy} onClick={() => void remove()}>
                      {t('member.removeNow', { name })}
                    </button>
                    <button className="link" disabled={busy} onClick={() => setConfirming(false)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
