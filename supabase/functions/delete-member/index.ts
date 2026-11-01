// Deletes a member's data (decision 96). Only the board can call it, signed in as themselves: the call
// is passed to the database function delete_member_data with the caller's own login, so the database
// decides who may do it. Then, with the service key that never leaves this server, the member's files
// in storage are removed and the sign in account is disabled, so the person can no longer sign in and the
// email address is free again. The account is NOT deleted: the profile is tied to it, and the club history
// (answers, attendance, game numbers, ratings, votes, line-ups, messages) is tied to the profile, so
// deleting the account would erase that history (migration 0042 refuses such a delete). The sign up data left in
// the account (names, original email) is emptied by the database function scrub_deleted_account (migration 0051).
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
  // Disable the account: a random password nobody knows, an email that cannot receive anything (and frees
  // the real address), no sign up data (the names typed at sign up live in user_metadata), no two step
  // factors, and a ban for about a hundred years. Safe to run again after a half finished deletion.
  const random = crypto.getRandomValues(new Uint8Array(32))
  const password = Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('')
  const factors = await admin.auth.admin.mfa.listFactors({ userId: target })
  if (factors.error && !/not found/i.test(factors.error.message)) return json({ error: 'account' }, 500)
  for (const factor of factors.data?.factors ?? []) {
    const removed = await admin.auth.admin.mfa.deleteFactor({ userId: target, id: factor.id })
    if (removed.error) return json({ error: 'account' }, 500)
  }
  // Supabase merges user_metadata, so {} clears nothing: every key that exists is sent as null (second layer).
  const existing = await admin.auth.admin.getUserById(target)
  if (existing.error && !/not found/i.test(existing.error.message)) return json({ error: 'account' }, 500)
  const wipe = Object.fromEntries(Object.keys(existing.data?.user?.user_metadata ?? {}).map((key) => [key, null]))
  const account = await admin.auth.admin.updateUserById(target, {
    email: `deleted-${target}@deleted.invalid`,
    email_confirm: true,
    password,
    user_metadata: wipe,
    ban_duration: '876000h',
  })
  if (account.error && !/not found/i.test(account.error.message)) return json({ error: 'account' }, 500)
  // The reliable layer: the database function empties raw_user_meta_data and keeps only sub, the unusable email
  // and email_verified in auth.identities, for this person only (migration 0051). It runs last, after the update
  // above, so nothing rewrites the data afterwards. The caller's own login is used: only the board may run it.
  const scrubbed = await asCaller.rpc('scrub_deleted_account', { p_user: target })
  if (scrubbed.error) return json({ error: 'account' }, 500)
  return json({ ok: true })
})
