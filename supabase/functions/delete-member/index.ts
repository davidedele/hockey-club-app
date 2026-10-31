// Deletes a member's data (decision 96). Only the board can call it, signed in as themselves: the call
// is passed to the database function delete_member_data with the caller's own login, so the database
// decides who may do it. Then, with the service key that never leaves this server, the member's files
// in storage and the sign in account are removed, so the person can no longer sign in and the email
// address is free again.
// Deploy with "Verify JWT" on. Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKETS = ['documents', 'avatars']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return json({ error: 'forbidden' }, 405)
  const auth = req.headers.get('Authorization') ?? ''
  const body = (await req.json().catch(() => ({}))) as { user_id?: string }
  const target = body.user_id ?? ''
  if (!auth || !UUID.test(target)) return json({ error: 'bad_request' }, 400)

  // The caller's own login: the database checks that this person is on the board.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const done = await asCaller.rpc('delete_member_data', { p_user: target })
  if (done.error) {
    const text = `${done.error.message} ${done.error.code}`
    // A second try after a half finished deletion carries on with the cleaning, for the board only.
    if (!/already_deleted/.test(text)) {
      const code = /last_board|cannot_delete_self|not_found/.exec(text)?.[0] ?? (done.error.code === '42501' ? 'forbidden' : 'database')
      return json({ error: code }, code === 'forbidden' ? 403 : 400)
    }
    const isBoard = await asCaller.rpc('is_board')
    if (isBoard.error || isBoard.data !== true) return json({ error: 'forbidden' }, 403)
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // Every file in the person's folder of each private bucket.
  for (const bucket of BUCKETS) {
    const listed = await admin.storage.from(bucket).list(target, { limit: 1000 })
    if (listed.error) return json({ error: 'storage' }, 500)
    const paths = (listed.data ?? []).map((f) => `${target}/${f.name}`)
    if (paths.length) {
      const removed = await admin.storage.from(bucket).remove(paths)
      if (removed.error) return json({ error: 'storage' }, 500)
    }
  }
  const account = await admin.auth.admin.deleteUser(target)
  if (account.error && !/not found/i.test(account.error.message)) return json({ error: 'account' }, 500)
  return json({ ok: true })
})
