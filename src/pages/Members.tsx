import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { Link } from 'react-router-dom'
import { t, type MessageKey } from '../i18n'
import Avatar from '../components/Avatar'
import { useAvatarUrls } from '../lib/avatars'
import { formatPhone, phoneLink } from '../lib/phone'
import { useGroupFilter } from '../lib/groupfilter'
import SortHeader from '../components/SortHeader'
import TablePager from '../components/TablePager'
import { downloadCsv, pageOf, sortRows, useSort, type Cell } from '../lib/table'
import OutputAction from '../components/OutputAction'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import type { Contact, Group, MemberDocument, Profile } from '../lib/types'
import { useClub } from '../lib/club'
import { summary } from '../lib/documents'

type MemberKey = 'name' | 'number' | 'position' | 'groups' | 'email' | 'phone' | 'docs'

export default function Members() {
  const { isStaff } = useSession()
  const [groups, setGroups] = useState<Group[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [memberships, setMemberships] = useState<{ group_id: number; user_id: string }[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [docs, setDocs] = useState<MemberDocument[]>([])
  const club = useClub()
  const { groupId: filter } = useGroupFilter()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  // Another group has fewer people, so go back to the first page rather than land on an empty one.
  useEffect(() => { setPage(1) }, [filter])
  const [size, setSize] = useState(25)
  const sort = useSort<MemberKey>('name')

  useEffect(() => {
    void (async () => {
      const [g, p, m, c, d] = await Promise.all([
        supabase.from('groups').select('*').order('id'),
        supabase.from('profiles').select('*').order('last_name'),
        supabase.from('group_members').select('group_id, user_id'),
        isStaff ? supabase.from('profile_contacts').select('*') : Promise.resolve({ data: [] }),
        isStaff ? supabase.from('member_documents').select('*') : Promise.resolve({ data: [] }),
      ])
      setDocs((d.data ?? []) as MemberDocument[])
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
  const positionText = (p: Profile) => (p.position ? t(`position.${p.position}` as MessageKey) : '')
  const sorted = sortRows(visible, (p): Cell => {
    switch (sort.key) {
      case 'number': return p.jersey_number
      case 'position': return positionText(p)
      case 'groups': return groupsOf(p.id)
      case 'email': return contactById.get(p.id)?.email ?? ''
      case 'phone': return contactById.get(p.id)?.phone ?? ''
      case 'docs': return summary(docs.filter((d) => d.user_id === p.id), club.privacyNoticePath).text
      default: return `${p.last_name} ${p.first_name}`
    }
  }, sort.dir)
  const rows = pageOf(sorted, page, size)
  const resetPage = () => setPage(1)
  function exportCsv() {
    downloadCsv('membri', [
      [t('common.lastName'), t('common.firstName'), t('members.colNumber'), t('members.colPosition'), t('members.colGroups'), t('members.colEmail'), t('members.colPhone'), t('members.colDocs')],
      ...sorted.map((p) => {
        const c = contactById.get(p.id)
        return [p.last_name, p.first_name, p.jersey_number, positionText(p), groupsOf(p.id), c?.email ?? '', formatPhone(c?.phone), summary(docs.filter((d) => d.user_id === p.id), club.privacyNoticePath).text]
      }),
    ])
  }
  // Staff see each member's paperwork at a glance, linked to their documents page.
  function docCell(id: string) {
    const state = summary(docs.filter((d) => d.user_id === id), club.privacyNoticePath)
    return (
      <Link className={`doc-status ${state.level}`} to={`/members/${id}/documents`}>
        <span className="dot" aria-hidden="true" />{state.text}
      </Link>
    )
  }

  return (
    <div className="page wide">
      <PageHeader title={t('members.title')} />
      <div className="toolbar">
        <label className="search">
          <span>{t('members.search')}</span>
          <input type="search" placeholder={t('members.searchHint')} value={query} onChange={(e) => { setQuery(e.target.value); resetPage() }} />
        </label>
        <div className="tools desk-only">
          <OutputAction kind="print" label={t('table.print')} onRun={() => window.print()} />
          {isStaff && <OutputAction kind="csv" label={t('table.export')} rows={sorted.length} personal disabled={sorted.length === 0} onRun={exportCsv} />}
        </div>
      </div>
      <div className="scroll desk-only">
        <table className="members-table">
          <thead>
            <tr>
              <SortHeader label={t('members.colName')} active={sort.key === 'name'} dir={sort.dir} onSort={() => { sort.toggle('name'); resetPage() }} />
              <SortHeader label={t('members.colNumber')} active={sort.key === 'number'} dir={sort.dir} onSort={() => { sort.toggle('number'); resetPage() }} />
              <SortHeader label={t('members.colPosition')} active={sort.key === 'position'} dir={sort.dir} onSort={() => { sort.toggle('position'); resetPage() }} />
              <SortHeader label={t('members.colGroups')} active={sort.key === 'groups'} dir={sort.dir} onSort={() => { sort.toggle('groups'); resetPage() }} />
              {isStaff && <SortHeader label={t('members.colEmail')} active={sort.key === 'email'} dir={sort.dir} onSort={() => { sort.toggle('email'); resetPage() }} />}
              {isStaff && <SortHeader label={t('members.colPhone')} active={sort.key === 'phone'} dir={sort.dir} onSort={() => { sort.toggle('phone'); resetPage() }} />}
              {isStaff && <SortHeader label={t('members.colDocs')} active={sort.key === 'docs'} dir={sort.dir} onSort={() => { sort.toggle('docs'); resetPage() }} />}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
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
                  {isStaff && <td className="email-cell">{contact?.email ? <a href={`mailto:${contact.email}`} title={contact.email}>{contact.email}</a> : ''}</td>}
                  {isStaff && <td>{contact?.phone ? <a href={phoneLink(contact.phone)}>{formatPhone(contact.phone)}</a> : ''}</td>}
                  {isStaff && <td>{docCell(p.id)}</td>}
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr><td colSpan={isStaff ? 7 : 4} className="empty-cell">{q ? t('members.noMatch') : t('members.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="desk-only">
        <TablePager total={sorted.length} page={page} size={size} onPage={setPage} onSize={(n) => { setSize(n); setPage(1) }} />
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
                  <div className="hint">{[contact.email, formatPhone(contact.phone)].filter(Boolean).join(' · ')}</div>
                )}
                {isStaff && docCell(p.id)}
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
