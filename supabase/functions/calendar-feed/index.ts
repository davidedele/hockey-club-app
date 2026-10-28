// The private calendar feed. A phone calendar subscribes to
// https://<project>.supabase.co/functions/v1/calendar-feed?t=<token>
// and reads it again every so often. There is no login: the secret token in the link says who is
// asking, and the database returns only the events that person can see. Deploy with "Verify JWT" off.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { buildFeed, type FeedEvent } from './ics.ts'

const headers = { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'private, max-age=300' }

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Metodo non permesso', { status: 405, headers })
  const token = new URL(req.url).searchParams.get('t') ?? ''
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response('Link non valido', { status: 404, headers })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data, error } = await admin.rpc('calendar_events', { p_token: token })
  if (error) return new Response('Errore, riprova più tardi', { status: 500, headers })

  const events = (data ?? []) as FeedEvent[]
  // A valid token with no events still gives an empty calendar; an unknown token gives an error.
  if (events.length === 0) {
    const { data: known } = await admin.from('calendar_tokens').select('user_id').eq('token', token).maybeSingle()
    if (!known) return new Response('Link non valido', { status: 404, headers })
  }
  return new Response(req.method === 'HEAD' ? null : buildFeed(events), {
    status: 200,
    headers: { ...headers, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="calendario.ics"' },
  })
})
