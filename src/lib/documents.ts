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

export function certificateState(doc: MemberDocument | undefined, now = today()): { level: Level; text: string } {
  if (!doc?.valid_until) return { level: 'bad', text: t('docs.certMissing') }
  const date = formatDateYear(doc.valid_until)
  if (doc.valid_until < now) return { level: 'bad', text: t('docs.certExpired', { date }) }
  if (daysBetween(now, doc.valid_until) <= SOON_DAYS) return { level: 'soon', text: t('docs.certSoon', { date }) }
  return { level: 'ok', text: t('docs.certValid', { date }) }
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
  if (!doc?.valid_until) return { level, text: t('docs.sumCertMissing') }
  return { level, text: t(level === 'bad' ? 'docs.sumCertExpired' : 'docs.sumCertSoon', { date: formatDateYear(doc.valid_until) }) }
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
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('document'))), 'image/jpeg', 0.85))
}
