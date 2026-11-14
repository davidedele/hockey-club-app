import { t } from '../i18n'
import type { Level } from './documents'
import { SOON_DAYS } from './documents'
import { daysBetween, formatDateYear } from './time'

// One kind of required document (decision 168): the certificate, the privacy consent and every club request.

export type BlockType = 'text' | 'checkbox' | 'date' | 'file'
export interface RequirementBlock {
  id: string
  type: BlockType
  label: string
  // Not on a text block.
  required?: boolean
  // A date block whose value the reader may find in the photo or file of the same requirement.
  read_from_file?: boolean
}

export interface Requirement {
  id: string
  // Set only for the two the club had before: the certificate and the privacy consent.
  slug: 'medical_certificate' | 'privacy_consent' | null
  title: string
  reason: string
  group_ids: number[]
  deadline: string | null
  expiry_block: string | null
  expiry_months: number | null
  review: 'none' | 'always' | 'unless_read'
  visibility: 'staff' | 'board'
  blocking: boolean
  staff_can_submit: boolean
  active: boolean
  current_version: number
}

export interface RequirementVersion {
  requirement_id: string
  version: number
  description: string
  reading_path: string | null
  blocks: RequirementBlock[]
}

export type AnswerStatus = 'complete' | 'pending' | 'approved' | 'rejected'
export interface RequirementAnswer {
  requirement_id: string
  user_id: string
  version: number
  // Block id to true or false (checkbox), a date as text (date) or a storage path (file).
  answers: Record<string, boolean | string>
  sources: Record<string, 'read' | 'typed'>
  status: AnswerStatus
  submitted_at: string
  valid_until: string | null
  reviewed_at: string | null
  review_note: string
}

// missing    nothing on record
// rejected   staff asked for a correction
// outdated   answered an earlier version, which the board has since replaced
// expired    the end date has passed
// pending    waiting for staff to confirm
// expiring   the end date is within SOON_DAYS
// done       in order
export type RequirementState = 'missing' | 'rejected' | 'outdated' | 'expired' | 'pending' | 'expiring' | 'done'

export interface RequirementStatus {
  state: RequirementState
  level: Level
  // The deadline has passed and the person still has something to do.
  overdue: boolean
}

// The one place that says how a person stands for a requirement. The player screen, the Members column, the Home figures
// and the banner all use it, so the numbers agree.
export function requirementStatus(req: Requirement, answer: RequirementAnswer | undefined, now: string): RequirementStatus {
  const open = (): Level => (req.blocking ? 'bad' : 'soon')
  let state: RequirementState
  let level: Level
  if (!answer) {
    state = 'missing'
    level = open()
  } else if (answer.version < req.current_version) {
    state = 'outdated'
    level = open()
  } else if (answer.status === 'rejected') {
    state = 'rejected'
    level = 'bad'
  } else if (answer.valid_until && answer.valid_until < now) {
    state = 'expired'
    level = 'bad'
  } else if (answer.status === 'pending') {
    state = 'pending'
    level = 'soon'
  } else if (answer.valid_until && daysBetween(now, answer.valid_until) <= SOON_DAYS) {
    state = 'expiring'
    level = 'soon'
  } else {
    state = 'done'
    level = 'ok'
  }
  const acting = state === 'missing' || state === 'outdated' || state === 'rejected' || state === 'expired'
  return { state, level, overdue: acting && req.deadline !== null && req.deadline < now }
}

// The words under the title of a requirement, for the person looking at it.
export function statusText(req: Requirement, answer: RequirementAnswer | undefined, status: RequirementStatus): string {
  const until = answer?.valid_until ? formatDateYear(answer.valid_until) : ''
  switch (status.state) {
    case 'missing': return t('req.status.missing')
    case 'outdated': return t('req.status.outdated')
    case 'rejected': return t('req.status.rejected')
    case 'expired': return t('req.status.expired', { date: until })
    case 'pending': return t('req.status.pending')
    case 'expiring': return t('req.status.expiring', { date: until })
    case 'done': return until ? t('req.status.doneUntil', { date: until }) : t('req.status.done')
  }
  return req.title
}

// Mirrors the database: an answer to the current version stands unless it was rejected or the requirement expires.
export function canSubmit(req: Requirement, answer: RequirementAnswer | undefined): boolean {
  if (!req.active) return false
  if (!answer) return true
  if (answer.status === 'rejected' || answer.version < req.current_version) return true
  return req.expiry_months !== null
}

// A requirement for no group is for everybody.
export function appliesTo(req: Requirement, groupIds: number[]): boolean {
  return req.group_ids.length === 0 || req.group_ids.some((g) => groupIds.includes(g))
}
