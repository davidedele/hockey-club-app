import { supabase } from './supabase'
import type { LineupSlot } from './types'

// Offline use (V11, decision 137). The rule of what is kept on the phone:
//   1. Only what the signed in person may read through the database rules, and only this: the events that start in the
//      next 28 days (and those that started less than 3 hours ago), at most 40; for them the groups, the person's own
//      answer, the line-up (names and shirt numbers of the people in it), and the plan (the notes, the titles of the
//      drills and their minutes).
//   2. Never kept: contacts (telephone, email), documents and certificates, ratings, votes, messages, files, the
//      other pages of the app, anything of other people beyond the names in a line-up.
//   3. One copy for one person. It is renewed at most every 30 minutes while the app is open and online.
//   4. It is deleted when the person signs out, when the session ends, when the profile is removed, when another
//      person signs in on the device, and when it is older than 28 days.
//   5. It is shown read only, on the page "Senza connessione", with the note "Dati non aggiornati" and the time it was saved.
// It lives in the Cache Storage of the browser (a cache of its own that the service worker also knows how to delete).

export const OFFLINE_CACHE = 'offline-data-v1'
const KEY = '/offline-copy.json'
export const WINDOW_DAYS = 28
export const PAST_HOURS = 3
export const MAX_EVENTS = 40
export const MAX_AGE_DAYS = 28
export const RENEW_MINUTES = 30

export interface OfflineEvent {
  id: string
  type: 'training' | 'game'
  title: string
  starts_at: string
  ends_at: string
  meetup_at: string | null
  venue: string | null
  opponent: string | null
  home_away: 'home' | 'away' | null
  cancelled: boolean
  group_ids: number[]
  answer: 'present' | 'absent' | null
}

export interface OfflineLineup {
  event_id: string
  slot: LineupSlot
  unit: number
  name: string
  jersey_number: number | null
}

export interface OfflinePlan {
  event_id: string
  notes: string | null
  drills: { step: number; title: string; minutes: number | null }[]
}

export interface OfflineCopy {
  user_id: string
  saved_at: string
  events: OfflineEvent[]
  lineups: OfflineLineup[]
  plans: OfflinePlan[]
}

type Row = Record<string, unknown>

// The copy from what the database answered. Pure, so the rule can be tested: it keeps only the listed fields, orders
// the events by start and drops lines and plans of events that are not in the copy.
export function buildCopy(userId: string, now: Date, raw: { events: Row[]; groups: Row[]; answers: Row[]; lineups: Row[]; plans: Row[]; planDrills: Row[] }): OfflineCopy {
  const from = now.getTime() - PAST_HOURS * 3600_000
  const to = now.getTime() + WINDOW_DAYS * 86_400_000
  const events = raw.events
    .filter((e) => typeof e.starts_at === 'string' && Date.parse(e.starts_at as string) >= from && Date.parse(e.starts_at as string) <= to)
    .sort((a, b) => Date.parse(a.starts_at as string) - Date.parse(b.starts_at as string))
    .slice(0, MAX_EVENTS)
  const ids = new Set(events.map((e) => e.id as string))
  const answers = new Map(raw.answers.filter((a) => ids.has(a.event_id as string)).map((a) => [a.event_id as string, a.answer as 'present' | 'absent']))
  return {
    user_id: userId,
    saved_at: now.toISOString(),
    events: events.map((e) => ({
      id: e.id as string,
      type: e.type as 'training' | 'game',
      title: String(e.title ?? ''),
      starts_at: e.starts_at as string,
      ends_at: e.ends_at as string,
      meetup_at: (e.meetup_at as string | null) ?? null,
      venue: (e.venue as string | null) ?? null,
      opponent: (e.opponent as string | null) ?? null,
      home_away: (e.home_away as 'home' | 'away' | null) ?? null,
      cancelled: e.cancelled_at != null,
      group_ids: raw.groups.filter((g) => g.event_id === e.id).map((g) => Number(g.group_id)),
      answer: answers.get(e.id as string) ?? null,
    })),
    lineups: raw.lineups
      .filter((l) => ids.has(l.event_id as string))
      .map((l) => {
        const p = (l.profiles ?? {}) as Row
        return {
          event_id: l.event_id as string,
          slot: l.slot as LineupSlot,
          unit: Number(l.unit),
          name: `${String(p.last_name ?? '')} ${String(p.first_name ?? '')}`.trim(),
          jersey_number: (p.jersey_number as number | null) ?? null,
        }
      }),
    plans: raw.plans
      .filter((p) => ids.has(p.event_id as string))
      .map((p) => ({
        event_id: p.event_id as string,
        notes: (p.notes as string | null) ?? null,
        drills: raw.planDrills
          .filter((d) => d.event_id === p.event_id)
          .map((d) => ({ step: Number(d.step), title: String(((d.drills ?? {}) as Row).title ?? ''), minutes: (d.minutes as number | null) ?? null }))
          .sort((a, b) => a.step - b.step),
      })),
  }
}

// Is a copy still good for this person at this time? Not for another person, not when it is old or from the future.
export function usable(copy: OfflineCopy | null, userId: string | undefined, now: Date): copy is OfflineCopy {
  if (!copy || !userId || copy.user_id !== userId) return false
  const age = now.getTime() - Date.parse(copy.saved_at)
  return Number.isFinite(age) && age >= -5 * 60_000 && age <= MAX_AGE_DAYS * 86_400_000
}

export const needsRenewal = (copy: OfflineCopy | null, userId: string, now: Date) =>
  !usable(copy, userId, now) || now.getTime() - Date.parse(copy!.saved_at) > RENEW_MINUTES * 60_000

const hasCache = () => typeof caches !== 'undefined'

export async function readCopy(): Promise<OfflineCopy | null> {
  if (!hasCache()) return null
  try {
    const res = await (await caches.open(OFFLINE_CACHE)).match(KEY)
    return res ? ((await res.json()) as OfflineCopy) : null
  } catch {
    return null
  }
}

async function writeCopy(copy: OfflineCopy) {
  if (!hasCache()) return
  const cache = await caches.open(OFFLINE_CACHE)
  await cache.put(KEY, new Response(JSON.stringify(copy), { headers: { 'content-type': 'application/json' } }))
}

// Deletes everything kept, here and through the service worker.
export async function purgeOfflineCopy(): Promise<void> {
  try {
    if (hasCache()) await caches.delete(OFFLINE_CACHE)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      reg?.active?.postMessage({ type: 'purge-offline' })
    }
  } catch {
    // Nothing more can be done from here; the copy is also refused when it is another person's or too old.
  }
}

let running = false

// Takes a fresh copy for this person when the old one is missing, old or another person's. Silent on any failure.
export async function renewOfflineCopy(userId: string, force = false): Promise<void> {
  if (running || typeof navigator === 'undefined' || navigator.onLine === false) return
  const now = new Date()
  const current = await readCopy()
  if (current && current.user_id !== userId) await purgeOfflineCopy()
  else if (!force && !needsRenewal(current, userId, now)) return
  running = true
  try {
    const from = new Date(now.getTime() - PAST_HOURS * 3600_000).toISOString()
    const to = new Date(now.getTime() + WINDOW_DAYS * 86_400_000).toISOString()
    const e = await supabase
      .from('events')
      .select('id, type, title, starts_at, ends_at, meetup_at, venue, opponent, home_away, cancelled_at')
      .gte('starts_at', from).lte('starts_at', to).order('starts_at').limit(MAX_EVENTS)
    if (e.error) return
    const events = (e.data ?? []) as Row[]
    const ids = events.map((x) => x.id as string)
    if (ids.length === 0) {
      await writeCopy(buildCopy(userId, now, { events: [], groups: [], answers: [], lineups: [], plans: [], planDrills: [] }))
      return
    }
    const [g, a, l, p, d] = await Promise.all([
      supabase.from('event_groups').select('event_id, group_id').in('event_id', ids),
      supabase.from('attendance_answers').select('event_id, answer').eq('user_id', userId).in('event_id', ids),
      supabase.from('event_lineup').select('event_id, slot, unit, profiles:user_id(first_name, last_name, jersey_number)').in('event_id', ids),
      supabase.from('event_plan').select('event_id, notes').in('event_id', ids),
      supabase.from('event_plan_drills').select('event_id, step, minutes, drills:drill_id(title)').in('event_id', ids),
    ])
    if (g.error || a.error || l.error || p.error || d.error) return
    await writeCopy(buildCopy(userId, now, {
      events, groups: (g.data ?? []) as Row[], answers: (a.data ?? []) as Row[], lineups: (l.data ?? []) as Row[],
      plans: (p.data ?? []) as Row[], planDrills: (d.data ?? []) as Row[],
    }))
  } catch {
    // Offline or refused: the old copy stays until it is too old.
  } finally {
    running = false
  }
}
