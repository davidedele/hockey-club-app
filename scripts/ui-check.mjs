// Interface check. Builds the app against a fake backend, opens every page at phone and computer
// width with sample data, saves screenshots and fails on the rules of docs/UI_RULES.md that a
// browser can measure. No real account and no network: every request to the backend is answered
// here from scripts/ui-check/fixtures.mjs.
//
// Run: node scripts/ui-check.mjs            (all pages)
//      node scripts/ui-check.mjs settings   (only routes whose name contains "settings")
// Needs Playwright with Chromium: npm i --no-save playwright && npx playwright install chromium
//
// Options, as environment variables:
//   UI_CHECK_WEBKIT=1   use WebKit (the iPhone engine) instead of Chromium. Needs: npx playwright install webkit
//   UI_CHECK_DARK=1     dark colour scheme
//   UI_CHECK_LARGE=1    larger text size (the root font size is raised by a third)
//   UI_CHECK_WIDTHS=375,1280   other window widths (default 320, 375, 390, 430, 768, 1280)

import { execSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtures, ME } from './ui-check/fixtures.mjs'

const require = createRequire(import.meta.url)
const playwright = require('playwright')
const engine = process.env.UI_CHECK_WEBKIT ? playwright.webkit : playwright.chromium
const DARK = Boolean(process.env.UI_CHECK_DARK)
const LARGE = Boolean(process.env.UI_CHECK_LARGE)
const WIDTHS = (process.env.UI_CHECK_WIDTHS ?? '320,375,390,430,768,1280').split(',').map(Number)
const contextOptions = { serviceWorkers: 'block', locale: 'it-IT', timezoneId: 'Europe/Rome', colorScheme: DARK ? 'dark' : 'light' }
const largeText = (large) => { if (large) document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '133%' }) }

const root = resolve(fileURLToPath(import.meta.url), '../..')
const out = join(root, 'ui-check')
const tag = `${process.env.UI_CHECK_WEBKIT ? '-webkit' : ''}${DARK ? '-dark' : ''}${LARGE ? '-large' : ''}`
const dist = join(out, 'dist')
const API = 'http://mock.supabase.test'
const only = process.argv[2] ?? ''

// 1. Build a copy of the app that talks to the fake backend.
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
execSync(`npx vite build --outDir ${dist} --emptyOutDir`, {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: API, VITE_SUPABASE_ANON_KEY: 'sample' },
})

// 2. Serve it, with every unknown path falling back to the app.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = join(dist, path)
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const origin = `http://127.0.0.1:${server.address().port}`

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

async function answer(route) {
  const req = route.request()
  const url = new URL(req.url())
  const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', ...headers }, body: JSON.stringify(body) })
  if (req.method() === 'OPTIONS') return json({})
  const p = url.pathname
  if (p.startsWith('/auth/v1/user')) return json({ id: ME, email: fixtures.me.email, aud: 'authenticated', role: 'authenticated' })
  if (p.startsWith('/auth/v1/')) return json({})
  if (p.startsWith('/functions/v1/league-match')) return json(fixtures.match)
  if (p.startsWith('/functions/v1/')) return json({ changed: false })
  if (p.startsWith('/storage/v1/object/sign/')) {
    const body = JSON.parse(req.postData() || '{}')
    return json((body.paths ?? []).map((path) => ({ path, signedURL: null, error: 'not found' })))
  }
  if (p.startsWith('/storage/')) return route.fulfill({ status: 404, body: '' })
  if (p.startsWith('/rest/v1/rpc/')) {
    const name = p.split('/').pop()
    return json(fixtures.rpc[name] ?? [])
  }
  if (p.startsWith('/rest/v1/')) {
    const table = p.split('/').pop()
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return json([], req.method() === 'POST' ? 201 : 200)
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

// 4. The pages. "sub" pages must offer a way back; "auth" pages are outside the app frame.
const { training, game, member } = fixtures.ids
const ROUTES = [
  ['home', '/'], ['events', '/events'], ['members', '/members'], ['championship', '/campionato'], ['league-match', '/campionato/partita/501', 'sub'], ['stats', '/stats'],
  ['attendance', '/attendance'], ['attendance-events', '/attendance?tab=events'],
  ['event-training', `/events/${training}`, 'sub'], ['event-game', `/events/${game}`, 'sub'],
  ['event-new', '/events/new', 'sub'], ['attendance-missing', '/attendance?tab=missing'],
  ['announcements', '/announcements', 'sub'], ['drills', '/drills'],
  ['member-edit', `/members/${member}`, 'sub'], ['member-documents', `/members/${member}/documents`, 'sub'],
  ['profile', '/profile'], ['profile-info', '/profile/info', 'sub'], ['profile-documents', '/documents', 'sub'],
  ['profile-absences', '/profile/absences', 'sub'], ['profile-notifications', '/profile/notifications', 'sub'],
  ['profile-calendar', '/profile/calendar', 'sub'], ['profile-app', '/profile/app', 'sub'],
  ['settings', '/settings'], ['settings-club', '/settings/club', 'sub'], ['settings-groups', '/settings/groups', 'sub'],
  ['settings-rinks', '/settings/rinks', 'sub'], ['settings-ice', '/settings/ice', 'sub'], ['settings-invites', '/settings/invites', 'sub'],
  ['login', '/login', 'auth'],
].filter(([name]) => name.includes(only))

// 5. What is measured on every page, in the page itself.
function measure() {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40)
  const doc = document.documentElement
  const problems = []
  if (doc.scrollWidth > doc.clientWidth + 1) problems.push(`sideways scroll: page is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px window`)
  // Controls: 44 pixels tall. Links inside running text are exempt.
  for (const el of document.querySelectorAll('main button, main input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=color]), main select, main summary, main [role=button], .side button, .top button, .top a, .side select')) {
    if (!visible(el) || el.closest('.sr-only')) continue
    const h = el.getBoundingClientRect().height
    if (h < 43.5) problems.push(`control under 44px: ${el.tagName.toLowerCase()} "${name(el)}" is ${Math.round(h)}px`)
  }
  // A link inside a sentence is exempt; a link that is the whole paragraph or the whole cell is a control. The breadcrumb is measured too.
  for (const el of document.querySelectorAll('main a, .crumbs a')) {
    if (!visible(el)) continue
    const host = el.closest('p, li > span, td, .hint')
    if (host && host.textContent.trim() !== el.textContent.trim()) continue
    // An inline link with text around it, in a heading or a card, is part of a sentence. A link that stands alone, and every breadcrumb step, is a control.
    const alone = !el.parentElement || el.parentElement.textContent.trim() === el.textContent.trim()
    if (getComputedStyle(el).display === 'inline' && !alone && !el.closest('.crumbs')) continue
    const h = el.getBoundingClientRect().height
    if (h < 43.5) problems.push(`link under 44px: "${name(el)}" is ${Math.round(h)}px`)
  }
  // A select must look like a text field, not the small native control of each system.
  for (const el of document.querySelectorAll('select')) {
    if (visible(el) && getComputedStyle(el).appearance !== 'none') problems.push(`select with the native look: "${name(el)}"`)
  }
  // Text: translation keys shown as text, labels with a colon at the end.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent.trim()
    if (/^[a-z][a-zA-Z]*\.[a-zA-Z.]+$/.test(t) && !/^[a-z0-9.-]+\.(it|com|lol|test)$/.test(t)) problems.push(`translation key on screen: ${t}`)
  }
  for (const el of document.querySelectorAll('main label, main legend, main th')) {
    const own = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim()
    if (own.endsWith(':')) problems.push(`label ends with a colon: "${own}"`)
  }
  // Names with digits in the people lists.
  for (const el of document.querySelectorAll('.person-name, [data-person-name]')) if (/\d/.test(el.textContent)) problems.push(`name with digits: ${el.textContent.trim()}`)
  const frame = document.querySelector('main > .page, main > div > .page, #root > .page')
  const back = document.querySelector('[data-back]')
  const shellNav = document.querySelector('.shell-nav')
  return {
    problems,
    frameLeft: frame ? Math.round(frame.getBoundingClientRect().left) : null,
    frameWidth: frame ? Math.round(frame.getBoundingClientRect().width) : null,
    hasBack: Boolean(back && visible(back)),
    hasShellNav: Boolean(shellNav && visible(shellNav)),
    hasCrumbs: Boolean(document.querySelector('.crumbs') && visible(document.querySelector('.crumbs'))),
    title: document.querySelector('h1')?.textContent.trim() ?? null,
  }
}

// 6. Visit everything at both widths.
const browser = await engine.launch()
const report = []
for (const width of WIDTHS) {
  mkdirSync(join(out, `${width}${tag}`), { recursive: true })
  const context = await browser.newContext({ viewport: { width, height: width < 700 ? 812 : 800 }, ...contextOptions })
  await context.route(`${API}/**`, answer)
  await context.addInitScript(largeText, LARGE)
  await context.addInitScript(([me, email]) => {
    if (location.pathname === '/login') return
    const session = { access_token: 'sample', refresh_token: 'sample', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: me, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }
    localStorage.setItem('sb-mock-auth-token', JSON.stringify(session))
  }, [ME, fixtures.me.email])
  // The login page is opened in a fresh context with no saved session. In the shared one the sign in
  // stored by the other pages would send it straight to the home page.
  const fresh = await browser.newContext({ viewport: { width, height: width < 700 ? 812 : 800 }, ...contextOptions })
  await fresh.route(`${API}/**`, answer)
  await fresh.addInitScript(largeText, LARGE)
  for (const [name, path, kind] of ROUTES) {
    const page = await (kind === 'auth' ? fresh : context).newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e.stack || e.message).split('\n').slice(0, 3).join(' | ')))
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|status of 40[46]/.test(m.text())) errors.push(m.text()) })
    await page.goto(origin + path)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
    const m = await page.evaluate(measure)
    if (kind === 'auth') {
      const shown = await page.evaluate(() => ({ path: location.pathname, password: Boolean(document.querySelector('input[type=password]')), email: Boolean(document.querySelector('input[type=email]')) }))
      if (shown.path !== path || !shown.password || !shown.email) m.problems.push(`the page does not show the sign in form: opened ${path}, ended on ${shown.path}, email field ${shown.email}, password field ${shown.password}`)
    }
    // The whole page in one picture. The window is made as tall as the page, so a bar fixed to the
    // bottom of the window (the phone tab bar) stays at the bottom instead of cutting across the middle.
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.setViewportSize({ width, height: Math.min(Math.max(height, 800), 6000) })
    await page.screenshot({ path: join(out, `${width}${tag}`, `${name}.png`) })
    report.push({ width, name, path, kind: kind ?? 'page', ...m, errors })
    await page.close()
  }
  await fresh.close()
  await context.close()
}
// 6b. Interactions that a screenshot cannot prove, at computer width.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...contextOptions })
  await context.route(`${API}/**`, answer)
  await context.addInitScript(largeText, LARGE)
  await context.addInitScript(([me, email]) => {
    const session = { access_token: 'sample', refresh_token: 'sample', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: me, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }
    localStorage.setItem('sb-mock-auth-token', JSON.stringify(session))
  }, [ME, fixtures.me.email])
  const page = await context.newPage()
  const problems = []
  const check = (ok, text) => { if (!ok) problems.push(text) }
  const settle = async (path) => { await page.goto(origin + path); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(300) }
  const active = () => page.evaluate(() => ({ role: document.activeElement?.getAttribute('role'), checked: document.activeElement?.getAttribute('aria-checked'), text: document.activeElement?.textContent?.trim(), cls: document.activeElement?.className }))

  // The group menu opens on the chosen item, moves with the arrows and gives the focus back on Escape.
  await settle('/members')
  await page.click('.side-switch .ms-button')
  check(await page.isVisible('.side-switch [role=menu]'), 'group menu: the list does not open')
  let a = await active()
  check(a.role === 'menuitemradio' && a.checked === 'true', 'group menu: the focus is not on the chosen group')
  await page.keyboard.press('ArrowDown')
  check((await active()).checked === 'false', 'group menu: ArrowDown does not move to the next group')
  await page.keyboard.press('Escape')
  a = await active()
  check(!(await page.isVisible('.side-switch [role=menu]')) && String(a.cls).includes('ms-button'), 'group menu: Escape does not close it and return to the button')

  // The player view hides the staff pages and the settings; the board view brings them back.
  await page.click('.crumb-actions .ms-button')
  await page.click('.crumb-actions [role=menuitemradio]:has-text("Giocatore")')
  await page.waitForTimeout(200)
  check(!(await page.isVisible('.side a[href="/attendance"]')) && !(await page.isVisible('.side a[href="/settings"]')), 'view menu: the player view still shows Presenze or Impostazioni')
  await page.click('.crumb-actions .ms-button')
  await page.click('.crumb-actions [role=menuitemradio]:has-text("Direttivo")')
  await page.waitForTimeout(200)
  check(await page.isVisible('.side a[href="/attendance"]'), 'view menu: the board view does not bring Presenze back')

  // A name with a digit is refused when the field is left, and the message goes when it is fixed.
  await settle('/profile/info')
  const first = page.locator('form input[autocomplete="given-name"]')
  await first.fill('Mario3')
  await first.blur()
  check(await page.isVisible('form .error[role=alert]'), 'names: no message for a digit after leaving the field')
  await first.fill('Mario')
  check(!(await page.isVisible('form .error[role=alert]')), 'names: the message stays after the name is fixed')

  // Removing asks first: the window names the thing, Annulla has the focus, Escape removes nothing.
  await settle('/settings/invites')
  await page.click('button.link:has-text("Revoca")')
  check(await page.isVisible('dialog[open]'), 'confirm: revoking an invite does not ask first')
  check((await active()).text === 'Annulla', 'confirm: Annulla does not have the focus')
  await page.keyboard.press('Escape')
  a = await active()
  check(!(await page.isVisible('dialog[open]')) && a.text === 'Revoca', 'confirm: Escape does not close the window and return to the button')

  // The other windows that ask first: cancelling an event, and deleting an announcement. Same rules: it asks, Annulla has the focus, Escape closes it.
  await settle(`/events/${training}`)
  await page.click('main .ev-menu summary')
  await page.click('.ev-menu-list button:has-text("Annulla evento")')
  check(await page.isVisible('dialog[open]'), 'confirm: cancelling an event does not ask first')
  check((await active()).text === 'Annulla', 'confirm: the cancel window does not give Annulla the focus')
  await page.keyboard.press('Escape')
  check(!(await page.isVisible('dialog[open]')), 'confirm: Escape does not close the cancel window')
  await settle('/announcements')
  await page.locator('main button.link:has-text("Elimina")').first().click()
  check(await page.isVisible('dialog[open]'), 'confirm: deleting an announcement does not ask first')
  check((await active()).text === 'Annulla', 'confirm: the delete window does not give Annulla the focus')
  await page.keyboard.press('Escape')
  check(!(await page.isVisible('dialog[open]')), 'confirm: Escape does not close the delete window')

  // Player things stay out of the staff views (decision 93, 106): no unanswered events banner, no certificate line
  // and no pending count in the bell. In the Giocatore view they show, and the same number is everywhere (decision 92).
  const asView = async (view, path) => { await page.goto(origin + '/'); await page.evaluate((v) => localStorage.setItem('view-as', v), view); await settle(path) }
  for (const view of ['board', 'coach']) {
    await asView(view, '/members')
    check(!(await page.locator('.banners .banner:visible').count()), `views: the ${view} view shows a banner about the person's own events or certificate`)
    await page.click('.crumb-actions .bell summary')
    check(!/senza risposta/.test(await page.locator('.crumb-actions .bell-list').innerText()), `views: the bell of the ${view} view counts events without an answer`)
    await settle('/events/' + training)
    check(!(await page.locator('main h2:has-text("La tua risposta")').count()), `views: the ${view} view shows the box "La tua risposta"`)
    await settle('/events')
    check(!(await page.locator('main .answers button, main .quick button').count()), `views: the ${view} view shows answer buttons on the events page`)
    await settle('/')
    check(!(await page.locator('#home-pending').count()), `views: the ${view} view shows the list of events to answer on the home page`)
  }
  await asView('player', '/members')
  const bannerText = await page.locator('.banners .banner[role=status] > span').first().innerText().catch(() => '')
  const bannerN = Number((bannerText.match(/Hai (\d+) event/) ?? [, bannerText.includes('Hai 1 evento') ? '1' : ''])[1])
  check(/questa settimana/.test(bannerText) && bannerN >= 1, `views: the player view shows no banner with the window ("questa settimana"): "${bannerText}"`)
  check(await page.locator('.doc-banner').count() >= 1, 'views: the player view does not show the certificate line')
  await page.click('.crumb-actions .bell summary')
  const bellText = await page.locator('.crumb-actions .bell-list').innerText()
  check(bellText.includes(bannerText), `views: the bell and the banner do not say the same: "${bellText.replace(/\s+/g, ' ')}" against "${bannerText}"`)
  await settle('/')
  const homeN = Number(await page.locator('#home-pending .count').innerText().catch(() => 'x'))
  check(homeN === bannerN, `views: the Home tile counts ${homeN}, the banner ${bannerN}`)
  await settle('/events')
  const eventsN = Number(await page.locator('.todo .count').innerText().catch(() => 'x'))
  check(eventsN === bannerN, `views: the Eventi heading counts ${eventsN}, the banner ${bannerN}`)
  await page.goto(origin + '/')
  await page.evaluate(() => localStorage.removeItem('view-as'))

  // Forms: pressing the button with a required field empty shows an Italian message under the field,
  // marks it aria-invalid, moves the focus to it and does not rely on the browser's own check.
  const emptyForm = async (target, label, path, prep) => {
    await target.goto(origin + path)
    await target.waitForLoadState('networkidle').catch(() => {})
    await target.waitForTimeout(300)
    if (prep) await prep(target)
    // The first visible form that has a required field with nothing in it.
    await target.evaluate(() => {
      for (const f of document.querySelectorAll('form')) {
        const r = f.getBoundingClientRect()
        const empty = [...f.querySelectorAll('[required]')].some((el) => !String(el.value ?? '').trim())
        if (empty && r.width > 0 && r.height > 0) { f.setAttribute('data-ui-empty', ''); break }
      }
    })
    const form = target.locator('form[data-ui-empty]').first()
    if (!(await form.count())) { problems.push(`forms: ${label}: no form with a required field found`); return }
    check(await form.evaluate((f) => f.noValidate), `forms: ${label}: the browser check is not turned off (noValidate)`)
    const submitButton = form.locator('button[type=submit]:visible').first()
    if (await submitButton.isDisabled()) { problems.push(`forms: ${label}: the submit button is disabled while a required field is empty, so no message can show`); return }
    await submitButton.click()
    await target.waitForTimeout(200)
    mkdirSync(join(out, 'forms'), { recursive: true })
    await target.screenshot({ path: join(out, 'forms', `${label.replace(/ /g, '-')}.png`) })
    const shown = await target.evaluate(() => {
      const bad = document.querySelector('[aria-invalid=true]')
      const message = bad ? document.getElementById((bad.getAttribute('aria-describedby') || '').split(' ').find((x) => x.startsWith('fe-')) || '') : null
      return { bad: Boolean(bad), text: message?.textContent?.trim() ?? '', focused: Boolean(bad) && document.activeElement === bad }
    })
    check(shown.bad, `forms: ${label}: no field is marked aria-invalid after an empty submit`)
    check(/\S/.test(shown.text) && !/^check\./.test(shown.text), `forms: ${label}: no message under the field`)
    check(shown.focused, `forms: ${label}: the focus did not move to the first field with a problem`)
  }
  await emptyForm(page, 'event form', '/events/new')
  await emptyForm(page, 'rink form', '/settings/rinks')
  await emptyForm(page, 'announcement form', '/announcements', async (pg) => { const b = pg.locator('main button:has-text("Nuovo avviso")'); if (await b.count()) await b.first().click() })
  await emptyForm(page, 'drill form', '/drills', async (pg) => { const b = pg.locator('main button:has-text("Nuovo esercizio")'); if (await b.count()) await b.first().click() })
  await emptyForm(page, 'profile form', '/profile/info', async (pg) => { await pg.locator('form input[autocomplete="given-name"]').fill('') })
  await emptyForm(page, 'absence form', '/profile/absences', async (pg) => { await pg.locator('main input[type=date]').first().fill('') })
  await emptyForm(page, 'group settings', '/settings/groups', async (pg) => { const b = pg.locator('main button:has-text("Aggiungi gruppo")'); if (await b.count()) await b.first().click() })
  await emptyForm(page, 'club settings', '/settings/club', async (pg) => { await pg.locator('form input[required]').first().fill('') })
  const anon = await browser.newContext({ viewport: { width: 375, height: 812 }, ...contextOptions })
  await anon.route(`${API}/**`, answer)
  const guest = await anon.newPage()
  await emptyForm(guest, 'login form', '/login')
  await emptyForm(guest, 'forgot password form', '/forgot-password')
  await emptyForm(guest, 'join form', '/join/sample-invite')
  await guest.goto(origin + '/login')
  await guest.fill('input[type=email]', 'persona@example.org')
  await guest.fill('input[type=password]', 'corta')
  // Login does not check the length, so the sign up form is the one with the 8 character rule.
  await emptyForm(guest, 'reset password form', '/reset-password')
  await anon.close()

  report.push({ width: 1280, name: 'interactions', path: '-', kind: 'auth', problems, errors: [] })
  await context.close()
}

await browser.close()
server.close()

// 7. Rules across pages: the frame starts at the same place, sub pages offer a way back.
const failures = []
for (const width of WIDTHS) {
  const rows = report.filter((r) => r.width === width && r.kind !== 'auth' && r.frameLeft !== null)
  const counts = new Map()
  for (const r of rows) counts.set(r.frameLeft, (counts.get(r.frameLeft) ?? 0) + 1)
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  for (const r of rows) if (r.frameLeft !== usual) r.problems.push(`page frame starts at ${r.frameLeft}px, the other pages at ${usual}px`)
}
for (const r of report) {
  if (r.kind !== 'auth' && r.frameLeft === null) r.problems.push('no .page frame found')
  if (r.kind === 'sub' && r.width < 700 && !r.hasBack) r.problems.push('sub page without a back button on phones')
  if (r.kind === 'sub' && r.width >= 1024 && !r.hasBack && !r.hasShellNav && !r.hasCrumbs) r.problems.push('sub page without a way back on computers')
  for (const e of r.errors) r.problems.push(`script error: ${e.slice(0, 160)}`)
  if (r.problems.length) failures.push(r)
}

const lines = ['# Interface check', '', `${report.length} page views, ${failures.length} with problems. Screenshots in ui-check/<width>${tag}.`, '']
for (const r of failures) {
  lines.push(`## ${r.name} at ${r.width}px (${r.path})`)
  const seen = new Map()
  for (const p of r.problems) seen.set(p, (seen.get(p) ?? 0) + 1)
  for (const [p, n] of seen) lines.push(`1. ${p}${n > 1 ? ` (${n} times)` : ''}`)
  lines.push('')
}
writeFileSync(join(out, 'report.md'), lines.join('\n'))
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(lines.join('\n'))
process.exit(failures.length ? 1 : 0)
