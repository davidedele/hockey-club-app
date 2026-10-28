// Sends the reminder emails, the announcement emails and the calendar emails (new events and changes). A scheduled job in the database calls this every hour with a shared
// secret; the database says who is due (and stays quiet at night), this function sends one email per
// person through Resend and then tells the database what went out. No login: the secret protects it.
// Deploy with "Verify JWT" off. Secrets needed: REMINDER_SECRET, RESEND_API_KEY, REMINDER_FROM, APP_URL.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { buildAnnouncement } from './announcement.ts'
import { buildCertificate, type CertificateRow } from './certificate.ts'
import { buildEventNotice, type NoticeRow } from './eventnotice.ts'
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

type DueAnnouncement = {
  user_id: string
  email: string
  first_name: string
  announcement_id: string
  title: string
  body: string
  author_name: string
  group_names: string
}

type DueNotice = NoticeRow & { user_id: string; email: string; first_name: string }

type DueCertificate = CertificateRow & { user_id: string; email: string; first_name: string }

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

  // Announcements the writers asked to send by email, one email per announcement and person.
  let announcementsSent = 0
  let announcementsFailed = 0
  const due = await admin.rpc('announcements_due')
  if (!due.error) {
    for (const row of (due.data ?? []) as DueAnnouncement[]) {
      if (sent + failed + announcementsSent + announcementsFailed >= MAX_EMAILS) break
      const mail = buildAnnouncement(row.first_name, row.title, row.body, row.author_name, row.group_names, appUrl)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [row.email], subject: mail.subject, text: mail.text, html: mail.html }),
      })
      if (!res.ok) {
        announcementsFailed++
        continue
      }
      announcementsSent++
      await admin.rpc('announcements_mark_sent', { p_user: row.user_id, p_announcements: [row.announcement_id] })
      await new Promise((r) => setTimeout(r, 600))
    }
  }

  // New events and changes to events, one email per person.
  let noticesSent = 0
  let noticesFailed = 0
  const notices = await admin.rpc('event_notices_due')
  if (!notices.error) {
    const byPerson = new Map<string, DueNotice[]>()
    for (const row of (notices.data ?? []) as DueNotice[]) byPerson.set(row.user_id, [...(byPerson.get(row.user_id) ?? []), row])
    for (const [userId, rows] of byPerson) {
      if (sent + failed + announcementsSent + announcementsFailed + noticesSent + noticesFailed >= MAX_EMAILS) break
      const mail = buildEventNotice(rows[0].first_name, rows, appUrl)
      if (!mail.empty) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [rows[0].email], subject: mail.subject, text: mail.text, html: mail.html }),
        })
        if (!res.ok) {
          noticesFailed++
          continue
        }
        noticesSent++
      }
      // What turned out to be nothing (a change that went back) is marked too, so it is not looked at again.
      await admin.rpc('event_notices_mark_sent', { p_user: userId, p_events: mail.newEvents, p_changes: mail.changes })
      if (!mail.empty) await new Promise((r) => setTimeout(r, 600))
    }
  }
  // The medical certificate running out, at five moments before and after the date.
  let certificatesSent = 0
  let certificatesFailed = 0
  const certificates = await admin.rpc('certificates_due')
  if (!certificates.error) {
    for (const row of (certificates.data ?? []) as DueCertificate[]) {
      if (sent + failed + announcementsSent + announcementsFailed + noticesSent + noticesFailed
          + certificatesSent + certificatesFailed >= MAX_EMAILS) break
      const mail = buildCertificate(row.first_name, row, appUrl)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [row.email], subject: mail.subject, text: mail.text, html: mail.html }),
      })
      if (!res.ok) {
        certificatesFailed++
        continue
      }
      certificatesSent++
      await admin.rpc('certificates_mark_sent', { p_user: row.user_id, p_valid_until: row.valid_until, p_stage: row.stage })
      await new Promise((r) => setTimeout(r, 600))
    }
  }

  // Only counts are returned and logged, never names or addresses.
  return json({ people: byUser.size, sent, failed, announcements: announcementsSent, announcementsFailed, notices: noticesSent, noticesFailed, certificates: certificatesSent, certificatesFailed })
})
