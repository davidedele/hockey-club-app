// Reads the finished league games one by one and stores their goals, assists, penalties and line-ups, for the
// championship statistics. A member's visit starts it; the database decides whether it may run (one reading at a
// time, at least ten minutes apart) and which games are still missing, at most ten per run. Each game page is read
// once. Be polite to the site: the app is named in the user agent and the pages come half a second apart.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { DOMParser } from 'npm:linkedom@0.18.5'
import { readMatch } from './match.ts'

const SITE = 'https://www.legahockeylibertas.it'
const PER_RUN = 10
const PAUSE_MS = 600
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: member } = await caller.rpc('is_member')
  if (member !== true) return json({ error: 'forbidden' }, 403)

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: claimed, error: claimError } = await admin.rpc('league_details_claim')
  if (claimError) return json({ error: claimError.message }, 500)
  if (claimed !== true) return json({ skipped: true })

  let read = 0
  let failed = 0
  try {
    const { data: pending, error } = await admin.rpc('league_details_pending', { p_limit: PER_RUN })
    if (error) throw new Error(error.message)
    const ids = ((pending ?? []) as { match_id: number }[]).map((r) => r.match_id)
    for (const id of ids) {
      if (read + failed > 0) await sleep(PAUSE_MS)
      try {
        const res = await fetch(`${SITE}/matches/${id}`, { headers: { 'User-Agent': 'App del club Sgularat Milano (statistiche del campionato, una lettura per partita)' } })
        if (!res.ok) throw new Error(`risposta ${res.status}`)
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html') as unknown as Document
        const m = readMatch(doc, id)
        const roster = (side: 'home' | 'away') => m[side].roster.flatMap((g) => g.players.map((p) => ({ side, role: g.role, number: p.number, name: p.name })))
        const stored = await admin.rpc('league_store_details', {
          p_match: id,
          p_data: { goals: m.goals, penalties: m.penalties, roster: [...roster('home'), ...roster('away')] },
        })
        if (stored.error) throw new Error(stored.error.message)
        read++
      } catch {
        // One game that cannot be read does not stop the others. It is noted as an empty reading, so that it is asked
        // for again later (three times at most) and does not hold up the games behind it.
        failed++
        await admin.rpc('league_store_details', { p_match: id, p_data: {} })
      }
    }
    await admin.rpc('league_details_finish', { p_message: `${read} partite lette, ${failed} non riuscite` })
    return json({ ok: true, read, failed, left: Math.max(0, ids.length - read) })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await admin.rpc('league_details_finish', { p_message: message })
    return json({ ok: false, error: message }, 502)
  }
})
