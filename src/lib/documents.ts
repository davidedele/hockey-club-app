import { t } from '../i18n'
import { dayKey, daysBetween, formatDateYear } from './time'
import type { MemberDocument } from './types'

// How a member's paperwork stands. ok is in order, soon needs attention within a month,
// bad needs attention now, none means there is nothing to check yet.
export type Level = 'ok' | 'soon' | 'bad' | 'none'
const RANK: Record<Level, number> = { none: 0, ok: 1, soon: 2, bad: 3 }

// The certificate counts as expiring this many days before its date.
export const SOON_DAYS = 30

export const today = () => dayKey(new Date().toISOString())

// Where a certificate stands (decisions 94 and 105). A valid one has a file, a date of issue that the
// reader found or staff confirmed, and an end date one year after the date of issue.
//   missing    no file (a date without a file counts for nothing)
//   needsDate  a file, but no date of issue yet
//   toVerify   a file and a date the member typed, or an old date: staff have to open the file and confirm
//   expired, soon, valid   by the end date
export type CertState = 'missing' | 'needsDate' | 'toVerify' | 'expired' | 'soon' | 'valid'

export function certificateState(doc: MemberDocument | undefined, now = today()): { level: Level; text: string; state: CertState } {
  if (!doc?.file_path) return { level: 'bad', text: t('docs.certMissing'), state: 'missing' }
  // An old row has an end date and no date of issue: nobody read it from the file.
  const trusted = Boolean(doc.issued_on) && (doc.issued_source === 'read' || Boolean(doc.verified_at))
  if (!doc.issued_on && !doc.valid_until) return { level: 'bad', text: t('docs.certNeedsDate'), state: 'needsDate' }
  if (!trusted || !doc.valid_until) {
    return { level: 'soon', text: doc.issued_on ? t('docs.certToVerifyOn', { date: formatDateYear(doc.issued_on) }) : t('docs.certToVerify'), state: 'toVerify' }
  }
  const date = formatDateYear(doc.valid_until)
  if (doc.valid_until < now) return { level: 'bad', text: t('docs.certExpired', { date }), state: 'expired' }
  if (daysBetween(now, doc.valid_until) <= SOON_DAYS) return { level: 'soon', text: t('docs.certSoon', { date }), state: 'soon' }
  return { level: 'ok', text: t('docs.certValid', { date }), state: 'valid' }
}

export function consentState(doc: MemberDocument | undefined, noticePath: string | null): { level: Level; text: string } {
  if (!noticePath) return { level: 'none', text: t('docs.noticeMissing') }
  if (!doc?.accepted_at) return { level: 'bad', text: t('docs.consentMissing') }
  if (doc.file_path !== noticePath) return { level: 'soon', text: t('docs.consentOld') }
  return { level: 'ok', text: t('docs.consentGiven', { date: formatDateYear(dayKey(doc.accepted_at)) }) }
}

// One line for the members list: the most urgent problem, or that everything is in order.
export function summary(docs: MemberDocument[], noticePath: string | null, now = today()): { level: Level; text: string } {
  const cert = certificateState(docs.find((d) => d.kind === 'medical_certificate'), now)
  const consent = consentState(docs.find((d) => d.kind === 'privacy_consent'), noticePath)
  const consentFirst = RANK[consent.level] > RANK[cert.level]
  const level = consentFirst ? consent.level : cert.level
  if (level === 'ok') return { level, text: t('docs.allOk') }
  if (consentFirst) return { level, text: t(level === 'bad' ? 'docs.sumConsentMissing' : 'docs.sumConsentOld') }
  const doc = docs.find((d) => d.kind === 'medical_certificate')
  if (cert.state === 'missing') return { level, text: t('docs.sumCertMissing') }
  if (cert.state === 'needsDate') return { level, text: t('docs.sumCertNeedsDate') }
  if (cert.state === 'toVerify') return { level, text: t('docs.sumCertToVerify') }
  return { level, text: t(level === 'bad' ? 'docs.sumCertExpired' : 'docs.sumCertSoon', { date: formatDateYear(doc!.valid_until!) }) }
}

// Photos of a certificate are redrawn as JPEG no larger than 1800 pixels a side, which keeps them
// readable, well under the size limit, and drops metadata such as where the photo was taken.
const MAX_SIDE = 1800
export async function shrinkDocument(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('document')
  // A PNG can be transparent, which a JPEG turns black, and black behind black text reads as nothing.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('document'))), 'image/jpeg', 0.85))
}
