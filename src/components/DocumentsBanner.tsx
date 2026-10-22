import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { t } from '../i18n'
import { useClub } from '../lib/club'
import { certificateState, consentState } from '../lib/documents'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDateYear } from '../lib/time'
import type { MemberDocument } from '../lib/types'

// A line on every screen while the person's own certificate is missing, expired or close to expiry,
// or while the club's privacy notice still waits for their consent.
export default function DocumentsBanner() {
  const { profile } = useSession()
  const club = useClub()
  const location = useLocation()
  const [docs, setDocs] = useState<MemberDocument[] | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase.from('member_documents').select('*').eq('user_id', profile.id)
    setDocs((data ?? []) as MemberDocument[])
  }, [profile])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    window.addEventListener('documents-changed', load)
    return () => window.removeEventListener('documents-changed', load)
  }, [load])

  if (!docs || location.pathname === '/documents' || location.pathname.startsWith('/settings')) return null
  const cert = docs.find((d) => d.kind === 'medical_certificate')
  const certNow = certificateState(cert)
  const consentNow = consentState(docs.find((d) => d.kind === 'privacy_consent'), club.privacyNoticePath)
  let text = ''
  if (certNow.level === 'bad') text = t(cert?.valid_until ? 'banner.certExpired' : 'banner.certMissing')
  else if (certNow.level === 'soon') text = t('banner.certSoon', { date: formatDateYear(cert!.valid_until!) })
  else if (consentNow.level === 'bad' || consentNow.level === 'soon') text = t('banner.consent')
  if (!text) return null
  return (
    <div className="banner doc-banner" role="status">
      <span>{text}</span>
      <Link to="/documents">{t('docs.open')}</Link>
    </div>
  )
}
