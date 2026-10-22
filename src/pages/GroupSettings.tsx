import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { errorText, t } from '../i18n'
import GroupBadge from '../components/GroupBadge'
import { useClub } from '../lib/club'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Group, LeagueChampionship } from '../lib/types'
import { prettyName } from '../lib/league'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
const MAX_BYTES = 1024 * 1024

// The board sets up the club's groups: name, short code, colours, picture and weekly training limit.
export default function GroupSettings() {
  const { isBoard, loading } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<Map<number, number>>(new Map())
  const [league, setLeague] = useState<{ teams: string[]; champs: LeagueChampionship[] }>({ teams: [], champs: [] })
  const [open, setOpen] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [g, m, c, lm] = await Promise.all([
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id'),
      supabase.from('league_championships').select('*').order('position'),
      supabase.from('league_matches').select('home, away'),
    ])
    const teams = new Set<string>()
    for (const r of (lm.data ?? []) as { home: string; away: string }[]) { teams.add(r.home); teams.add(r.away) }
    setLeague({ teams: [...teams].sort(), champs: (c.data ?? []) as LeagueChampionship[] })
    setGroups((g.data ?? []) as Group[])
    const counts = new Map<number, number>()
    for (const r of (m.data ?? []) as { group_id: number }[]) counts.set(r.group_id, (counts.get(r.group_id) ?? 0) + 1)
    setMembers(counts)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!loading && !isBoard) return <Navigate to="/settings" replace />

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('groups').insert({ name: newName.trim(), code: newCode.trim().toUpperCase() })
    if (error) return setError(groupError(error))
    setNewName('')
    setNewCode('')
    setAdding(false)
    await load()
  }

  return (
    <div className="page narrow">
      <p><Link to="/settings">{t('settings.title')}</Link></p>
      <h1>{t('settings.groups')}</h1>
      <p className="hint">{t('groups.intro')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="list groups">
        {groups.map((g) => (
          <li key={g.id}>
            <button className="group-head" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>
              <GroupBadge group={g} />
              <span className="group-name">{g.name}</span>
              <span className="hint">{(members.get(g.id) ?? 0) === 1 ? t('groups.countOne') : t('groups.count', { n: String(members.get(g.id) ?? 0) })}</span>
              <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {open === g.id && <GroupEditor group={g} count={members.get(g.id) ?? 0} league={league} onDone={async () => { setOpen(null); await load() }} onChange={load} />}
          </li>
        ))}
      </ul>

      {!adding && <p><button className="secondary" onClick={() => setAdding(true)}>{t('groups.add')}</button></p>}
      {adding && <h2>{t('groups.addTitle')}</h2>}
      {adding && <form onSubmit={add} className="add-group">
        <label>{t('groups.name')}
          <input required maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} />
        </label>
        <label>{t('groups.code')}
          <input required maxLength={4} pattern="[A-Za-z0-9]{1,4}" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          <span className="hint">{t('groups.codeHint')}</span>
        </label>
        <div className="actions">
          <button type="submit">{t('groups.add')}</button>
          <button type="button" className="link" onClick={() => setAdding(false)}>{t('common.cancel')}</button>
        </div>
      </form>}
    </div>
  )
}

function groupError(error: { message?: string; code?: string }) {
  const text = `${error.code ?? ''} ${error.message ?? ''}`
  if (/23505|duplicate key/.test(text)) return t('groups.codeTaken')
  if (text.includes('event_needs_group')) return t('groups.hasEvents')
  return errorText(error)
}

function GroupEditor({ group, count, league, onDone, onChange }: { group: Group; count: number; league: { teams: string[]; champs: LeagueChampionship[] }; onDone: () => Promise<void>; onChange: () => Promise<void> }) {
  const club = useClub()
  const [name, setName] = useState(group.name)
  const [code, setCode] = useState(group.code)
  const [own, setOwn] = useState(Boolean(group.game_dark && group.game_light))
  const [dark, setDark] = useState(group.game_dark ?? club.gameDark)
  const [light, setLight] = useState(group.game_light ?? club.gameLight)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [leagueTeam, setLeagueTeam] = useState(group.league_team ?? '')
  const [comps, setComps] = useState<number[]>(group.league_championships ?? [])

  // An update that row level security silently refuses comes back with no rows.
  async function update(values: Record<string, string | number | number[] | null>) {
    const { data, error } = await supabase.from('groups').update(values).eq('id', group.id).select()
    if (error) return groupError(error)
    if (!data || data.length === 0) return errorText({ message: 'forbidden' })
    return ''
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const problem = await update({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      game_dark: own ? dark : null,
      game_light: own ? light : null,
      league_team: leagueTeam || null,
      league_championships: leagueTeam ? comps : [],
    })
    setBusy(false)
    if (problem) return setError(problem)
    await onDone()
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ext = TYPES[file.type]
    if (!ext) return setError(t('club.logoType'))
    if (file.size > MAX_BYTES) return setError(t('club.logoTooBig'))
    setBusy(true)
    const path = `group-${group.id}-${Date.now()}.${ext}`
    const up = await supabase.storage.from('club').upload(path, file, { contentType: file.type })
    const problem = up.error ? errorText(up.error) : await update({ logo_path: path })
    if (problem) {
      if (!up.error) await supabase.storage.from('club').remove([path])
      setError(problem)
    } else {
      if (group.logo_path) await supabase.storage.from('club').remove([group.logo_path])
      setError('')
      await onChange()
    }
    setBusy(false)
  }

  async function removePicture() {
    setBusy(true)
    const problem = await update({ logo_path: null })
    if (problem) setError(problem)
    else {
      if (group.logo_path) await supabase.storage.from('club').remove([group.logo_path])
      await onChange()
    }
    setBusy(false)
  }

  async function remove() {
    setBusy(true)
    const { data, error } = await supabase.from('groups').delete().eq('id', group.id).select()
    if (error || !data || data.length === 0) {
      setError(groupError(error ?? { message: 'forbidden' }))
      setConfirming(false)
      setBusy(false)
      return
    }
    if (group.logo_path) await supabase.storage.from('club').remove([group.logo_path])
    await onDone()
  }

  return (
    <div className="group-edit">
      <form onSubmit={save}>
        <label>{t('groups.name')}
          <input required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>{t('groups.code')}
          <input required maxLength={4} pattern="[A-Za-z0-9]{1,4}" value={code} onChange={(e) => setCode(e.target.value)} />
          <span className="hint">{t('groups.codeHint')}</span>
        </label>

        <span className="label">{t('groups.picture')}</span>
        <div className="logo-row">
          <GroupBadge group={group} />
          <div>
            <label className="button file">
              {t('club.logoChoose')}
              <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => void upload(e)} />
            </label>
            {group.logo_path && <button type="button" className="link" disabled={busy} onClick={() => void removePicture()}>{t('club.logoRemove')}</button>}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
          {t('groups.ownColours')}
        </label>
        {own ? (
          <div className="colours">
            <label>{t('club.dark')}
              <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} />
            </label>
            <label>{t('club.light')}
              <input type="color" value={light} onChange={(e) => setLight(e.target.value)} />
            </label>
          </div>
        ) : (
          <p className="hint">{t('groups.clubColours')}</p>
        )}

        <label htmlFor={`league-${group.id}`}>{t('groups.league')}</label>
        <select id={`league-${group.id}`} className="full" value={leagueTeam} onChange={(e) => setLeagueTeam(e.target.value)}>
          <option value="">{t('groups.leagueNone')}</option>
          {[...new Set([...league.teams, ...(group.league_team ? [group.league_team] : [])])].sort().map((name) => (
            <option key={name} value={name}>{prettyName(name)}</option>
          ))}
        </select>
        {league.teams.length === 0 && <p className="hint">{t('groups.leagueEmpty')}</p>}
        {leagueTeam && league.champs.length > 0 && (
          <div className="field">
            <span className="label">{t('groups.leagueComps')}</span>
            <div className="chips wrap">
              {league.champs.map((c) => (
                <button type="button" key={c.id} className={comps.includes(c.id) ? 'chip on' : 'chip'} aria-pressed={comps.includes(c.id)}
                  onClick={() => setComps(comps.includes(c.id) ? comps.filter((x) => x !== c.id) : [...comps, c.id])}>
                  {prettyName(c.name)}
                </button>
              ))}
            </div>
            <span className="hint">{t('groups.leagueHint')}</span>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="submit" disabled={busy}>{t('common.save')}</button>
          {!confirming && <button type="button" className="link danger-link" disabled={busy} onClick={() => setConfirming(true)}>{t('groups.delete')}</button>}
        </div>
      </form>
      {confirming && (
        <div className="box" role="alertdialog" aria-label={t('groups.delete')}>
          <p>{t('groups.deleteConfirm', { name: group.name, n: String(count) })}</p>
          <div className="actions">
            <button className="danger" disabled={busy} onClick={() => void remove()}>{t('groups.deleteNow', { name: group.name })}</button>
            <button className="link" disabled={busy} onClick={() => setConfirming(false)}>{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
