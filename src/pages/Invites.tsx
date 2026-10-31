import { useCallback, useEffect, useState } from 'react'
import ConfirmAction from '../components/ConfirmAction'
import PageHeader from '../components/PageHeader'
import { Navigate } from 'react-router-dom'
import { errorText, locale, t } from '../i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Group, Invite } from '../lib/types'

function status(i: Invite): string {
  const team = i.max_uses > 1
  if (i.revoked_at) return t('invites.status.revoked')
  if (i.used_at) return team ? t('invites.team.full', { max: String(i.max_uses) }) : t('invites.status.used')
  if (new Date(i.expires_at) <= new Date()) return t('invites.status.expired')
  const date = new Date(i.expires_at).toLocaleDateString(locale)
  return team
    ? t('invites.team.status', { used: String(i.use_count), max: String(i.max_uses), date })
    : t('invites.status.open', { date })
}

export default function Invites() {
  const { isStaff, isBoard } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [groupId, setGroupId] = useState<number | ''>('')
  const [link, setLink] = useState('')
  const [linkIsTeam, setLinkIsTeam] = useState(false)
  const [teamDays, setTeamDays] = useState('30')
  const [teamMax, setTeamMax] = useState('100')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [names, setNames] = useState<Map<string, string>>(new Map())

  const refresh = useCallback(async () => {
    const [g, i] = await Promise.all([
      supabase.from('groups').select('*').order('id'),
      supabase.from('invites').select('id, group_id, created_at, expires_at, used_at, used_by, revoked_at, max_uses, use_count').order('created_at', { ascending: false }).limit(30),
    ])
    const list = (g.data ?? []) as Group[]
    setGroups(list)
    const list2 = (i.data ?? []) as Invite[]
    setInvites(list2)
    const ids = [...new Set(list2.map((x) => x.used_by).filter((x): x is string => Boolean(x)))]
    if (ids.length) {
      const p = await supabase.from('profiles').select('id, first_name, last_name').in('id', ids)
      setNames(new Map(((p.data ?? []) as { id: string; first_name: string; last_name: string }[]).map((x) => [x.id, `${x.first_name} ${x.last_name}`])))
    }
    setGroupId((current) => (current === '' && list[0] ? list[0].id : current))
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!isStaff) return <Navigate to="/" replace />

  async function create(team: boolean) {
    if (groupId === '') return
    setError('')
    setCopied(false)
    const { data, error } = team
      ? await supabase.rpc('create_team_invite', { p_group_id: groupId, p_days: Number(teamDays), p_max_uses: Number(teamMax) })
      : await supabase.rpc('create_invite', { p_group_id: groupId })
    if (error) {
      setError(errorText(error))
      return
    }
    setLink(`${window.location.origin}/join/${data as string}`)
    setLinkIsTeam(team)
    await refresh()
  }

  async function revoke(id: string) {
    const { error } = await supabase.rpc('revoke_invite', { p_invite_id: id })
    if (error) setError(errorText(error))
    await refresh()
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function share() {
    try {
      await navigator.share({ title: t('invites.shareTitle'), text: t('invites.shareText'), url: link })
    } catch {
      // The person closed the share sheet. Nothing to do.
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
  }

  const groupName = (id: number) => groups.find((g) => g.id === id)?.name ?? ''

  // Active invites can still be used; the others are kept below, folded, for reference.
  const usable = (i: Invite) => !i.used_at && !i.revoked_at && new Date(i.expires_at) > new Date() && i.use_count < i.max_uses
  const active = invites.filter(usable)
  const past = invites.filter((i) => !usable(i))
  const row = (i: Invite) => (
    <li key={i.id}>
      <div className="row">
        <strong>{groupName(i.group_id)}</strong>
        <span className="hint">{i.used_by && names.get(i.used_by) ? t('invites.usedBy', { name: names.get(i.used_by)! }) : status(i)}</span>
      </div>
      {usable(i) && <ConfirmAction label={t('invites.revoke')} title={t('invites.revokeTitle', { group: groupName(i.group_id) })} body={t('invites.revokeBody')} confirm={t('invites.revokeGo')} onConfirm={() => revoke(i.id)} />}
    </li>
  )

  return (
    <div className="section">
      <PageHeader title={t('invites.title')} back={{ to: '/settings', label: t('settings.title') }} description={t('invites.intro')} />

      <section className="set-group" aria-labelledby="inv-one">
        <div className="set-label">
          <h2 id="inv-one">{t('invites.oneTitle')}</h2>
          <p className="hint">{t('invites.oneHint')}</p>
        </div>
        <div className="set-body">
          <label htmlFor="invite-group">{t('common.group')}</label>
          <select id="invite-group" className="full" value={groupId} onChange={(e) => setGroupId(Number(e.target.value))}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => void create(false)}>{t('invites.create')}</button>
        </div>
      </section>

      {isBoard && (
        <section className="set-group" aria-labelledby="inv-team">
          <div className="set-label">
            <h2 id="inv-team">{t('invites.team.title')}</h2>
            <p className="hint">{t('invites.team.intro')}</p>
          </div>
          <div className="set-body">
            <div className="colours">
              <label>{t('invites.team.days')}
                <input type="number" inputMode="numeric" min={1} max={90} value={teamDays} onChange={(e) => setTeamDays(e.target.value)} />
              </label>
              <label>{t('invites.team.max')}
                <input type="number" inputMode="numeric" min={2} max={200} value={teamMax} onChange={(e) => setTeamMax(e.target.value)} />
              </label>
            </div>
            <button className="secondary" onClick={() => void create(true)}>{t('invites.team.create')}</button>
          </div>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {link && (
        <div className="box" role="status">
          <strong>{t('invites.link')}</strong>
          <code>{link}</code>
          <p className="hint">{t(linkIsTeam ? 'invites.team.once' : 'invites.once')}</p>
          <div className="actions">
            {canShare && <button onClick={() => void share()}>{t('invites.share')}</button>}
            <button className={canShare ? 'secondary' : undefined} onClick={copy}>{copied ? t('common.copied') : t('common.copy')}</button>
          </div>
        </div>
      )}

      <h2>{t('invites.active')}</h2>
      {active.length === 0 ? <p className="hint">{t('invites.noneActive')}</p> : <ul className="list">{active.map(row)}</ul>}
      {past.length > 0 && (
        <details className="fold">
          <summary>{t('invites.past', { n: String(past.length) })}</summary>
          <ul className="list">{past.map(row)}</ul>
        </details>
      )}
    </div>
  )
}
