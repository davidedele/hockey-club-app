// Reads fixtures, results and standings from the Lega Hockey Libertas website and stores them,
// then turns the club's own league matches into events. Members call it from the app; it reads
// the site at most every three hours, unless staff ask for a fresh reading.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { DOMParser } from 'npm:linkedom@0.18.5'
import { pageCount, readChampionships, readMatches, readStandings, type LeagueMatch } from './parse.ts'

const SITE = 'https://www.legahockeylibertas.it'
const MAX_PAGES = 30
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function page(path: string): Promise<Document> {
  const res = await fetch(SITE + path, { headers: { 'User-Agent': 'App del club Sgularat Milano (lettura calendario)' } })
  if (!res.ok) throw new Error(`${path}: risposta ${res.status}`)
  return new DOMParser().parseFromString(await res.text(), 'text/html') as unknown as Document
}

async function allMatches(tab: 'past' | 'future'): Promise<LeagueMatch[]> {
  const first = await page(`/matches?tab=${tab}&page=1`)
  const pages = Math.min(pageCount(first), MAX_PAGES)
  const out = readMatches(first, tab === 'past')
  for (let p = 2; p <= pages; p++) out.push(...readMatches(await page(`/matches?tab=${tab}&page=${p}`), tab === 'past'))
  return out
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: member } = await caller.rpc('is_member')
  if (member !== true) return json({ error: 'forbidden' }, 403)
  const body = await req.json().catch(() => ({}))
  const { data: staff } = await caller.rpc('is_staff')
  const force = body?.force === true && staff === true

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: claimed, error: claimError } = await admin.rpc('league_sync_claim', { p_force: force })
  if (claimError) return json({ error: claimError.message }, 500)
  if (claimed !== true) return json({ skipped: true })

  try {
    const { seasonId, championships } = readChampionships(await page('/classifiche'))
    if (!championships.length) throw new Error('nessun campionato trovato sul sito')
    const byName = new Map(championships.map((c) => [c.name, c.id]))
    const matches = new Map<number, LeagueMatch>()
    for (const m of [...(await allMatches('past')), ...(await allMatches('future'))]) matches.set(m.id, m)

    const c = await admin.from('league_championships').upsert(championships.map((x) => ({ id: x.id, name: x.name, position: x.position })))
    if (c.error) throw new Error(c.error.message)
    const now = new Date().toISOString()
    const rows = [...matches.values()].map((m) => ({
      id: m.id, championship_id: byName.get(m.championship) ?? null, championship: m.championship,
      starts_at: m.startsAt, home: m.home, away: m.away, home_score: m.homeScore, away_score: m.awayScore,
      venue: m.venue, seen_at: now,
    }))
    if (rows.length) {
      const u = await admin.from('league_matches').upsert(rows)
      if (u.error) throw new Error(u.error.message)
    }

    for (const ch of championships) {
      const table = readStandings(await page(`/classifiche?season_id=${seasonId ?? ''}&championship_id=${ch.id}`))
      const d = await admin.from('league_standings').delete().eq('championship_id', ch.id)
      if (d.error) throw new Error(d.error.message)
      if (table.length) {
        const i = await admin.from('league_standings').insert(table.map((r) => ({
          championship_id: ch.id, position: r.position, team: r.team, played: r.played, points: r.points, goal_diff: r.goalDiff,
        })))
        if (i.error) throw new Error(i.error.message)
      }
    }

    const { data: created, error: applyError } = await admin.rpc('apply_league_matches')
    if (applyError) throw new Error(applyError.message)
    await admin.rpc('league_sync_finish', { p_ok: true, p_message: `${rows.length} partite, ${created ?? 0} nuove nel calendario` })
    return json({ ok: true, matches: rows.length, created })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await admin.rpc('league_sync_finish', { p_ok: false, p_message: message })
    return json({ ok: false, error: message }, 502)
  }
})
