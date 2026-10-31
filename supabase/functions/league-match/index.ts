// The details of one league game (line-ups, goals, penalties), read from the league website when a
// member opens it. Nothing is stored: the page is read, turned into data and handed back.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { DOMParser } from 'npm:linkedom@0.18.5'
import { readMatch } from './match.ts'

const SITE = 'https://www.legahockeylibertas.it'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: member } = await caller.rpc('is_member')
  if (member !== true) return json({ error: 'forbidden' }, 403)

  const body = await req.json().catch(() => ({}))
  const id = Number(body?.id)
  if (!Number.isInteger(id) || id <= 0 || id > 10_000_000) return json({ error: 'invalid_match' }, 400)

  try {
    const res = await fetch(`${SITE}/matches/${id}`, { headers: { 'User-Agent': 'App del club Sgularat Milano (dettaglio partita)' } })
    if (res.status === 404) return json({ error: 'not_found' }, 404)
    if (!res.ok) throw new Error(`risposta ${res.status}`)
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html') as unknown as Document
    return json(readMatch(doc, id))
  } catch (e) {
    return json({ error: 'league_unreachable', message: String(e) }, 502)
  }
})
