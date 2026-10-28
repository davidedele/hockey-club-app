// Sends the reminder emails. A scheduled job in the database calls this every hour with a shared
// secret; the database says who is due (and stays quiet at night), this function sends one email per
// person through Resend and then tells the database what went out. No login: the secret protects it.
// Deploy with "Verify JWT" off. Secrets needed: REMINDER_SECRET, RESEND_API_KEY, REMINDER_FROM, APP_URL.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { buildReminder, type ReminderEvent } from './reminder.ts'

const MAX_EMAILS = 100

type Due = {
  user_id: string
  email: string
  first_name: string
  kind: 'first' | 'last'
  event_id: string
  title: string
  type: 'training' | 'game'
  starts_at: string
  venue: string | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('REMINDER_SECRET') ?? ''
  if (req.method !== 'POST' || !sameSecret(req.headers.get('x-reminder-secret') ?? '', secret)) {
    return json({ error: 'forbidden' }, 403)
  }
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('REMINDER_FROM')
  const appUrl = Deno.env.get('APP_URL')
  if (!apiKey || !from || !appUrl) return json({ error: 'not configured' }, 500)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.rpc('reminders_due')
  if (error) return json({ error: 'database' }, 500)

  const byUser = new Map<string, Due[]>()
  for (const row of (data ?? []) as Due[]) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row])

  let sent = 0
  let failed = 0
  for (const [userId, rows] of byUser) {
    if (sent + failed >= MAX_EMAILS) break
    const events: ReminderEvent[] = rows.map((r) => ({ title: r.title, type: r.type, starts_at: r.starts_at, venue: r.venue }))
    const mail = buildReminder(rows[0].first_name, events, rows.some((r) => r.kind === 'last'), appUrl)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [rows[0].email], subject: mail.subject, text: mail.text, html: mail.html }),
    })
    if (!res.ok) {
      failed++
      continue
    }
    sent++
    for (const kind of ['first', 'last'] as const) {
      const ids = rows.filter((r) => r.kind === kind).map((r) => r.event_id)
      if (ids.length) await admin.rpc('reminders_mark_sent', { p_user: userId, p_events: ids, p_kind: kind })
    }
    // Resend allows a couple of emails per second on the free plan.
    await new Promise((r) => setTimeout(r, 600))
  }
  // Only counts are returned and logged, never names or addresses.
  return json({ people: byUser.size, sent, failed })
})
