import { describe, expect, it } from 'vitest'
import { blankDraft, fromRequirement, moveBlock, newBlockId, presetDraft, structureChanged, toSave, validateDraft, type Draft } from './requirementedit'
import type { Requirement, RequirementVersion } from './requirements'

const draft = (over: Partial<Draft> = {}): Draft => ({
  ...blankDraft(),
  title: 'Foto', reason: 'Per le foto', blocks: [{ id: 'a1', type: 'checkbox', label: 'Consento', required: true }], ...over,
})

describe('newBlockId', () => {
  it('makes an id the database accepts that no block has', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 200; i++) {
      const id = newBlockId([...ids].map((x) => ({ id: x, type: 'text' as const, label: 'x' })))
      expect(id).toMatch(/^[a-z0-9]{1,12}$/)
      expect(ids.has(id)).toBe(false)
      ids.add(id)
    }
  })
})

describe('moveBlock', () => {
  const blocks = [{ id: 'a', type: 'text' as const, label: '1' }, { id: 'b', type: 'text' as const, label: '2' }, { id: 'c', type: 'text' as const, label: '3' }]
  it('moves a block up and down and stops at the ends', () => {
    expect(moveBlock(blocks, 1, -1).map((b) => b.id)).toEqual(['b', 'a', 'c'])
    expect(moveBlock(blocks, 1, 1).map((b) => b.id)).toEqual(['a', 'c', 'b'])
    expect(moveBlock(blocks, 0, -1).map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(moveBlock(blocks, 2, 1).map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('validateDraft', () => {
  it('accepts a simple consent', () => expect(validateDraft(draft())).toBeNull())
  it('needs a title, a reason and one block that takes an answer', () => {
    expect(validateDraft(draft({ title: ' ' }))).toBe('reqedit.errTitle')
    expect(validateDraft(draft({ reason: '' }))).toBe('reqedit.errReason')
    expect(validateDraft(draft({ blocks: [{ id: 'a', type: 'text', label: 'Solo testo' }] }))).toBe('reqedit.errAnswerBlock')
    expect(validateDraft(draft({ blocks: [] }))).toBe('reqedit.errAnswerBlock')
  })
  it('needs a label on every block', () => {
    expect(validateDraft(draft({ blocks: [{ id: 'a', type: 'checkbox', label: ' ', required: true }] }))).toBe('reqedit.errBlockLabel')
  })
  it('needs a date block and 1 to 120 months for an end date', () => {
    expect(validateDraft(draft({ expiryBlock: 'a1', expiryMonths: '12' }))).toBe('reqedit.errExpiryBlock')
    const dated = draft({ blocks: [{ id: 'd1', type: 'date', label: 'Rilascio', required: true }], expiryBlock: 'd1', expiryMonths: '12' })
    expect(validateDraft(dated)).toBeNull()
    expect(validateDraft({ ...dated, expiryMonths: '0' })).toBe('reqedit.errMonths')
    expect(validateDraft({ ...dated, expiryMonths: '121' })).toBe('reqedit.errMonths')
    expect(validateDraft({ ...dated, expiryMonths: '' })).toBe('reqedit.errMonths')
  })
  it('allows "unless read" only with a date read from a file', () => {
    expect(validateDraft(draft({ review: 'unless_read' }))).toBe('reqedit.errUnlessRead')
    const read = draft({ blocks: [{ id: 'f', type: 'file', label: 'File', required: true }, { id: 'd', type: 'date', label: 'Data', required: true, read_from_file: true }], review: 'unless_read' })
    expect(validateDraft(read)).toBeNull()
  })
  it('refuses more than twenty blocks', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({ id: `b${i}`, type: 'checkbox' as const, label: 'x', required: false }))
    expect(validateDraft(draft({ blocks: many }))).toBe('reqedit.errTooMany')
  })
})

describe('structureChanged', () => {
  const base = draft()
  it('is false for a new wording only', () => {
    expect(structureChanged(base, { ...base, blocks: [{ ...base.blocks[0], label: 'Altro testo' }], description: 'Nuova descrizione' })).toBe(false)
  })
  it('is true when a block is added, removed, moved, retyped or its mandatory flag changes', () => {
    const two = [...base.blocks, { id: 'z', type: 'file' as const, label: 'File', required: false }]
    expect(structureChanged(base, { ...base, blocks: two })).toBe(true)
    expect(structureChanged({ ...base, blocks: two }, base)).toBe(true)
    expect(structureChanged({ ...base, blocks: two }, { ...base, blocks: [two[1], two[0]] })).toBe(true)
    expect(structureChanged(base, { ...base, blocks: [{ ...base.blocks[0], required: false }] })).toBe(true)
    expect(structureChanged(base, { ...base, blocks: [{ ...base.blocks[0], type: 'date' }] })).toBe(true)
  })
  it('is true when the file to read changes', () => {
    expect(structureChanged(base, { ...base, readingPath: 'club/doc-1700000000000.pdf' })).toBe(true)
  })
})

describe('toSave and fromRequirement', () => {
  const req: Requirement = { id: 'r', slug: null, title: 'T', reason: 'R', group_ids: [1], deadline: '2026-12-01', expiry_block: 'd', expiry_months: 12, review: 'always', visibility: 'board', blocking: false, staff_can_submit: true, active: true, current_version: 2 }
  const ver: RequirementVersion = { requirement_id: 'r', version: 2, description: 'D', reading_path: 'club/doc-1700000000000.pdf', blocks: [{ id: 'd', type: 'date', label: 'Data', required: true }] }
  it('reads a requirement into a draft and writes it back unchanged', () => {
    const d = fromRequirement(req, ver)
    expect(d).toMatchObject({ title: 'T', reason: 'R', groupIds: [1], deadline: '2026-12-01', expiryBlock: 'd', expiryMonths: '12', review: 'always', visibility: 'board', blocking: false, staffCanSubmit: true, readingPath: 'club/doc-1700000000000.pdf', description: 'D' })
    const saved = toSave(d)
    expect(saved.fields).toMatchObject({ title: 'T', reason: 'R', group_ids: [1], deadline: '2026-12-01', expiry_block: 'd', expiry_months: 12, review: 'always', visibility: 'board', blocking: false, staff_can_submit: true })
    expect(saved.content).toEqual({ description: 'D', reading_path: 'club/doc-1700000000000.pdf', blocks: ver.blocks })
  })
  it('sends no end date and no deadline as nulls, and trims the texts', () => {
    const saved = toSave(draft({ title: ' Foto ', reason: ' Per le foto ', expiryBlock: '', expiryMonths: '', deadline: '' }))
    expect(saved.fields).toMatchObject({ title: 'Foto', reason: 'Per le foto', expiry_block: null, expiry_months: null, deadline: null })
    expect(saved.content.reading_path).toBeNull()
  })
})

describe('presetDraft', () => {
  it('gives starting points that are valid', () => {
    for (const kind of ['consent', 'read', 'upload'] as const) {
      const d = presetDraft(kind)
      d.title = 'Titolo'
      d.reason = 'Motivo'
      expect(validateDraft(d)).toBeNull()
    }
    expect(presetDraft('upload').review).toBe('always')
    expect(presetDraft('read').blocks.some((b) => b.type === 'checkbox' && b.required)).toBe(true)
  })
})
