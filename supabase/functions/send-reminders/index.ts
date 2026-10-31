// Sends the reminder emails, the announcement emails and the calendar emails (new events and changes). A scheduled job in the database calls this every hour with a shared
// secret; the database says who is due (and stays quiet at night), this function sends one email per
// person through Resend and then tells the database what went out. No login: the secret protects it.
// Deploy with "Verify JWT" off. Secrets needed: REMINDER_SECRET, RESEND_API_KEY, REMINDER_FROM, APP_URL,
// and for push notifications VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (docs/SETUP_PUSH.md).
// Every notification asks the database how to reach the person (push, email, both or nothing).
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { buildAnnouncement } from './announcement.ts'
import { buildCertificate, type CertificateRow } from './certificate.ts'
import { buildEventNotice, type NoticeRow } from './eventnotice.ts'
import { buildReminder, type ReminderEvent } from './reminder.ts'
import { announcementPush, certificatePush, noticePush, reminderPush, type PushMessage } from './push.ts'
import webpush from 'npm:web-push@3.6.7'

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


type Mail = { to: string; subject: string; text: string; html: string }
type Result = 'sent' | 'failed' | 'nothing'

// Push first; email only when the person has no phone set up or chose both. 'nothing' means the person
// chose not to be told, which counts as done so it is not looked at again.
async function deliver(admin: ReturnType<typeof createClient>, userId: string, kind: string, mail: Mail, message: PushMessage, ctx: { apiKey: string; from: string; appUrl: string; push: boolean }): Promise<Result> {
  const route = await admin.rpc('notification_route', { p_user: userId, p_kind: kind })
  const r = ((route.data ?? []) as { push: boolean; email: boolean; subscriptions: { endpoint: string; p256dh: string; auth: string }[] }[])[0]
  if (route.error || !r) return 'failed'
  let ok = false
  let tried = false
  if (r.push && ctx.push) {
    for (const sub of r.subscriptions) {
      tried = true
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ ...message, url: new URL(message.url, ctx.appUrl).toString() }), { TTL: 6 * 3600 })
        ok = true
      } catch (e) {
        // A phone that was removed or revoked the permission: forget it.
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await admin.rpc('push_remove', { p_endpoint: sub.endpoint })
      }
    }
  }
  // Email only when the database says so: no phone set up, or the person chose both.
  if (r.email) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: ctx.from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    })
    await new Promise((resolve) => setTimeout(resolve, 600))
    if (!res.ok) return ok ? 'sent' : 'failed'
    return 'sent'
  }
  // Push only: sent if it reached a phone, tried again next hour if every phone failed, done if there is nothing to do.
  return ok ? 'sent' : tried ? 'failed' : 'nothing'
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

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const pushOn = Boolean(vapidPublic && vapidPrivate)
  if (pushOn) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:info@example.org', vapidPublic!, vapidPrivate!)
  const ctx = { apiKey, from, appUrl, push: pushOn }
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
    const result = await deliver(admin, userId, 'reminder', { to: rows[0].email, ...mail }, reminderPush(rows.map((r) => ({ event_id: r.event_id, title: r.title, starts_at: r.starts_at })), rows.some((r) => r.kind === 'last')), ctx)
    if (result === 'failed') {
      failed++
      continue
    }
    sent++
    for (const kind of ['first', 'last'] as const) {
      const ids = rows.filter((r) => r.kind === kind).map((r) => r.event_id)
      if (ids.length) await admin.rpc('reminders_mark_sent', { p_user: userId, p_events: ids, p_kind: kind })
    }
  }

  // Announcements the writers asked to send by email, one email per announcement and person.
  let announcementsSent = 0
  let announcementsFailed = 0
  const due = await admin.rpc('announcements_due')
  if (!due.error) {
    for (const row of (due.data ?? []) as DueAnnouncement[]) {
      if (sent + failed + announcementsSent + announcementsFailed >= MAX_EMAILS) break
      const mail = buildAnnouncement(row.first_name, row.title, row.body, row.author_name, row.group_names, appUrl)
      const result = await deliver(admin, row.user_id, 'announcement', { to: row.email, ...mail }, announcementPush(), ctx)
      if (result === 'failed') {
        announcementsFailed++
        continue
      }
      announcementsSent++
      await admin.rpc('announcements_mark_sent', { p_user: row.user_id, p_announcements: [row.announcement_id] })
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
        const changeList = rows.filter((r) => r.kind === 'changed').map((r) => ({ title: r.title, what: r.cancelled ? ('cancelled' as const) : ('changed' as const) }))
        const result = await deliver(admin, userId, 'changes', { to: rows[0].email, ...mail }, noticePush(mail.newEvents.length, changeList, rows[0].event_id), ctx)
        if (result === 'failed') {
          noticesFailed++
          continue
        }
        noticesSent++
      }
      // What turned out to be nothing (a change that went back) is marked too, so it is not looked at again.
      await admin.rpc('event_notices_mark_sent', { p_user: userId, p_events: mail.newEvents, p_changes: mail.changes })
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
      const result = await deliver(admin, row.user_id, 'certificate', { to: row.email, ...mail }, certificatePush(), ctx)
      if (result === 'failed') {
        certificatesFailed++
        continue
      }
      certificatesSent++
      await admin.rpc('certificates_mark_sent', { p_user: row.user_id, p_valid_until: row.valid_until, p_stage: row.stage })
    }
  }

  // Only counts are returned and logged, never names or addresses.
  return json({ people: byUser.size, sent, failed, announcements: announcementsSent, announcementsFailed, notices: noticesSent, noticesFailed, certificates: certificatesSent, certificatesFailed })
})
