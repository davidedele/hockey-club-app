import type { MessageKey } from '../i18n'
import type { Requirement, RequirementBlock, RequirementVersion } from './requirements'

// What the board types when it defines a required document (decision 168), kept apart from the screen so it can be tested.

export interface Draft {
  title: string
  reason: string
  description: string
  // A PDF of the club folder that the person must open before answering.
  readingPath: string | null
  blocks: RequirementBlock[]
  groupIds: number[]
  deadline: string
  // The date block an end date counts from, and the months after it, as typed.
  expiryBlock: string
  expiryMonths: string
  review: Requirement['review']
  visibility: Requirement['visibility']
  blocking: boolean
  staffCanSubmit: boolean
}

export const MAX_BLOCKS = 20

export function blankDraft(): Draft {
  return { title: '', reason: '', description: '', readingPath: null, blocks: [], groupIds: [], deadline: '', expiryBlock: '', expiryMonths: '', review: 'none', visibility: 'staff', blocking: true, staffCanSubmit: false }
}

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
// A short id the database accepts (lower case letters and digits) that no block of the list has.
export function newBlockId(blocks: RequirementBlock[]): string {
  for (;;) {
    let id = ''
    for (let i = 0; i < 6; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)]
    if (!blocks.some((b) => b.id === id)) return id
  }
}

export function newBlock(type: RequirementBlock['type'], blocks: RequirementBlock[]): RequirementBlock {
  const id = newBlockId(blocks)
  return type === 'text' ? { id, type, label: '' } : { id, type, label: '', required: true }
}

export function moveBlock(blocks: RequirementBlock[], index: number, step: -1 | 1): RequirementBlock[] {
  const to = index + step
  if (to < 0 || to >= blocks.length) return blocks
  const next = blocks.slice()
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

// The first thing wrong with a draft, as a message key, or null. The database checks the same rules again.
export function validateDraft(d: Draft): MessageKey | null {
  if (!d.title.trim()) return 'reqedit.errTitle'
  if (!d.reason.trim()) return 'reqedit.errReason'
  if (d.blocks.length > MAX_BLOCKS) return 'reqedit.errTooMany'
  if (!d.blocks.some((b) => b.type !== 'text')) return 'reqedit.errAnswerBlock'
  if (d.blocks.some((b) => !b.label.trim())) return 'reqedit.errBlockLabel'
  if (d.expiryBlock || d.expiryMonths) {
    if (!d.blocks.some((b) => b.id === d.expiryBlock && b.type === 'date')) return 'reqedit.errExpiryBlock'
    const months = Number(d.expiryMonths)
    if (!Number.isInteger(months) || months < 1 || months > 120) return 'reqedit.errMonths'
  }
  if (d.review === 'unless_read' && !d.blocks.some((b) => b.type === 'date' && b.read_from_file)) return 'reqedit.errUnlessRead'
  return null
}

// Whether the change asks everybody to answer again: the blocks (number, order, kind, mandatory, read from file) or the
// file to read are different. New wording of a label or the description is only a correction.
type Structure = Pick<Draft, 'blocks' | 'readingPath'> & Partial<Draft>
export function structureChanged(before: Structure, after: Structure): boolean {
  if (before.readingPath !== after.readingPath) return true
  if (before.blocks.length !== after.blocks.length) return true
  return before.blocks.some((b, i) => {
    const a = after.blocks[i]
    return b.id !== a.id || b.type !== a.type || Boolean(b.required) !== Boolean(a.required) || Boolean(b.read_from_file) !== Boolean(a.read_from_file)
  })
}

export function fromRequirement(req: Requirement, version: RequirementVersion): Draft {
  return {
    title: req.title, reason: req.reason, description: version.description, readingPath: version.reading_path, blocks: version.blocks.map((b) => ({ ...b })),
    groupIds: req.group_ids, deadline: req.deadline ?? '', expiryBlock: req.expiry_block ?? '', expiryMonths: req.expiry_months === null ? '' : String(req.expiry_months),
    review: req.review, visibility: req.visibility, blocking: req.blocking, staffCanSubmit: req.staff_can_submit,
  }
}

// The two parts the database function takes.
export function toSave(d: Draft) {
  return {
    fields: {
      title: d.title.trim(), reason: d.reason.trim(), group_ids: d.groupIds, deadline: d.deadline || null,
      expiry_block: d.expiryBlock || null, expiry_months: d.expiryBlock ? Number(d.expiryMonths) : null,
      review: d.review, visibility: d.visibility, blocking: d.blocking, staff_can_submit: d.staffCanSubmit,
    },
    content: { description: d.description.trim(), reading_path: d.readingPath, blocks: d.blocks },
  }
}

// Starting points for a new document, so the board does not begin from nothing.
export function presetDraft(kind: 'consent' | 'read' | 'upload'): Draft {
  const d = blankDraft()
  const a = { id: 'accept', type: 'checkbox' as const, label: '', required: true }
  if (kind === 'consent') return { ...d, blocks: [{ ...a, label: 'Do il consenso' }] }
  if (kind === 'read') return { ...d, blocks: [{ ...a, label: 'Ho letto e accetto il documento' }] }
  return { ...d, review: 'always', blocks: [{ id: 'file', type: 'file', label: 'Documento firmato', required: true }] }
}
