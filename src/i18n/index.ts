import it from './it.json'

// One flat file per language. To add English later, add en.json and pick it here.
const messages: Record<string, string> = it

export type MessageKey = keyof typeof it

export function t(key: MessageKey, values: Record<string, string> = {}): string {
  const text = messages[key] ?? key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? '')
}

// Database errors carry a short code in their message. Show the matching Italian text.
export function errorText(error: { message?: string } | null | undefined): string {
  const message = error?.message ?? ''
  for (const code of ['invite_invalid', 'names_required', 'email_not_confirmed', 'forbidden']) {
    if (message.includes(code)) return t(`error.${code}` as MessageKey)
  }
  return t('common.error')
}
