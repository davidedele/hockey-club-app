import type { MessageKey } from '../i18n'

export interface Milestone {
  kind: string
  level: number
  reached_at: string
}

const KINDS = ['goals', 'assists', 'games', 'trainings', 'streak'] as const

// The text key of a milestone and its value: level 1 of goals, assists and games has a text of its own.
export function milestoneKey(m: Pick<Milestone, 'kind' | 'level'>): { key: MessageKey; n: string } | null {
  if (!(KINDS as readonly string[]).includes(m.kind)) return null
  const first = m.level === 1 && m.kind !== 'trainings' && m.kind !== 'streak'
  return { key: (first ? `milestone.${m.kind}First` : `milestone.${m.kind}`) as MessageKey, n: String(m.level) }
}
