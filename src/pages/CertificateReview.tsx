import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { errorText, t } from '../i18n'
import { toVerify, today } from '../lib/documents'
import { checked } from '../lib/formcheck'
import { personName } from '../lib/names'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { formatDateYear } from '../lib/time'
import type { MemberDocument, Profile } from '../lib/types'

const LINK_SECONDS = 600

// Staff screen: the medical certificates that have a file and a date nobody confirmed. Staff open the file,
// correct the date if it is wrong and confirm it. A staff member may confirm their own certificate here, in a
// staff view; it is recorded as made by the person concerned (decision 129).
export default function CertificateReview() {
  const { profile, isStaff } = useSession()
  const [people, setPeople] = useState<Map<string, Profile>>(new Map())
  const [docs, setDocs] = useState<MemberDocument[]>([])
  const [links, setLinks] = useState<Map<string, string>>(new Map())
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const [p, d] = await Promise.all([
      supabase.from('profiles').select('*').is('deleted_at', null),
      supabase.from('member_documents').select('*').eq('kind', 'medical_certificate'),
    ])
    const list = (d.data ?? []) as MemberDocument[]
    setPeople(new Map(((p.data ?? []) as Profile[]).map((x) => [x.id, x])))
    setDocs(list)
    const paths = list.filter((x) => x.file_path && (x.verified_at ? x.verified_by === x.user_id : true)).map((x) => x.file_path as string)
    if (paths.length) {
      const { data } = await supabase.storage.from('documents').createSignedUrls(paths, LINK_SECONDS)
      setLinks(new Map(((data ?? []) as { path: string | null; signedUrl: string }[]).filter((x) => x.path && x.signedUrl).map((x) => [x.path as string, x.signedUrl])))
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (isStaff) void load()
  }, [isStaff, load])

  if (!profile) return null
  if (!isStaff) return <Navigate to="/" replace />

  const nameOf = (id: string) => { const p = people.get(id); return p ? personName(p) : '' }
  const known = (d: MemberDocument) => people.has(d.user_id)
  const queue = toVerify(docs).filter(known).sort((a, b) => nameOf(a.user_id).localeCompare(nameOf(b.user_id), 'it'))
  const selfDone = docs.filter((d) => known(d) && d.file_path && d.verified_at && d.verified_by === d.user_id).sort((a, b) => nameOf(a.user_id).localeCompare(nameOf(b.user_id), 'it'))

  async function confirm(userId: string, date: string) {
    const { error } = await supabase.rpc('verify_certificate', { p_user: userId, p_issued_on: date })
    if (!error) {
      await load()
      window.dispatchEvent(new Event('documents-changed'))
    }
    return error ? errorText(error) : ''
  }

  return (
    <div className="page cert-review">
      <PageHeader
        title={t('certs.title')}
        back={{ to: '/members', label: t('members.title') }}
        description={t('certs.intro')}
      />
      <section className="card" aria-labelledby="cert-queue">
        <h2 id="cert-queue">{loaded ? t(queue.length === 1 ? 'certs.countOne' : 'certs.countMany', { n: String(queue.length) }) : t('certs.title')}</h2>
        {!loaded ? <p className="hint">–</p> : queue.length === 0 ? <p className="hint">{t('certs.empty')}</p> : (
          <ul className="review-list">
            {queue.map((d) => (
              <ReviewRow key={`${d.user_id}-${d.file_path}`} doc={d} name={nameOf(d.user_id)} link={d.file_path ? links.get(d.file_path) : undefined} own={d.user_id === profile.id} onConfirm={confirm} />
            ))}
          </ul>
        )}
      </section>
      {loaded && selfDone.length > 0 && (
        <section className="card" aria-labelledby="cert-self">
          <h2 id="cert-self">{t('certs.selfTitle')}</h2>
          <p className="hint">{t('certs.selfHint')}</p>
          <ul className="review-list">
            {selfDone.map((d) => (
              <ReviewRow key={`${d.user_id}-${d.file_path}`} doc={d} name={nameOf(d.user_id)} link={d.file_path ? links.get(d.file_path) : undefined} own={d.user_id === profile.id} recheck onConfirm={confirm} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ReviewRow(props: { doc: MemberDocument; name: string; link?: string; own: boolean; recheck?: boolean; onConfirm: (userId: string, date: string) => Promise<string> }) {
  const { doc, name, link, own, recheck, onConfirm } = props
  const [date, setDate] = useState(doc.issued_on ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const origin = doc.issued_on ? t(doc.issued_source === 'read' ? 'certs.issuedRead' : 'certs.issuedTyped', { date: formatDateYear(doc.issued_on) }) : t('certs.noDate')
  const id = `cert-date-${doc.user_id}`
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(await onConfirm(doc.user_id, date))
    setBusy(false)
  }
  return (
    <li className="review-row">
      <div className="review-who">
        <Link to={`/members/${doc.user_id}/documents`} className="review-name">{name}</Link>
        <span className="hint">{origin}</span>
        {own && !recheck && <span className="hint">{t('certs.own')}</span>}
        {recheck && <span className="hint">{t('docs.confirmedBySelf')}</span>}
        {link && <a href={link} target="_blank" rel="noopener noreferrer">{t('docs.certOpen')}</a>}
      </div>
      {!(recheck && own) && (
        <form className="review-form" {...checked(submit)}>
          <label htmlFor={id}>
            {t('docs.certDate')}
            <input id={id} type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button type="submit" className="secondary" disabled={busy}>{recheck ? t('certs.recheck') : t('docs.certConfirm')}</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </li>
  )
}
