// Shared sample backend for interface and interaction checks. Never uses a real account.
export function createMockBackend(fixtures, ME) {
  // 3. The fake backend: tables with simple filters, functions, sign in, storage.
  function filterRows(rows, params, table) {
    let list = rows.slice()
    for (const [key, raw] of params) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(key) || key.includes('.')) continue
      const m = raw.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|is|in)\.(.*)$/)
      if (!m) continue
      const [, not, op, value] = m
      const test = (v) => {
        const s = v === null || v === undefined ? null : String(v)
        switch (op) {
          case 'eq': return s === value
          case 'neq': return s !== value
          case 'gt': return s !== null && s > value
          case 'gte': return s !== null && s >= value
          case 'lt': return s !== null && s < value
          case 'lte': return s !== null && s <= value
          case 'is': return value === 'null' ? s === null : String(v) === value
          case 'in': return value.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(s)
        }
        return true
      }
      list = list.filter((r) => (key in r ? test(r[key]) !== Boolean(not) : true))
    }
    const order = params.get('order')
    if (order) {
      const [col, dir] = order.split(',')[0].split('.')
      list.sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1))
    }
    const limit = Number(params.get('limit'))
    if (limit) list = list.slice(0, limit)
    return embed(list, table, params.get('select') ?? '')
  }
  
  // Embedded rows of a select such as "*, event_groups(group_id)" or "profiles:author_id(first_name)":
  // a child table is found by its "<table>_id" column, a parent table by the named column or "<name>_id".
  const one = (name) => name.replace(/s$/, '')
  function splitTop(text) {
    const parts = []
    let depth = 0
    let current = ''
    for (const ch of text) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) { parts.push(current.trim()); current = '' } else current += ch
    }
    if (current.trim()) parts.push(current.trim())
    return parts
  }
  function embed(rows, table, select) {
    const wanted = splitTop(select).map((part) => part.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/)).filter(Boolean)
    if (!wanted.length) return rows
    const pick = (row, inner) => (row ? Object.fromEntries(inner === '*' ? Object.entries(row) : inner.split(',').map((c) => [c.trim(), row[c.trim()]])) : null)
    return rows.map((row) => {
      const copy = { ...row }
      for (const [, alias, name, inner] of wanted) {
        if (alias) {
          // "profiles:author_id(...)": the output name is the table, the part before "(" is the column that points at it.
          copy[alias] = pick((fixtures.tables[alias] ?? []).find((t) => t.id === row[name]), inner)
          continue
        }
        const target = fixtures.tables[name] ?? []
        const childColumn = `${one(table)}_id`
        if (target[0] && childColumn in target[0]) copy[name] = target.filter((t) => t[childColumn] === row.id).map((t) => pick(t, inner))
        else copy[name] = pick(target.find((t) => t.id === row[name === 'profiles' ? 'user_id' : `${one(name)}_id`]), inner)
      }
      return copy
    })
  }
  
  const eventRequests = []
  const requests = []
  const state = { apiDown: false, noGames: false, failure: null, mutations: false }
  // A page of kind "nogames" is opened with groups that have no game coming up (Fantahockey says so and offers no form).
  async function answer(route) {
    if (state.apiDown) return route.abort('failed')
    const req = route.request()
    const url = new URL(req.url())
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': req.headers()['access-control-request-headers'] ?? 'authorization, apikey, content-type, x-client-info, prefer, accept, range, x-supabase-api-version, accept-profile, content-profile', 'access-control-allow-methods': 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS', 'access-control-expose-headers': 'content-range', ...headers }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return json({})
    const p = url.pathname
    requests.push({ method: req.method(), path: p, body: req.postData() })
    if (state.failure && (typeof state.failure === 'string' ? p.includes(state.failure) : p.includes(state.failure.path) && url.searchParams.has(state.failure.query) && (state.failure.value === undefined || url.searchParams.get(state.failure.query) === state.failure.value))) return json({ message: 'Audit connection failure', code: 'XX000' }, 500)
    const auditSession = () => ({access_token:Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:ME,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]})).toString('base64url')+'.sample',refresh_token:'audit-refresh',token_type:'bearer',expires_in:3600,user:{id:ME,email:fixtures.me.email,aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},factors:fixtures.mockFactors??[]}})
    if (state.mutations && (p === '/auth/v1/token' || /\/auth\/v1\/factors\/[^/]+\/verify$/.test(p))) return json(auditSession())
    if (state.mutations && /\/auth\/v1\/factors\/[^/]+\/challenge$/.test(p)) return json({id:'audit-challenge',expires_at:Math.floor(Date.now()/1000)+300})
    if (state.mutations && p === '/auth/v1/factors' && req.method() === 'POST') {
      fixtures.mockFactors = [{id:'audit-factor',factor_type:'totp',status:'unverified',friendly_name:'Audit'}]
      return json({id:'audit-factor',type:'totp',totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40"/></svg>',secret:'JBSWY3DPEHPK3PXP',uri:'otpauth://totp/Audit?secret=JBSWY3DPEHPK3PXP'}})
    }
    if (state.mutations && p.startsWith('/auth/v1/factors/') && req.method() === 'DELETE') { fixtures.mockFactors=[]; return json({}) }
    if (p.startsWith('/auth/v1/user')) return json({ id: ME, email: fixtures.me.email, aud: 'authenticated', role: 'authenticated', user_metadata: {}, app_metadata: {}, factors: fixtures.mockFactors ?? [] })
    if (p.startsWith('/auth/v1/')) return json({})
    if (p.startsWith('/functions/v1/league-match')) return json(fixtures.match)
    if (p.startsWith('/functions/v1/')) return json({ changed: false })
    if (p.startsWith('/storage/v1/object/sign/')) {
      const body = JSON.parse(req.postData() || '{}')
      if (state.mutations) return body.paths ? json(body.paths.map(path => ({path,signedURL:`/object/sign/sample/${path}?token=audit`,error:null}))) : json({signedURL:`/object/sign/sample/file?token=audit`})
      return json((body.paths ?? []).map((path) => ({ path, signedURL: null, error: 'not found' })))
    }
    if (p.startsWith('/storage/')) {
      if (state.mutations) {
        if (req.method() === 'GET') return route.fulfill({status:200,contentType:'image/png',body:state.imageData})
        return json({Key:p.split('/object/')[1] ?? 'sample/file'})
      }
      return route.fulfill({ status: 404, body: '' })
    }
    if (p.startsWith('/rest/v1/rpc/')) {
      const name = p.split('/').pop()
      const body = JSON.parse(req.postData() || '{}')
      if (['save_event','manage_events','event_scope'].includes(name)) eventRequests.push({ name, body })
      if (name === 'event_scope') {
        const event = fixtures.tables.events.find((e) => e.id === body.p_event_id)
        return json(fixtures.tables.events.filter((e) => body.p_scope === 'one' ? e.id === event?.id : event?.series_id && e.series_id === event.series_id && Date.parse(e.starts_at) > Date.now() && (body.p_scope === 'future' || e.starts_at >= event.starts_at)).sort((a,b) => a.starts_at.localeCompare(b.starts_at)))
      }
      if (state.mutations && name === 'set_player_state') return json(null)
      if (state.mutations && name === 'new_calendar_token') return json('audit-calendar-token-renewed')
      if (state.mutations && ['create_invite','create_team_invite'].includes(name)) return json('audit-invite-token')
      if (name === 'save_event') return json(body.p_event_id ?? fixtures.ids.training)
      if (name === 'manage_events') return json(body.p_expected_count)
      if (state.noGames && (name === 'fanta_next_round' || name === 'fanta_candidates')) return json([])
      return json(fixtures.rpc[name] ?? [])
    }
    if (p.startsWith('/rest/v1/')) {
      const table = p.split('/').pop()
      if (req.method() !== 'GET' && req.method() !== 'HEAD') {
        if (!state.mutations) return json([], req.method() === 'POST' ? 201 : 200)
        const body = JSON.parse(req.postData() || '{}')
        const params = new URLSearchParams(url.searchParams); params.delete('select')
        const rows = fixtures.tables[table] ?? []
        const chosen = filterRows(rows, params, table)
        let changed = []
        if (req.method() === 'PATCH') { for (const row of chosen) Object.assign(row, body); changed = chosen }
        if (req.method() === 'DELETE') { fixtures.tables[table] = rows.filter(row => !chosen.includes(row)); changed = chosen }
        if (req.method() === 'POST') {
          const payload = Array.isArray(body) ? body : [body]
          const keys = (url.searchParams.get('on_conflict') || (rows[0] && 'id' in rows[0] ? 'id' : table === 'rink_prices' ? 'rink_id' : table === 'member_documents' ? 'user_id,kind' : 'user_id')).split(',')
          for (const item of payload) {
            let row = req.headers()['prefer']?.includes('merge-duplicates') ? rows.find(r => keys.every(k => item[k] !== undefined && r[k] === item[k])) : null
            if (row) Object.assign(row,item)
            else {
              row = {...item}
              if (rows[0] && 'id' in rows[0] && row.id === undefined) row.id = typeof rows[0].id === 'number' ? Math.max(...rows.map(r=>r.id))+1 : '99999999-9999-4999-8999-999999999999'
              rows.push(row)
            }
            changed.push(row)
          }
          fixtures.tables[table] = rows
        }
        return json(changed, req.method() === 'POST' ? 201 : 200)
      }
      const rows = filterRows(fixtures.tables[table] ?? [], url.searchParams, table)
      const headers = { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` }
      if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range' }, body: '' })
      if ((req.headers()['accept'] ?? '').includes('vnd.pgrst.object')) {
        return rows.length ? json(rows[0], 200, headers) : json({ code: 'PGRST116', message: 'no rows' }, 406)
      }
      return json(rows, 200, headers)
    }
    return json([])
  }
  
  return { answer, eventRequests, requests, state }
}
