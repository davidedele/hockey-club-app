import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { t, type MessageKey } from '../i18n'
import Avatar from '../components/Avatar'
import GroupBadge from '../components/GroupBadge'
import { useAvatarUrls } from '../lib/avatars'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Contact, Group, Profile } from '../lib/types'

export default function Members() {
  const { isStaff } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [memberships, setMemberships] = useState<{ group_id: number; user_id: string }[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [filter, setFilter] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    void (async () => {
      const [g, p, m, c] = await Promise.all([
        supabase.from('groups').select('*').order('id'),
        supabase.from('profiles').select('*').order('last_name'),
        supabase.from('group_members').select('group_id, user_id'),
        isStaff ? supabase.from('profile_contacts').select('*') : Promise.resolve({ data: [] }),
      ])
      setGroups((g.data ?? []) as Group[])
      setProfiles((p.data ?? []) as Profile[])
      setMemberships((m.data ?? []) as { group_id: number; user_id: string }[])
      setContacts((c.data ?? []) as Contact[])
    })()
  }, [isStaff])

  const codeById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])
  const contactById = useMemo(() => new Map(contacts.map((c) => [c.user_id, c])), [contacts])
  const photos = useAvatarUrls(profiles.map((p) => p.avatar_path))
  const q = query.trim().toLowerCase()
  const visible = profiles.filter(
    (p) =>
      (filter === null || memberships.some((m) => m.user_id === p.id && m.group_id === filter)) &&
      (!q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) || `${p.last_name} ${p.first_name}`.toLowerCase().includes(q)),
  )
  const groupsOf = (id: string) => memberships.filter((m) => m.user_id === id).map((m) => codeById.get(m.group_id)).filter(Boolean).join(', ')

  return (
    <div className="page wide">
      <h1>{t('members.title')}</h1>
      <label className="search">
        <span>{t('members.search')}</span>
        <input type="search" placeholder={t('members.searchHint')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="chips">
        <button className={filter === null ? 'chip on' : 'chip'} onClick={() => setFilter(null)}>{t('members.filterAll')}</button>
        {groups.map((g) => (
          <button key={g.id} className={filter === g.id ? 'chip on' : 'chip'} onClick={() => setFilter(g.id)}><GroupBadge group={g} size="small" />{g.name}</button>
        ))}
      </div>
      <div className="scroll desk-only">
        <table className="members-table">
          <thead>
            <tr>
              <th scope="col">{t('members.colName')}</th>
              <th scope="col">{t('members.colNumber')}</th>
              <th scope="col">{t('members.colPosition')}</th>
              <th scope="col">{t('members.colGroups')}</th>
              {isStaff && <th scope="col">{t('members.colEmail')}</th>}
              {isStaff && <th scope="col">{t('members.colPhone')}</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const contact = contactById.get(p.id)
              return (
                <tr key={p.id}>
                  <th scope="row">
                    <span className="who">
                      <Avatar first={p.first_name} last={p.last_name} url={p.avatar_path ? photos.get(p.avatar_path) : null} size="small" />
                      {isStaff ? <Link to={`/members/${p.id}`}>{p.last_name} {p.first_name}</Link> : <span>{p.last_name} {p.first_name}</span>}
                    </span>
                  </th>
                  <td>{p.jersey_number ?? ''}</td>
                  <td>{p.position ? t(`position.${p.position}` as MessageKey) : ''}</td>
                  <td>{groupsOf(p.id)}</td>
                  {isStaff && <td>{contact?.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : ''}</td>}
                  {isStaff && <td>{contact?.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : ''}</td>}
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr><td colSpan={isStaff ? 6 : 4} className="empty-cell">{q ? t('members.noMatch') : t('members.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {visible.length === 0 && <p className="hint phone-only">{q ? t('members.noMatch') : t('members.empty')}</p>}
      <ul className="list phone-only">
        {visible.map((p) => {
          const mine = memberships.filter((m) => m.user_id === p.id).map((m) => codeById.get(m.group_id))
          const contact = contactById.get(p.id)
          return (
            <li key={p.id} className="member">
              <Avatar first={p.first_name} last={p.last_name} url={p.avatar_path ? photos.get(p.avatar_path) : null} size="medium" />
              <div>
                {isStaff ? (
                  <Link className="member-name" to={`/members/${p.id}`}>{p.last_name} {p.first_name}</Link>
                ) : (
                  <div className="member-name">{p.last_name} {p.first_name}</div>
                )}
                <div className="hint">
                  {[p.position ? t(`position.${p.position}` as MessageKey) : null, mine.join(', ')].filter(Boolean).join(' · ')}
                </div>
                {isStaff && contact && (
                  <div className="hint">{[contact.email, contact.phone].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <span className="jersey" aria-label={p.jersey_number !== null ? `${t('common.jersey')} ${p.jersey_number}` : undefined}>
                {p.jersey_number !== null ? p.jersey_number : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
