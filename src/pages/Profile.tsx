import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import ConfirmAction from '../components/ConfirmAction'
import { errorText, t, type MessageKey } from '../i18n'
import { checked } from '../lib/formcheck'
import Avatar from '../components/Avatar'
import PageHeader from '../components/PageHeader'
import SectionShell from '../components/SectionShell'
import { shrinkPhoto, useAvatarUrls } from '../lib/avatars'
import { signOut, useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatPhone, isPhoneValid } from '../lib/phone'
import { nameHasDigits, personName, tidyName } from '../lib/names'
import AbsencePeriods from '../components/AbsencePeriods'
import CalendarFeed from '../components/CalendarFeed'
import ReminderSwitch from '../components/ReminderSwitch'
import InstallApp from '../components/InstallApp'
import LanguageChoice from '../components/LanguageChoice'
import { useClub } from '../lib/club'
import { summary } from '../lib/documents'
import type { MemberDocument, Position } from '../lib/types'

const back = () => ({ to: '/profile', label: t('profile.back') })

// The profile: a card with the person and the list of sections, the open section beside it.
export default function ProfileLayout() {
  const { profile, realRoles } = useSession()
  const photos = useAvatarUrls([profile?.avatar_path])
  const club = useClub()
  const [myGroups, setMyGroups] = useState<string[]>([])
  const [docs, setDocs] = useState<MemberDocument[] | null>(null)

  useEffect(() => {
    if (!profile) return
    const load = async () => {
      const [g, d] = await Promise.all([
        supabase.from('group_members').select('groups(name)').eq('user_id', profile.id),
        supabase.from('member_documents').select('*').eq('user_id', profile.id),
      ])
      setDocs((d.data ?? []) as MemberDocument[])
      const rows = (g.data ?? []) as unknown as { groups: { name: string } | null }[]
      setMyGroups(rows.flatMap((r) => (r.groups ? [r.groups.name] : [])))
    }
    void load()
    window.addEventListener('documents-changed', load)
    return () => window.removeEventListener('documents-changed', load)
  }, [profile])

  if (!profile) return null
  const docState = docs ? summary(docs, club.privacyNoticePath) : null
  const items = [
    { to: '/profile/info', label: t('profile.info') },
    { to: '/profile/documents', label: t('docs.title'), extra: docState && <span className={`doc-status ${docState.level}`}><span className="dot" aria-hidden="true" />{docState.text}</span> },
    { to: '/profile/absences', label: t('absence.title') },
    { to: '/profile/notifications', label: t('reminders.title') },
    { to: '/profile/calendar', label: t('calendar.title') },
    { to: '/profile/app', label: t('profile.app') },
  ]
  return (
    <SectionShell
      base="/profile"
      label={t('profile.title')}
      card={
        <div className="shell-card">
          <Avatar first={profile.first_name} last={profile.last_name} url={profile.avatar_path ? photos.get(profile.avatar_path) : null} size="large" />
          <div>
            <p className="shell-title">{personName(profile)}</p>
            <p className="hint">{myGroups.length ? myGroups.join(', ') : t('profile.noGroups')}</p>
            {realRoles.length > 0 && <p className="hint">{realRoles.map((r) => t(`role.${r}` as MessageKey)).join(', ')}</p>}
          </div>
        </div>
      }
      items={items}
      indexTo="/profile/info"
      index={<ProfileInfo />}
      foot={<button className="link shell-signout" onClick={() => void signOut()}>{t('common.signOut')}</button>}
    />
  )
}

// Name, number, role, phone and photo.
export function ProfileInfo() {
  const { profile, reload } = useSession()
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [jersey, setJersey] = useState(profile?.jersey_number?.toString() ?? '')
  const [position, setPosition] = useState<Position | ''>(profile?.position ?? '')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [nameError, setNameError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photos = useAvatarUrls([profile?.avatar_path])

  useEffect(() => {
    if (!profile) return
    setFirstName(profile.first_name)
    setLastName(profile.last_name)
    setJersey(profile.jersey_number?.toString() ?? '')
    setPosition(profile.position ?? '')
    void supabase.from('profile_contacts').select('phone').eq('user_id', profile.id).maybeSingle().then(({ data }) => {
      setPhone(formatPhone((data as { phone: string | null } | null)?.phone))
    })
  }, [profile])

  if (!profile) return null
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

  // Names are checked when the field is left and again on saving.
  const checkNames = () => setNameError(nameHasDigits(firstName) || nameHasDigits(lastName) ? t('error.name_digits') : '')

  async function save(e: FormEvent) {
    e.preventDefault()
    setMessage('')
    if (nameHasDigits(firstName) || nameHasDigits(lastName)) return setNameError(t('error.name_digits'))
    if (!isPhoneValid(phone)) return setPhoneError(t('error.phone_invalid'))
    const a = await supabase
      .from('profiles')
      .update({
        first_name: tidyName(firstName),
        last_name: tidyName(lastName),
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
    <div className="section">
      <PageHeader title={t('profile.info')} back={back()} />
      <div className="set-row photo-row">
        <Avatar first={profile.first_name} last={profile.last_name} url={profile.avatar_path ? photos.get(profile.avatar_path) : null} size="medium" />
        <div>
          <div className="actions">
            <label className="button file secondary">
              {t(profile.avatar_path ? 'profile.photoChange' : 'profile.photoAdd')}
              <input type="file" accept="image/*" disabled={photoBusy} onChange={(e) => void pickPhoto(e)} />
            </label>
            {profile.avatar_path && <ConfirmAction label={t('profile.photoRemove')} title={t('profile.photoRemoveTitle')} body={t('profile.photoRemoveBody')} confirm={t('profile.photoRemove')} disabled={photoBusy} onConfirm={() => void removePhoto()} />}
          </div>
          <p className="hint">{t('profile.photoHint')}</p>
          {photoError && <p className="error" role="alert">{photoError}</p>}
        </div>
      </div>
      <form className="form-col" {...checked(save)}>
        <div className="colours">
          <label>{t('common.firstName')}
            <input required autoComplete="given-name" autoCapitalize="words" value={firstName} aria-invalid={Boolean(nameError)} onChange={(e) => { setFirstName(e.target.value); setNameError('') }} onBlur={() => { setFirstName(tidyName(firstName)); checkNames() }} />
          </label>
          <label>{t('common.lastName')}
            <input required autoComplete="family-name" autoCapitalize="words" value={lastName} aria-invalid={Boolean(nameError)} onChange={(e) => { setLastName(e.target.value); setNameError('') }} onBlur={() => { setLastName(tidyName(lastName)); checkNames() }} />
          </label>
        </div>
        {nameError && <p className="error" role="alert">{nameError}</p>}
        <div className="colours">
          <label>{t('common.jersey')}
            <input type="number" inputMode="numeric" min={0} max={99} value={jersey} onChange={(e) => setJersey(e.target.value)} />
          </label>
          <div>
            <label htmlFor="position">{t('common.position')}</label>
            <select id="position" className="full" value={position} onChange={(e) => setPosition(e.target.value as Position | '')}>
              <option value="">{t('position.none')}</option>
              <option value="goalie">{t('position.goalie')}</option>
              <option value="defence">{t('position.defence')}</option>
              <option value="forward">{t('position.forward')}</option>
            </select>
          </div>
        </div>
        <label>{t('common.phone')}
          <input type="tel" autoComplete="tel" maxLength={30} placeholder="333 123 4567" value={phone} aria-invalid={Boolean(phoneError)} onChange={(e) => { setPhone(e.target.value); setPhoneError('') }} onBlur={() => { setPhone(formatPhone(phone)); setPhoneError(isPhoneValid(phone) ? '' : t('error.phone_invalid')) }} />
        </label>
        {phoneError && <p className="error" role="alert">{phoneError}</p>}
        <button type="submit">{t('common.save')}</button>
        {message && <p className={message === t('common.saved') ? 'hint' : 'error'} role={message === t('common.saved') ? 'status' : 'alert'}>{message}</p>}
      </form>
    </div>
  )
}

export function ProfileAbsences() {
  const { profile } = useSession()
  if (!profile) return null
  return (
    <div className="section">
      <PageHeader title={t('absence.title')} back={back()} />
      <AbsencePeriods userId={profile.id} heading={false} />
    </div>
  )
}

export function ProfileNotifications() {
  return (
    <div className="section">
      <PageHeader title={t('reminders.title')} back={back()} />
      <ReminderSwitch heading={false} />
    </div>
  )
}

export function ProfileCalendar() {
  return (
    <div className="section">
      <PageHeader title={t('calendar.title')} back={back()} />
      <CalendarFeed heading={false} />
    </div>
  )
}

export function ProfileApp() {
  return (
    <div className="section">
      <PageHeader title={t('profile.app')} back={back()} />
      <InstallApp />
      <LanguageChoice />
    </div>
  )
}
