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

export interface RequirementItem {
  req: Requirement
  answer: RequirementAnswer | undefined
  status: RequirementStatus
}

// The requirements one person has to deal with: those for their groups that are active, and any they already answered.
export function itemsFor(reqs: Requirement[], answers: RequirementAnswer[], groupIds: number[], now: string): RequirementItem[] {
  return reqs
    .map((req) => ({ req, answer: answers.find((a) => a.requirement_id === req.id) }))
    .filter(({ req, answer }) => (req.active && appliesTo(req, groupIds)) || answer)
    .map(({ req, answer }) => ({ req, answer, status: requirementStatus(req, answer, now) }))
}

export const needsAction = (i: RequirementItem) => ['missing', 'outdated', 'rejected', 'expired'].includes(i.status.state)
export const isWaiting = (i: RequirementItem) => ['pending', 'expiring'].includes(i.status.state)

const RANK: Record<Level, number> = { none: 0, ok: 0, soon: 1, bad: 2 }

export interface PersonSummary {
  level: Level
  todo: number
  waiting: number
  text: string
}

// One line for a person across all their requirements: the profile menu, the banner and the Members column use it.
export function personSummary(items: RequirementItem[]): PersonSummary {
  const todo = items.filter(needsAction)
  const waiting = items.filter(isWaiting)
  const level = items.reduce<Level>((worst, i) => (RANK[i.status.level] > RANK[worst] ? i.status.level : worst), 'ok')
  const single = (i: RequirementItem) => t('req.sum.single', { title: i.req.title, status: statusText(i.req, i.answer, i.status) })
  let text = t('docs.allOk')
  if (todo.length === 1) text = single(todo[0])
  else if (todo.length > 1) text = t('req.sum.todoMany', { n: String(todo.length) })
  else if (waiting.length === 1) text = single(waiting[0])
  else if (waiting.length > 1) text = t('req.sum.waitingMany', { n: String(waiting.length) })
  return { level, todo: todo.length, waiting: waiting.length, text }
}

// What staff see of one person. A coach does not see what the board keeps to itself, so those requirements are left out
// instead of showing everybody as missing.
export function staffItemsFor(reqs: Requirement[], answers: RequirementAnswer[], groupIds: number[], now: string, isBoard: boolean): RequirementItem[] {
  return itemsFor(reqs.filter((r) => isBoard || r.visibility === 'staff'), answers, groupIds, now)
}

export interface StaffFigures {
  // People with something to complete (missing, outdated, rejected or expired).
  todo: number
  // People with an answer that waits for a staff member.
  toVerify: number
  // People with something that ends within SOON_DAYS.
  expiring: number
}

// The three Home figures, counted in people so that the same person is not counted twice.
export function staffFigures(
  people: string[],
  memberships: { group_id: number; user_id: string }[],
  reqs: Requirement[],
  answers: RequirementAnswer[],
  now: string,
  isBoard: boolean,
): StaffFigures {
  const figures: StaffFigures = { todo: 0, toVerify: 0, expiring: 0 }
  for (const id of people) {
    const groupIds = memberships.filter((m) => m.user_id === id).map((m) => m.group_id)
    const items = staffItemsFor(reqs, answers.filter((a) => a.user_id === id), groupIds, now, isBoard)
    if (items.some(needsAction)) figures.todo++
    if (items.some((i) => i.status.state === 'pending')) figures.toVerify++
    if (items.some((i) => i.status.state === 'expiring')) figures.expiring++
  }
  return figures
}
