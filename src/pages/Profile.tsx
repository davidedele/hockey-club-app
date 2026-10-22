import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { errorText, t, type MessageKey } from '../i18n'
import Avatar from '../components/Avatar'
import { shrinkPhoto, useAvatarUrls } from '../lib/avatars'
import { signOut, useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatPhone } from '../lib/phone'
import AbsencePeriods from '../components/AbsencePeriods'
import { useClub } from '../lib/club'
import { summary } from '../lib/documents'
import type { MemberDocument, Position } from '../lib/types'
import { Link } from 'react-router-dom'

export default function ProfilePage() {
  const { profile, roles, reload } = useSession()
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [jersey, setJersey] = useState(profile?.jersey_number?.toString() ?? '')
  const [position, setPosition] = useState<Position | ''>(profile?.position ?? '')
  const [phone, setPhone] = useState('')
  const [myGroups, setMyGroups] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photos = useAvatarUrls([profile?.avatar_path])
  const club = useClub()
  const [docs, setDocs] = useState<MemberDocument[] | null>(null)

  useEffect(() => {
    if (!profile) return
    void (async () => {
      const [c, g, d] = await Promise.all([
        supabase.from('profile_contacts').select('phone').eq('user_id', profile.id).maybeSingle(),
        supabase.from('group_members').select('groups(name)').eq('user_id', profile.id),
        supabase.from('member_documents').select('*').eq('user_id', profile.id),
      ])
      setDocs((d.data ?? []) as MemberDocument[])
      setPhone(formatPhone((c.data as { phone: string | null } | null)?.phone))
      const rows = (g.data ?? []) as unknown as { groups: { name: string } | null }[]
      setMyGroups(rows.flatMap((r) => (r.groups ? [r.groups.name] : [])))
    })()
  }, [profile])

  if (!profile) return null
  const docState = docs ? summary(docs, club.privacyNoticePath) : null

  async function setPhoto(path: string | null) {
    const { data, error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', profile!.id).select()
    if (error) return errorText(error)
    if (!data || data.length === 0) return errorText({ message: 'forbidden' })
    return ''
  }

  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoBusy(true)
    setPhotoError('')
    let blob: Blob
    try {
      blob = await shrinkPhoto(file)
    } catch {
      setPhotoError(t('profile.photoUnreadable'))
      setPhotoBusy(false)
      return
    }
    const path = `${profile!.id}/avatar-${Date.now()}.jpg`
    const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' })
    const problem = up.error ? errorText(up.error) : await setPhoto(path)
    if (problem) {
      if (!up.error) await supabase.storage.from('avatars').remove([path])
      setPhotoError(problem)
    } else {
      if (profile!.avatar_path) await supabase.storage.from('avatars').remove([profile!.avatar_path])
      await reload()
    }
    setPhotoBusy(false)
  }

  async function removePhoto() {
    setPhotoBusy(true)
    setPhotoError('')
    const old = profile!.avatar_path
    const problem = await setPhoto(null)
    if (problem) setPhotoError(problem)
    else {
      if (old) await supabase.storage.from('avatars').remove([old])
      await reload()
    }
    setPhotoBusy(false)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    const a = await supabase
      .from('profiles')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        jersey_number: jersey === '' ? null : Number(jersey),
        position: position === '' ? null : position,
      })
      .eq('id', profile!.id)
    const b = await supabase.from('profile_contacts').update({ phone: formatPhone(phone) || null }).eq('user_id', profile!.id)
    const error = a.error ?? b.error
    if (error) {
      setMessage(errorText(error))
      return
    }
    await reload()
    setMessage(t('common.saved'))
  }

  return (
    <div className="page narrow">
      <h1>{t('profile.title')}</h1>
      <div className="logo-row">
        <Avatar first={profile.first_name} last={profile.last_name} url={profile.avatar_path ? photos.get(profile.avatar_path) : null} size="large" />
        <div>
          <label className="button file">
            {t(profile.avatar_path ? 'profile.photoChange' : 'profile.photoAdd')}
            <input type="file" accept="image/*" disabled={photoBusy} onChange={(e) => void pickPhoto(e)} />
          </label>
          {profile.avatar_path && <button className="link" disabled={photoBusy} onClick={() => void removePhoto()}>{t('profile.photoRemove')}</button>}
          <p className="hint">{t('profile.photoHint')}</p>
          {photoError && <p className="error" role="alert">{photoError}</p>}
        </div>
      </div>
      <form onSubmit={save}>
        <label>{t('common.firstName')}
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </label>
        <label>{t('common.lastName')}
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>
        <label>{t('common.jersey')}
          <input type="number" inputMode="numeric" min={0} max={99} value={jersey} onChange={(e) => setJersey(e.target.value)} />
        </label>
        <label htmlFor="position">{t('common.position')}</label>
          <select id="position" value={position} onChange={(e) => setPosition(e.target.value as Position | '')}>
            <option value="">{t('position.none')}</option>
            <option value="goalie">{t('position.goalie')}</option>
            <option value="defence">{t('position.defence')}</option>
            <option value="forward">{t('position.forward')}</option>
          </select>
        
        <label>{t('common.phone')}
          <input type="tel" autoComplete="tel" maxLength={30} placeholder="333 123 4567" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone(formatPhone(phone))} />
        </label>
        <button type="submit">{t('common.save')}</button>
        {message && <p className="hint">{message}</p>}
      </form>
      <h2>{t('docs.title')}</h2>
      {docState && <p className={`doc-status ${docState.level}`}><span className="dot" aria-hidden="true" />{docState.text}</p>}
      <p><Link className="button secondary small" to="/documents">{t('docs.open')}</Link></p>
      <AbsencePeriods userId={profile.id} />
      <h2>{t('profile.groups')}</h2>
      <p>{myGroups.length ? myGroups.join(', ') : t('profile.noGroups')}</p>
      {roles.length > 0 && <p className="hint">{roles.map((r) => t(`role.${r}` as MessageKey)).join(', ')}</p>}
      <button className="link" onClick={() => void signOut()}>{t('common.signOut')}</button>
    </div>
  )
}
