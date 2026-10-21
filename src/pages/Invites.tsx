import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Group, Invite } from '../lib/types'

function status(i: Invite): string {
  if (i.used_at) return t('invites.status.used')
  if (i.revoked_at) return t('invites.status.revoked')
  if (new Date(i.expires_at) <= new Date()) return t('invites.status.expired')
  return t('invites.status.open', { date: new Date(i.expires_at).toLocaleDateString('it-IT') })
}

export default function Invites() {
  const { isStaff } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [groupId, setGroupId] = useState<number | ''>('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [g, i] = await Promise.all([
      supabase.from('groups').select('*').order('id'),
      supabase.from('invites').select('id, group_id, created_at, expires_at, used_at, revoked_at').order('created_at', { ascending: false }).limit(30),
    ])
    const list = (g.data ?? []) as Group[]
    setGroups(list)
    setInvites((i.data ?? []) as Invite[])
    setGroupId((current) => (current === '' && list[0] ? list[0].id : current))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!isStaff) return <Navigate to="/" replace />

  async function create() {
    if (groupId === '') return
    setError('')
    setCopied(false)
    const { data, error } = await supabase.rpc('create_invite', { p_group_id: groupId })
    if (error) {
      setError(errorText(error))
      return
    }
    setLink(`${window.location.origin}/join/${data as string}`)
    await refresh()
  }

  async function revoke(id: string) {
    const { error } = await supabase.rpc('revoke_invite', { p_invite_id: id })
    if (error) setError(errorText(error))
    await refresh()
  }

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  const groupName = (id: number) => groups.find((g) => g.id === id)?.name ?? ''

  return (
    <div className="page narrow">
      <h1>{t('invites.title')}</h1>
      <p className="hint">{t('invites.intro')}</p>
      <label>{t('common.group')}
        <select value={groupId} onChange={(e) => setGroupId(Number(e.target.value))}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </label>
      <button onClick={create}>{t('invites.create')}</button>
      {error && <p className="error">{error}</p>}
      {link && (
        <div className="box">
          <strong>{t('invites.link')}</strong>
          <code>{link}</code>
          <p className="hint">{t('invites.once')}</p>
          <button onClick={copy}>{copied ? t('common.copied') : t('common.copy')}</button>
        </div>
      )}
      <h2>{t('invites.list')}</h2>
      <ul className="list">
        {invites.map((i) => (
          <li key={i.id}>
            <div className="row">
              <strong>{groupName(i.group_id)}</strong>
              <span className="hint">{status(i)}</span>
            </div>
            {!i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date() && (
              <button className="link" onClick={() => revoke(i.id)}>{t('invites.revoke')}</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
