import en from './en.json'
import it from './it.json'

export const LANGUAGES = ['it', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

// One flat file per language. Italian is the club's own language; English is there for anybody who
// needs it. The choice is kept in this browser, so it follows the person on this device only.
const FILES: Record<Language, Record<string, string>> = { it, en }
const KEY = 'language'

function saved(): Language | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'it' || value === 'en' ? value : null
  } catch {
    return null
  }
}

// Italian is what the club speaks, so that is what everybody gets until they choose otherwise.
export function currentLanguage(): Language {
  return saved() ?? 'it'
}

// Changing the language loads the page again, which is the simplest way to redraw every text.
export function chooseLanguage(choice: Language): void {
  try {
    localStorage.setItem(KEY, choice)
  } catch {
    // Private browsing refuses to remember. The choice then lasts until the page is left.
  }
  window.location.reload()
}

const language = currentLanguage()
const messages: Record<string, string> = FILES[language]

// Days, months, clock times and numbers follow the chosen language too.
export const locale = language === 'en' ? 'en-GB' : 'it-IT'
if (typeof document !== 'undefined') document.documentElement.lang = language

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
  'message_empty',
  'message_too_long',
  'not_in_event',
  'league_event',
  'event_ended',
  'scope_invalid',
  'player_not_in_event',
  'plan_full',
]

// Database errors carry a short code in their message, and sign in errors in their code.
// Show the matching text. While developing, an unknown error also shows its raw text.
export function errorText(error: { message?: string; code?: string } | null | undefined): string {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`
  for (const code of CODES) {
    if (text.includes(code)) return t(`error.${code}` as MessageKey)
  }
  if (/profiles_names_no_digits/.test(text)) return t('error.name_digits')
  if (/game_stats.*check|check.*game_stats/.test(text)) return t('error.stats_check')
  if (/23514|violates check constraint/.test(text)) return t('error.check_violation')
  const raw = import.meta.env?.DEV && text.trim() ? ` (${text.trim()})` : ''
  return t('common.error') + raw
}
