import it from './it.json'

// One flat file per language. To add English later, add en.json and pick it here.
const messages: Record<string, string> = it

export type MessageKey = keyof typeof it

export function t(key: MessageKey, values: Record<string, string> = {}): string {
  const text = messages[key] ?? key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '')
}

const CODES = [
  'invite_invalid',
  'team_invite_invalid',
  'names_required',
  'email_not_confirmed',
  'forbidden',
  'last_board_member',
  'groups_required',
  'repeat_only_training',
  'repeat_invalid',
  'event_over',
  'event_needs_group',
  'over_email_send_rate_limit',
  'email_address_invalid',
  'weak_password',
  'user_already_exists',
  'signup_disabled',
  'not_a_game',
  'not_in_game',
  'stats_invalid',
  'game_not_over',
  'already_voted',
  'mvp_invalid',
  'rating_invalid',
  'period_past',
  'event_cancelled',
  'league_event',
  'event_ended',
  'scope_invalid',
]

// Database errors carry a short code in their message, and sign in errors in their code.
// Show the matching Italian text. While developing, an unknown error also shows its raw text.
export function errorText(error: { message?: string; code?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  for (const code of CODES) {
    if (text.includes(code)) return t(`error.${code}` as MessageKey)
  }
  if (/game_stats.*check|check.*game_stats/.test(text)) return t('error.stats_check')
  if (/23514|violates check constraint/.test(text)) return t('error.check_violation')
  const raw = import.meta.env?.DEV && text.trim() ? ` (${text.trim()})` : ''
  return t('common.error') + raw
}
