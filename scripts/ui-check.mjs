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
//   UI_CHECK_OUT=/tmp/hockey-review  separate output folder for parallel checks
//   UI_CHECK_WIDTHS=375,1280   other window widths (default 320, 375, 390, 430, 768, 1280)

import { execSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fixtures, ME } from './ui-check/fixtures.mjs'
import { createMockBackend } from './ui-check/backend.mjs'
import { interfaceRoutes } from './ui-check/routes.mjs'

const require = createRequire(import.meta.url)
const playwright = require('playwright')
const engine = process.env.UI_CHECK_WEBKIT ? playwright.webkit : playwright.chromium
const DARK = Boolean(process.env.UI_CHECK_DARK)
const LARGE = Boolean(process.env.UI_CHECK_LARGE)
const WIDTHS = (process.env.UI_CHECK_WIDTHS ?? '320,375,390,430,768,1280').split(',').map(Number)
const contextOptions = { serviceWorkers: 'block', locale: 'it-IT', timezoneId: 'Europe/Rome', colorScheme: DARK ? 'dark' : 'light' }
const largeText = (large) => { if (large) document.addEventListener('DOMContentLoaded', () => { document.documentElement.style.fontSize = '133%' }) }

const root = resolve(fileURLToPath(import.meta.url), '../..')
const out = resolve(process.env.UI_CHECK_OUT ?? join(root, 'ui-check'))
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

const { answer, eventRequests, requests: backendRequests, state: backendState } = createMockBackend(fixtures, ME)

// 4. The pages. "sub" pages must offer a way back; "auth" pages are outside the app frame.
const { training, game, member, futureGame } = fixtures.ids
const ROUTES = (process.env.UI_CHECK_INTERACTIONS_ONLY?[]:interfaceRoutes(fixtures.ids)).filter(([name]) => name.includes(only))

// 5. What is measured on every page, in the page itself.
function measure() {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40)
  const doc = document.documentElement
  const problems = []
  if (doc.scrollWidth > doc.clientWidth + 1) {
    // Name the widest offenders, so the cause can be found without a debugger.
    const wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1 && visible(el) && !(() => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return true; return false })()).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`)
    problems.push(`sideways scroll: page is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px window (${wide.join(', ')})`)
  }
  // No field or control reaches past the window edge, even when an ancestor hides the overflow (iPhone date fields).
  for (const el of document.querySelectorAll('main input, main select, main textarea, main button, main label')) {
    if (!visible(el) || el.closest('.scroll, .table-wrap, .chips, .days')) continue
    const r = el.getBoundingClientRect()
    if (r.right > doc.clientWidth + 1 || r.left < -1) problems.push(`box outside the window: ${el.tagName.toLowerCase()} "${name(el)}" spans ${Math.round(r.left)} to ${Math.round(r.right)} in a ${doc.clientWidth}px window`)
  }
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
  // No two pieces of text overlap inside a menu row or a table row, and no text spills out of its row (UI rule 1.10).
  // A piece is an element with text of its own, or a status dot; the text is measured line by line.
  for (const row of document.querySelectorAll('.shell-nav a, main tr, main .list .member')) {
    if (!visible(row)) continue
    const pieces = []
    for (const el of row.querySelectorAll('*')) {
      if (!visible(el)) continue
      const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())
      if (!own && !el.classList.contains('dot')) continue
      const rects = []
      if (el.classList.contains('dot')) rects.push(el.getBoundingClientRect())
      for (const c of el.childNodes) {
        if (c.nodeType !== 3 || !c.textContent.trim()) continue
        const range = document.createRange()
        range.selectNodeContents(c)
        rects.push(...[...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5))
      }
      pieces.push({ label: el.classList.contains('dot') ? 'status dot' : name(el), rects })
    }
    const rr = row.getBoundingClientRect()
    for (let i = 0; i < pieces.length; i++) {
      for (const r of pieces[i].rects) if (r.right > rr.right + 1 || r.left < rr.left - 1) problems.push(`text spills out of its row: "${pieces[i].label}" in "${name(row)}"`)
      for (let j = i + 1; j < pieces.length; j++) {
        const hit = pieces[i].rects.some((a) => pieces[j].rects.some((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1))
        if (hit) problems.push(`text overlaps: "${pieces[i].label}" and "${pieces[j].label}" in "${name(row)}"`)
      }
    }
  }
  // Tab strips that are wider than the window must show a fade on the edge with more tabs, and keep the active tab in view.
  for (const strip of document.querySelectorAll('.tabstrip')) {
    const nav = strip.querySelector('.ev-tabs')
    if (!nav || !visible(nav)) continue
    const scrolls = nav.scrollWidth > nav.clientWidth + 1
    const label = nav.getAttribute('aria-label')
    const fadeRight = strip.getAttribute('data-more-right') === 'true'
    const fadeLeft = strip.getAttribute('data-more-left') === 'true'
    const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1
    if (scrolls && !atEnd && !fadeRight) problems.push(`tab strip "${label}" scrolls but shows no fade on the right edge`)
    if (scrolls && nav.scrollLeft > 1 && !fadeLeft) problems.push(`tab strip "${label}" is scrolled but shows no fade on the left edge`)
    if (!scrolls && (fadeRight || fadeLeft)) problems.push(`tab strip "${label}" fits but shows a fade`)
    const active = nav.querySelector('[aria-current]')
    if (active) {
      const a = active.getBoundingClientRect(); const n = nav.getBoundingClientRect()
      if (a.left < n.left - 1 || a.right > n.right + 1) problems.push(`tab strip "${label}": the active tab "${name(active)}" is not fully in view`)
    }
  }
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
    // A "player" page is opened in the Giocatore view; the choice is taken out again afterwards, as the storage is shared.
    if (kind === 'player' || kind === 'nogames') await page.addInitScript(() => localStorage.setItem('view-as', 'player'))
    backendState.noGames = kind === 'nogames'
    await page.goto(origin + path)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(400)
    if (name.includes('events-list') && width >= 1000) await page.getByRole('button', {name: 'Elenco', exact:true}).click()
    if (name === 'events-month-player' && width >= 1000) await page.getByRole('button', {name:'Mese', exact:true}).click()
    if (name === 'event-new-visibility') await page.locator('.visibility-settings .fold-head').click()
    if (name === 'event-new-pending') { await page.getByLabel('Assegna i gruppi in seguito', {exact:true}).check(); await page.getByLabel('Ripeti ogni settimana', {exact:true}).check() }
    if(name==='settings-request-new')await page.getByRole('button',{name:'Aggiungi richiesta',exact:true}).click()
    const m = await page.evaluate(measure)
    if (kind === 'player' || kind === 'nogames') await page.evaluate(() => localStorage.removeItem('view-as'))
    if (kind === 'nogames') {
      const shown = await page.evaluate(() => ({ text: document.body.innerText, selects: document.querySelectorAll('main select').length }))
      if (!shown.text.includes('I tuoi gruppi non hanno partite in programma')) m.problems.push('Fantahockey does not say that the groups have no game coming up')
      if (shown.selects > 0) m.problems.push('Fantahockey offers the pick form although the groups have no game coming up')
    }
    backendState.noGames = false
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
if (!process.env.UI_CHECK_SKIP_INTERACTIONS) {
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
  const asViewEarly = async (view, path) => { await page.evaluate((v) => localStorage.setItem('view-as', v), view); await settle(path) }
  const active = () => page.evaluate(() => ({ role: document.activeElement?.getAttribute('role'), checked: document.activeElement?.getAttribute('aria-checked'), text: document.activeElement?.textContent?.trim(), cls: document.activeElement?.className }))

  const checkGroupName=async()=>{

    const keepGroups=structuredClone(fixtures.tables.groups)
    backendState.mutations=true
    await settle('/settings/groups')
    await page.click('.side-switch .ms-button')
    await page.getByRole('menuitemradio',{name:'A',exact:true}).click()
    await page.locator('main .group-head').first().click()
    await page.locator('.group-edit form').getByLabel('Nome',{exact:true}).fill('Gruppo audit')
    await page.locator('.group-edit form button[type=submit]').click()
    await page.waitForTimeout(300)
    check((await page.locator('.side-switch .ms-button').innerText()).includes('Gruppo audit'), 'groups: saved name stays stale in the global selector')
    fixtures.tables.groups=keepGroups;backendState.mutations=false
  }
  if(process.env.UI_CHECK_CONTRACTS==='metadata'){await checkGroupName()} else {
  // A failed load is not an empty club, and retry restores data without a page reload.
  for (const width of [375,1280]) {
    await page.setViewportSize({width,height:900})
  for (const [path,failure] of [
    ['/members',{path:'/rest/v1/profiles',query:'deleted_at'}],
    ['/events','/rest/v1/events'],
    ['/announcements','/rest/v1/announcements'],
    ['/campionato','/rest/v1/league_matches'],
    [`/events/${training}`,'/rest/v1/events'],
    [`/events/${training}/edit`,'/rest/v1/events'],
    [`/members/${member}`,{path:'/rest/v1/profiles',query:'id',value:`eq.${member}`}],
    ['/settings/club','/rest/v1/club_settings'],
    ['/settings/documents','/rest/v1/club_settings'],
  ]) {
    backendState.failure=failure
    await settle(path)
    check((await page.locator('main [role=alert]').count()) === 1, `load failure: ${path} has no clear error`)
    check((await page.getByRole('button',{name:'Riprova',exact:true}).count()) === 1, `load failure: ${path} has no retry`)
    check(!/Nessun membro\.|Non ci sono eventi|Nessun avviso/.test(await page.locator('main').innerText()), `load failure: ${path} claims the list is empty`)
    await page.screenshot({path:join(out,`load-failure-${path.replace(/[^a-z0-9]/gi,'_')}-${width}.png`),fullPage:true})
    backendState.failure=null
    await page.getByRole('button',{name:'Riprova',exact:true}).click()
    await page.waitForTimeout(300)
    check((await page.locator('main [role=alert]').count()) === 0, `load failure: ${path} retry did not recover`)
  }
  }
  await page.setViewportSize({width:1280,height:800})
  // A failed phone read cannot erase the saved contact when another profile field is submitted.
  {
    const contact=fixtures.tables.profile_contacts.find((c)=>c.user_id===ME)
    const kept=contact.phone;contact.phone='+39 333 1234567'
    backendState.failure='/rest/v1/profile_contacts'
    await settle('/profile/info')
    check(!(await page.locator('form button[type=submit]').isEnabled()), 'profile: save is enabled after the phone failed to load')
    check(!(await page.locator('input[type=tel]').isEnabled()), 'profile: unloaded phone looks editable')
    const before=backendRequests.length
    await page.locator('form').evaluate((form)=>form.requestSubmit())
    await page.waitForTimeout(100)
    check(!backendRequests.slice(before).some((r)=>r.method==='PATCH'), 'profile: submitting with an unloaded phone changed data')
    backendState.failure=null
    await page.getByRole('button',{name:'Riprova',exact:true}).click()
    await page.waitForTimeout(250)
    check((await page.locator('input[type=tel]').inputValue()).replace(/\D/g,'')==='393331234567', 'profile: retry did not restore the saved phone')
    check(await page.locator('form button[type=submit]').isEnabled(), 'profile: save did not recover after loading contact data')
    contact.phone=kept
  }

  // Custom validation respects the pattern even though native browser validation is disabled.
  await settle('/settings/groups')
  await page.getByRole('button',{name:'Aggiungi gruppo',exact:true}).click()
  await page.locator('.add-group input').first().fill('Prova audit')
  await page.locator('.add-group input[pattern]').fill('A!')
  await page.locator('.add-group button[type=submit]').click()
  check(await page.locator('.add-group input[pattern]').getAttribute('aria-invalid') === 'true', 'validation: an invalid group code reaches the backend')
  check((await page.locator('.add-group .field-error').count()) === 1, 'validation: invalid group code has no inline explanation')

  // Changing a calendar filter does not reload an event editor and discard its unsaved draft.
  await settle(`/events/${training}/edit`)
  await page.getByLabel('Titolo',{exact:true}).fill('Titolo da conservare')
  await page.click('.side-switch .ms-button')
  await page.getByRole('menuitemradio',{name:'B',exact:true}).click()
  await page.waitForTimeout(250)
  check(await page.getByLabel('Titolo',{exact:true}).inputValue()==='Titolo da conservare', 'event edit: changing the global group discards the draft')
  await page.evaluate(()=>localStorage.removeItem('group-filter'))

  // Destructive settings use the shared keyboard safe confirmation.
  for (const [path,opener] of [
    ['/settings/rinks','main .rinks form button.danger'],
    ['/settings/groups','main .group-edit button.danger-link'],
  ]) {
    await settle(path)
    if(path.endsWith('groups'))await page.locator('main .group-head').first().click()
    const trigger=page.locator(opener).first()
    await trigger.click()
    check(await page.locator('dialog[open]').isVisible(), `settings delete: ${path} has no modal confirmation`)
    check((await active()).text==='Annulla', `settings delete: ${path} does not focus cancel`)
    await page.keyboard.press('Escape')
    check(!(await page.locator('dialog[open]').count()), `settings delete: ${path} ignores Escape`)
    check(await trigger.evaluate((el)=>el===document.activeElement), `settings delete: ${path} did not restore focus`)
  }
  await checkGroupName()
  // Adding a rink invalidates the location cache before navigating back to Events.
  {
    const keepRinks=structuredClone(fixtures.tables.rinks)
    const next=fixtures.tables.events.find((x)=>x.id.endsWith('000000000012'))
    const kept=next.rink_id
    backendState.mutations=true
    await settle('/events')
    await page.locator('.side a[href="/settings"]').click()
    await page.locator('.shell-nav a[href="/settings/rinks"]').click()
    await page.locator('main .rinks').waitFor({state:'visible'})
    const form=page.locator('main form').last()
    await form.locator('input').fill('Pista audit')
    await form.locator('button[type=submit]').click()
    await page.waitForTimeout(200)
    const rink=fixtures.tables.rinks.find((x)=>x.name==='Pista audit')
    check(Boolean(rink),'rinks: add did not create the sample rink')
    if(rink) next.rink_id=rink.id
    await page.locator('.side a[href="/events"]').click()
    await page.waitForTimeout(300)
    check((await page.locator('main .next').innerText()).includes('Pista audit'), 'rinks: a newly added rink is missing until a full refresh')
    next.rink_id=kept;fixtures.tables.rinks=keepRinks;backendState.mutations=false
  }
  // Printing and CSV confirmation actually run, rather than only opening a dialog.
  await settle('/members')
  await page.evaluate(()=>{window.__auditPrinted=false;window.print=()=>{window.__auditPrinted=true}})
  await page.getByRole('button',{name:'Stampa',exact:true}).click()
  await page.locator('dialog[open]').getByRole('button',{name:'Stampa',exact:true}).click()
  await page.waitForTimeout(250)
  check(await page.evaluate(()=>window.__auditPrinted), 'output: print confirmation did not run print')
  await page.getByRole('button',{name:'Esporta CSV',exact:true}).click()
  const download=page.waitForEvent('download')
  await page.locator('dialog[open]').getByRole('button',{name:'Scarica il file',exact:true}).click()
  const file=await download
  const filePath=await file.path()
  check(file.suggestedFilename().endsWith('.csv')&&Boolean(filePath)&&readFileSync(filePath,'utf8').includes('Cognome;Nome'), 'output: CSV confirmation did not produce the member file')

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

  // Deleting a member's data asks first, in a window that names the person; Annulla has the focus.
  await settle(`/members/${member}`)
  await page.click('button.danger:has-text("Elimina i dati")')
  check(await page.isVisible('dialog[open]'), 'delete member: the button does not open a window')
  check(/Rossi Luca/.test(await page.locator('dialog[open]').innerText()), 'delete member: the window does not name the person')
  check((await active()).text === 'Annulla', 'delete member: Annulla does not have the focus')
  await page.keyboard.press('Escape')
  check(!(await page.isVisible('dialog[open]')), 'delete member: Escape does not close the window')

  // Settings groups are folded rows: all closed on first load, one open at a time, a real button with aria-expanded.
  // Championship statistics (board): the hidden players are listed with "Mostra di nuovo"; hiding asks first, naming the player.
  await settle('/settings/league')
  check((await page.locator('main .club-docs li').count()) === 2, 'league statistics: the two hidden players are not listed')
  check((await page.locator('main button', { hasText: 'Mostra di nuovo' }).count()) === 2, 'league statistics: a hidden player has no "Mostra di nuovo" button')
  await page.click('main .ms-button')
  await page.locator('main [role=menuitemradio]').nth(1).click()
  await page.fill('main input[list]', 'Mario Rossi')
  await page.click('main button[type=submit]')
  check(await page.isVisible('dialog[open] h2:has-text("Nascondere Mario Rossi")'), 'league statistics: hiding does not ask first, naming the player')
  check(await page.evaluate(() => document.activeElement?.textContent === 'Annulla'), 'league statistics: the focus is not on Annulla')
  await page.keyboard.press('Escape')
  await settle('/settings/club')
  const heads = page.locator('main .fold-head')
  check((await heads.count()) === 3, 'folds: the club settings do not show three folded groups')
  check((await page.locator('main .fold-head[aria-expanded=true]').count()) === 0, 'folds: a group of the club settings is open on first load')
  await heads.nth(0).click()
  check((await page.locator('main .fold-head[aria-expanded=true]').count()) === 1 && (await page.locator('main .fold-body:visible').count()) === 1, 'folds: opening a group does not show exactly one body')
  await heads.nth(1).click()
  check((await page.locator('main .fold-head[aria-expanded=true]').count()) === 1 && (await heads.nth(0).getAttribute('aria-expanded')) === 'false', 'folds: opening a second group does not close the first')
  await heads.nth(1).focus()
  await page.keyboard.press('Enter')
  check((await heads.nth(1).getAttribute('aria-expanded')) === 'false', 'folds: Enter on the open group does not close it')
  await page.keyboard.press('Space')
  check((await heads.nth(1).getAttribute('aria-expanded')) === 'true', 'folds: Space does not open the group')

  // The venue button: Apple Maps on an iPhone, Google Maps elsewhere; 44 pixels; on the event page and the next event panel.
  await settle(`/events/${training}`)
  const maps = page.locator('main a.maps-button').first()
  check((await maps.count()) === 1, 'maps: the event page has no "Apri in Mappe" button')
  check(/google\.com\/maps.*Via%20Esempio/.test((await maps.getAttribute('href')) ?? ''), 'maps: the link does not search the address in Google Maps')
  check(((await maps.boundingBox())?.height ?? 0) >= 43.5, 'maps: the button is under 44 pixels')
  await settle('/')
  check((await page.locator('main a.maps-button').count()) >= 1, 'maps: the next event on Home has no "Apri in Mappe" button')

  // The certificate: no date field without a file (decision 94); with a file the date field is there.
  await settle('/profile/documents')
  check((await page.locator('main input[type=date]').count()) === 0, 'certificate: a date field shows although no file was uploaded')
  await settle(`/members/${member}/documents`)
  check((await page.locator('main input[type=date]').count()) === 1, 'certificate: no date field although a file was uploaded')

  // Every certificate and consent status in the profile menu and on the Members page, from phone to computer width:
  // no text overlaps or spills out of its row (decision 128, UI rule 1.10).
  {
    const days = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
    const until = (n) => new Date(Date.parse(days(n)) + 365 * 864e5).toISOString().slice(0, 10)
    const file = `${ME}/medical_certificate-2000000000.jpg`
    const certs = {
      'no certificate': null,
      'file, no date': { issued_on: null, issued_source: null, valid_until: null, file_path: file },
      'typed date': { issued_on: days(10), issued_source: 'typed', valid_until: until(10), file_path: file },
      'expired': { issued_on: days(400), issued_source: 'read', valid_until: until(400), file_path: file },
      'expiring': { issued_on: days(350), issued_source: 'read', valid_until: until(350), file_path: file },
      'valid': { issued_on: days(20), issued_source: 'read', valid_until: until(20), file_path: file },
    }
    const consents = { 'no notice': [null, null], 'not given': ['club/privacy.pdf', null], 'old notice': ['club/privacy.pdf', 'club/old.pdf'], 'given': ['club/privacy.pdf', 'club/privacy.pdf'] }
    const keepDocs = fixtures.tables.member_documents.slice()
    const keepNotice = fixtures.tables.club_settings[0].privacy_notice_path
    const combos = [...Object.keys(certs).map((c) => [c, 'given']), ['valid', 'no notice'], ['valid', 'not given'], ['valid', 'old notice'], ['no certificate', 'not given']]
    const seenTexts = new Set()
    for (const [c, k] of combos) {
      const [notice, given] = consents[k]
      fixtures.tables.club_settings[0].privacy_notice_path = notice
      const others = keepDocs.filter((d) => d.user_id !== ME)
      const mine = []
      if (certs[c]) mine.push({ user_id: ME, kind: 'medical_certificate', accepted_at: null, verified_at: null, verified_by: null, updated_by: ME, updated_at: new Date().toISOString(), ...certs[c] })
      if (given) mine.push({ user_id: ME, kind: 'privacy_consent', valid_until: null, file_path: given, accepted_at: days(30), updated_by: ME, updated_at: new Date().toISOString() })
      fixtures.tables.member_documents = [...others, ...mine]
      for (const width of [320, 375, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 900 })
        await settle(width < 768 ? '/profile' : '/profile/info')
        const m = await page.evaluate(measure)
        for (const text of m.problems.filter((x) => /overlap|spills/.test(x))) problems.push(`menu rows: ${c} + ${k} at ${width}px: ${text}`)
        seenTexts.add(await page.evaluate(() => document.querySelector('.shell-nav .doc-status')?.textContent ?? ''))
      }
    }
    check(seenTexts.size >= 8, `menu rows: only ${seenTexts.size} different status texts were tried`)
    await page.setViewportSize({ width: 1280, height: 800 })
    fixtures.tables.member_documents = keepDocs
    fixtures.tables.club_settings[0].privacy_notice_path = keepNotice
  }

  // The certificate review list (decision 129): staff only, one row per certificate waiting, a second list of the ones the
  // person confirmed themselves; Home and Members link to it; a staff member sees "Conferma la data" on their own page and the
  // Giocatore view does not.
  await settle('/members/certificates')
  check((await page.locator('main .review-row').count()) >= 2, 'review list: fewer rows than the waiting and the self confirmed certificates')
  check(/Confermato dal diretto interessato/.test(await page.locator('main').innerText()), 'review list: the self confirmed certificate is not marked "Confermato dal diretto interessato"')
  check((await page.locator('main .review-row button:has-text("Conferma la data")').count()) >= 1, 'review list: no "Conferma la data" action')
  await settle('/')
  check((await page.locator('section[aria-labelledby=home-staff] a[href="/members/certificates"]').count()) === 1, 'review list: the Home figure does not link to it')
  await settle('/members')
  check((await page.locator('main a[href="/members/certificates"]').count()) >= 2, 'review list: Members has no link to it (button and column)')
  {
    const keepDocs = fixtures.tables.member_documents.slice()
    fixtures.tables.member_documents = [...keepDocs, { user_id: ME, kind: 'medical_certificate', issued_on: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10), issued_source: 'typed', valid_until: null, file_path: `${ME}/medical_certificate-2000000000.jpg`, accepted_at: null, verified_at: null, verified_by: null, updated_by: ME, updated_at: new Date().toISOString() }]
    await asViewEarly('player', '/members/certificates')
    check(new URL(page.url()).pathname === '/', 'review list: the Giocatore view can open it')
    await page.goto(origin + '/')
    await page.evaluate(() => localStorage.removeItem('view-as'))
    fixtures.tables.member_documents = keepDocs
  }

  // The two step sign in is optional (decision 130): no "obbligatoria", no deadline when the club set none, an unfinished
  // setup is explained and keeps a field for the code, and a verified one reads as active.
  {
    const keepDate = fixtures.tables.club_settings[0].mfa_required_from
    fixtures.tables.club_settings[0].mfa_required_from = null
    await settle('/profile/security')
    const plain = await page.locator('main').innerText()
    check(/Facoltativa/.test(plain) && !/obbligatori/i.test(plain) && !/prima delle/.test(plain), 'two step: the page does not read as optional, or shows a deadline although the club set none')
    check(/Richiesta al direttivo/.test(plain) && /non richiede la verifica in due passaggi a nessuno/.test(plain), 'two step: the board does not see that nothing is required')
    fixtures.mockFactors = [{ id: 'f1', factor_type: 'totp', status: 'unverified', friendly_name: 'App' }]
    await settle('/profile/security')
    check(/La configurazione non è stata completata/.test(await page.locator('main').innerText()) && (await page.locator('main input[autocomplete=one-time-code]').count()) === 1, 'two step: an unfinished setup is not explained or has no code field')
    fixtures.mockFactors = [{ id: 'f2', factor_type: 'totp', status: 'verified', friendly_name: 'App' }]
    await settle('/profile/security')
    check(/è attiva/.test(await page.locator('main h2').first().innerText()), 'two step: a verified app does not read as active')
    fixtures.mockFactors = []
    fixtures.tables.club_settings[0].mfa_required_from = keepDate
  }

  // Offline use (decision 137): with the database unreachable the app opens on the saved copy, read only, says that the data is
  // not up to date, keeps no contact or rating, and signing out deletes the copy.
  {
    // A fresh session keeps this test independent of the preceding account setup cases.
    const offlineContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...contextOptions })
    await offlineContext.route(`${API}/**`, answer)
    await offlineContext.addInitScript(([me,email]) => {
      const session = { access_token:'sample', refresh_token:'sample', token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+36000, user:{id:me,email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}} }
      localStorage.setItem('sb-mock-auth-token', JSON.stringify(session))
    }, [ME,fixtures.me.email])
    const offlinePage = await offlineContext.newPage()
    const offlineSettle = async (path) => { await offlinePage.goto(origin + path); await offlinePage.waitForLoadState('networkidle').catch(() => {}); await offlinePage.waitForTimeout(300) }
    await offlineSettle('/')
    await offlinePage.waitForFunction(async () => Boolean(await (await caches.open('offline-data-v1')).match('/offline-copy.json')), null, { timeout: 10000 }).catch(() => {})
    const kept = await offlinePage.evaluate(async () => { const copy = await (await caches.open('offline-data-v1')).match('/offline-copy.json'); return copy ? await copy.text() : null })
    check(kept !== null && kept.includes('"events"'), 'offline: no saved copy was made after opening the app online')
    check(kept === null || !/@example\.test|phone|rating|email/.test(kept), 'offline: the saved copy holds a contact or a rating')
    backendState.apiDown = true
    // A phone with no signal says so: the page is opened with navigator.onLine false.
    await offlinePage.addInitScript(() => { if (localStorage.getItem('fake-offline')) Object.defineProperty(navigator, 'onLine', { get: () => false }) })
    await offlinePage.evaluate(() => localStorage.setItem('fake-offline', '1'))
    await offlineSettle('/')
    const text = await offlinePage.locator('body').innerText()
    check(text.includes('Dati non aggiornati'), 'offline: the saved copy is shown without the note "Dati non aggiornati"')
    check(!(await offlinePage.locator('main button:text-is("Presente"), main button:text-is("Assente")').count()), 'offline: the saved copy offers answer buttons')
    check(!(await offlinePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)), 'offline: the saved copy scrolls sideways')
    await offlinePage.screenshot({ path: join(out, 'offline-1280.png'), fullPage: true })
    await offlinePage.setViewportSize({ width: 375, height: 812 })
    await offlinePage.locator('.fold-head').first().click().catch(() => {})
    await offlinePage.screenshot({ path: join(out, 'offline-375.png'), fullPage: true })
    await offlinePage.setViewportSize({ width: 1280, height: 800 })
    backendState.apiDown = false
    await offlinePage.evaluate(() => localStorage.removeItem('fake-offline'))
    await offlineSettle('/profile')
    await offlinePage.locator('button.shell-signout').first().click()
    await offlinePage.waitForTimeout(600)
    check(await offlinePage.evaluate(async () => !(await caches.has('offline-data-v1'))), 'offline: signing out left the saved copy on the phone')
    await offlineContext.close()
  }

  // Outside the Events calendar, Player view keeps the own group scope. The sample person belongs to A and B.
  // The calendar separately offers consultation of C1, while staff keep all groups.
  {
    const SEEN = 'Allenamento C1 riservato'
    const where = []
    for (const path of ['/', '/stats', '/stats?tab=players', '/campionato', '/members']) {
      await asViewEarly('player', path)
      const body = await page.locator('body').innerText()
      if (body.includes(SEEN)) where.push(path)
      if (/\bC1\b/.test(await page.locator('main .chips, main .stats-filters').allInnerTexts().then((x) => x.join(' ')).catch(() => ''))) where.push(`${path} (a chip of C1)`)
    }
    check(where.length === 0, `groups: the Giocatore view shows a group the person is not in, on: ${where.join(', ')}`)
    await asViewEarly('player', '/events')
    await page.click('.side-switch .ms-button')
    const items = (await page.locator('.side-switch [role=menuitemradio]').allInnerTexts()).map((x) => x.trim())
    check(items.join('|') === 'A|B|I miei gruppi|Tutti i gruppi', `groups: the selector of the Giocatore view lists "${items.join('|')}" instead of own groups and aggregate choices`)
    await page.getByRole('menuitemradio', {name:'A', exact:true}).click()
    await page.getByRole('button', {name:'Elenco',exact:true}).click()
    check((await page.locator('main').innerText()).includes('Allenamento da assegnare'), 'groups: unassigned training disappeared from the own group view')
    await page.click('.side-switch .ms-button')
    await page.getByRole('menuitemradio', {name:'I miei gruppi', exact:true}).click()
    await page.reload(); await page.waitForTimeout(400)
    check((await page.locator('.side-switch .ms-button').innerText()).includes('I miei gruppi'), 'groups: My groups choice did not survive reload')
    await page.getByRole('button', {name:'Elenco',exact:true}).click()
    check(!(await page.locator('main').innerText()).includes(SEEN), 'groups: My groups includes a foreign assigned event')
    check((await page.locator('main').innerText()).includes('Allenamento da assegnare'), 'groups: My groups excludes an unassigned training')
    await page.evaluate(() => localStorage.removeItem('group-filter'))
    await asViewEarly('board', '/events')
    check((await page.locator('body').innerText()).includes(SEEN), 'groups: the board view no longer shows the events of every group')
    await page.click('.side-switch .ms-button')
    const staffItems = (await page.locator('.side-switch [role=menuitemradio]').allInnerTexts()).map((x) => x.trim())
    check(staffItems[0] === 'Tutti i gruppi' && staffItems.length === 6, `groups: the staff view selector lists "${staffItems.join('|')}"`)
    await page.keyboard.press('Escape')
    await page.goto(origin + '/')
    await page.evaluate(() => localStorage.removeItem('view-as'))
  }

  // Layout persists on this browser; overlaps stay a quiet staff notice.
  {
    await asViewEarly('board', '/events')
    const notice = page.locator('.overlap-notice .fold-head')
    check(await notice.getAttribute('aria-expanded') === 'false', 'overlap: warning opened without staff choosing it')
    await notice.click()
    check((await page.locator('.overlap-notice a').count()) >= 2, 'overlap: the affected events have no direct links')
    check((await page.locator('dialog[open], [role=alert]').count()) === 0, 'overlap: notice interrupts staff with a dialog or alert')
    await page.screenshot({path:join(out,'staff-overlap-1280.png'),fullPage:true})
    await notice.click()
    for (const name of ['Elenco','Mese']) {
      await page.getByRole('button',{name,exact:true}).click()
      await page.reload(); await page.waitForLoadState('networkidle')
      check(await page.getByRole('button',{name,exact:true}).getAttribute('aria-pressed') === 'true', `calendar: ${name} did not survive reload`)
    }
    await page.getByRole('button',{name:'Settimana',exact:true}).click()
    await asViewEarly('player','/events')
    check((await page.locator('.overlap-notice').count()) === 0, 'overlap: staff notice appears in Player view')
  }

  // Consultation never supplies answers, staff controls or a discussion composer.
  {
    await asViewEarly('player', '/events')
    const next = await page.locator('main .next').innerText()
    check(next.includes('Allenamento di prova') || !next.includes('C1'), 'events: an observer event replaced the next eligible event')
    check((await page.locator('main .consultation').count()) > 0, 'events: no consultation treatment for another group')
    await settle(`/events/${fixtures.ids.consultation}`)
    check((await page.locator('main').innerText()).includes('Non convocato'), 'events: consultation event has no explicit label')
    check((await page.locator('main .answers button, main .event-actions, main .compose').count()) === 0, 'events: consultation offers interaction')
    const hiddenTabs = await page.locator('main .ev-tabs a').allInnerTexts()
    check(!hiddenTabs.some((x) => /Discussione|Formazione|Piano/.test(x)), 'events: hidden detail tabs are offered')
    await settle(`/events/${fixtures.ids.shared}?tab=discussion`)
    check((await page.locator('main .compose').count()) === 0, 'events: shared discussion offers a composer')
    await settle(`/events/${fixtures.ids.unassigned}`)
    check((await page.locator('main').innerText()).includes('Gruppo non assegnato'), 'events: unassigned training is not labelled')
    check((await page.locator('main .answers button').count()) === 0, 'events: unassigned training can be answered')
    for (const view of ['board','coach']) {
      await asViewEarly(view, '/events')
      await page.getByRole('button', {name:'Elenco', exact:true}).click()
      const text = await page.locator('main').innerText()
      check(!text.includes('La tua risposta') && !text.includes('Le mie presenze'), 'events: staff list shows personal attendance')
      check((await page.locator('.list-table .event-title-link').count()) > 0, 'events: titles are not links')
      const lastMenu = page.locator('.list-table .event-actions summary').last()
      await lastMenu.scrollIntoViewIfNeeded(); await lastMenu.click()
      const popup = page.locator('.event-actions-list')
      await popup.waitFor({ state: 'visible' })
      if (view === 'board') await page.screenshot({ path: join(out, 'event-list-actions.png') })
      check(await popup.isVisible(), 'events: list action menu is clipped or absent')
      await page.keyboard.press('ArrowDown')
      check(/Annulla evento|Ripristina/.test((await active()).text), 'events: action menu does not support arrow keys')
      await popup.getByRole('menuitem', {name:'Elimina evento', exact:true}).click()
      await page.waitForTimeout(100)
      check(await page.locator('dialog[open]').isVisible(), 'events: deleting from list has no confirmation')
      check((await active()).text === 'Annulla', 'events: list deletion does not focus cancel')
      await page.keyboard.press('Escape')
    }
    await asViewEarly('board', `/events/${training}/edit`)
    await page.locator('select').filter({has: page.locator('option[value="following"]')}).selectOption('following')
    const before = eventRequests.filter((x) => x.name === 'save_event').length
    await page.locator('form button[type=submit]').click()
    await page.waitForTimeout(100)
    check(await page.locator('dialog[open]').isVisible(), 'series: editing following occurrences skips confirmation')
    check(eventRequests.filter((x) => x.name === 'save_event').length === before, 'series: values saved before confirmation')
    check(/eventi, dal/.test(await page.locator('dialog[open]').innerText()), 'series: confirmation has no count or dates')
    await page.screenshot({ path: join(out, 'series-confirmation.png') })
    await page.getByRole('button', {name:'Salva le modifiche', exact:true}).click()
    await page.waitForTimeout(200)
    const request = eventRequests.filter((x) => x.name === 'save_event').at(-1)
    check(request?.body.p_scope === 'following' && request.body.p_expected_count > 0 && request.body.p_changes.participant_details.length === 5, 'series: save does not contain scope, preview count and visibility together')
    await settle('/events/new')
    const venue = page.locator('input[name=venue]')
    await venue.fill('Second address')
    await page.getByRole('button',{name:'Grande',exact:true}).click()
    check(!(await venue.isEnabled()) && await venue.inputValue() === 'Via Esempio 1, Milano', 'events: a training with a rink address permits a second address')
    await page.getByRole('button',{name:'Piccola',exact:true}).click()
    check(await venue.isEnabled(), 'events: rink without an address prevents an event address')
    await page.getByRole('button',{name:'Grande',exact:true}).click()
    await page.getByLabel('Assegna i gruppi in seguito', {exact:true}).check()
    check((await page.locator('main').innerText()).includes('Nessuno riceverà richieste di presenza'), 'events: pending training does not explain attendance')
    await page.getByLabel('Data',{exact:true}).fill(fixtures.tables.events.find((e) => e.id === training).starts_at.slice(0,10))
    await page.getByLabel('Inizio', {exact:true}).fill('22:30')
    await page.getByLabel('Ripeti ogni settimana', {exact:true}).check()
    await page.locator('.visibility-settings .fold-head').click()
    await page.locator('.visibility-audiences fieldset').nth(1).getByLabel('Formazione', {exact:true}).check()
    await page.locator('form button[type=submit]').click()
    await page.waitForTimeout(200)
    const creation = eventRequests.filter((x) => x.name === 'save_event').at(-1)?.body
    check(creation?.p_event_id === null && creation.p_repeat_weeks === 11 && creation.p_changes.groups_pending && creation.p_changes.group_ids.length === 0, 'events: creating a pending weekly series does not save its assignment and repeat together')
    check(creation?.p_changes.venue === null && creation?.p_changes.rink_id === 1, 'events: saving an addressed training retained a duplicate address')
    check(creation?.p_changes.observer_details.join('|') === 'lineup', 'events: observer visibility choice is missing from creation')
    check(creation && Date.parse(creation.p_changes.ends_at) - Date.parse(creation.p_changes.starts_at) === 90 * 60000, 'events: overnight training end is wrong')
    await page.goto(origin + '/')
    await page.evaluate(() => localStorage.removeItem('view-as'))
  }

  // Required documents (decision 132): the months field is checked by the app, the consent can be a tick box.
  await settle('/settings/documents')
  await page.locator('[data-fold=existing] .fold-head').click()
  await page.fill('main input[type=number]', '40')
  await page.click('[data-fold=existing] button[type=submit]')
  const rangeMessage = await page.evaluate(() => { const bad = document.querySelector('main input[type=number][aria-invalid=true]'); const id = (bad?.getAttribute('aria-describedby') || '').split(' ').find((x) => x.startsWith('fe-')); return id ? document.getElementById(id)?.textContent?.trim() ?? '' : '' })
  check(/\S/.test(rangeMessage), 'required documents: 40 months is not refused with a message under the field')
  // The player's required documents (decision 168): one card each, the ones for other groups left out, the date of a file
  // waits for the file, and a document to read must be opened before the answer can be sent.
  await asViewEarly('player', '/profile/documents')
  check((await page.locator('main .doc-card').count()) === 5, 'required documents: the player should see five cards (certificate, consent, photos, form, rules)')
  check((await page.locator('main .doc-card:has-text("Richiesta per un altro gruppo")').count()) === 0, 'required documents: a requirement of another group is shown')
  check((await page.locator('main .doc-card:has-text("Modulo della federazione") .doc-status.bad').count()) === 1 && /Manca la firma/.test(await page.locator('main .doc-card:has-text("Modulo della federazione")').innerText()), 'required documents: the rejected form does not show its note in red status')
  check(/Il club ha aggiornato il documento/.test(await page.locator('main .doc-card:has-text("Regolamento interno")').innerText()), 'required documents: the outdated answer is not named as outdated')
  check((await page.locator('main .doc-card:has-text("Consensi per foto e video") form').count()) === 0 && (await page.locator('main .doc-card:has-text("Consensi per foto e video") .doc-status.ok').count()) === 1, 'required documents: a completed requirement still shows its form')
  check((await page.locator('main .doc-card:has-text("Certificato medico") input[type=date]').count()) === 0, 'required documents: the date shows before a file was chosen')
  await page.check('main .doc-card:has-text("Consenso privacy") input[type=checkbox]')
  await page.click('main .doc-card:has-text("Consenso privacy") button[type=submit]')
  check(/Apri il documento da leggere prima di inviare/.test(await page.locator('main .doc-card:has-text("Consenso privacy")').innerText()), 'required documents: the consent is sent without opening the document to read')
  await page.goto(origin + '/')
  await page.evaluate(() => localStorage.removeItem('view-as'))

  // The season card (V12): made on the phone, a canvas of the right proportions and two buttons of 44 pixels.
  await settle('/profile/season')
  await page.click('main button:has-text("Crea la scheda")')
  await page.waitForTimeout(200)
  const card = await page.locator('main canvas.season-card-canvas').boundingBox()
  check(Boolean(card) && Math.abs(card.width / card.height - 1080 / 1350) < 0.02, 'season card: the picture is missing or has the wrong proportions')
  const painted = await page.evaluate(() => { const c = document.querySelector('canvas.season-card-canvas'); if (!c) return false; const d = c.getContext('2d').getImageData(540, 700, 1, 1).data; return d[3] > 0 })
  check(painted, 'season card: the picture is empty')
  for (const label of ['Condividi', 'Salva l\'immagine']) check(((await page.locator(`main button:has-text("${label}")`).boundingBox())?.height ?? 0) >= 43.5, `season card: "${label}" is under 44 pixels or missing`)
  await page.screenshot({ path: join(out, 'season-card.png'), fullPage: true })

  // The notification panel: fully inside the window, closes on a tap outside, on Escape and after a link, and gives the focus back.
  const bell = async (width, height, label) => {
    const target = await context.newPage()
    await target.setViewportSize({ width, height })
    await target.goto(origin + '/members')
    await target.waitForLoadState('networkidle').catch(() => {})
    await target.waitForTimeout(300)
    const summary = width < 768 ? '.top .bell summary' : '.crumb-actions .bell summary'
    await target.click(summary)
    await target.screenshot({ path: join(out, `bell-${label}.png`) })
    const box = await target.locator(width < 768 ? '.top .bell-list' : '.crumb-actions .bell-list').boundingBox()
    check(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, `bell at ${label}: the panel is not fully inside the window (${JSON.stringify(box)})`)
    if (width < 768 && box) check(Math.abs((box.x + box.width / 2) - width / 2) <= 1, `bell at ${label}: the panel is not centred on the phone`)
    await target.mouse.click(5, height - 5)
    check(!(await target.locator('.bell[open]').count()), `bell at ${label}: a tap outside does not close the panel`)
    await target.click(summary)
    await target.keyboard.press('Escape')
    check(!(await target.locator('.bell[open]').count()), `bell at ${label}: Escape does not close the panel`)
    check(await target.evaluate(() => document.activeElement?.tagName === 'SUMMARY'), `bell at ${label}: the focus does not return to the bell after Escape`)
    await target.click(summary)
    await target.waitForTimeout(100)
    check(await target.locator('.bell[open]').count(), `bell at ${label}: the panel does not open again after Escape`)
    if (!(await target.locator('.bell[open]').count())) { await target.close(); return }
    await target.locator(width < 768 ? '.top .bell-list a' : '.crumb-actions .bell-list a').first().click()
    await target.waitForTimeout(200)
    check(!(await target.locator('.bell[open]').count()), `bell at ${label}: the panel stays open after a link is followed`)
    await target.close()
  }
  for (const [w, h] of [[320, 640], [375, 812], [430, 932], [1280, 800]]) await bell(w, h, `${w}px`)

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
    check(!(await page.locator('#home-season').count()), `views: the ${view} view shows the season tile of the player`)
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
  await page.screenshot({ path: join(out, 'home-player-1280.png'), fullPage: true })
  check(await page.locator('#home-season').count() === 1, 'season: the player view of Home has no "La mia stagione" tile')
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
  await emptyForm(page, 'club settings', '/settings/club', async (pg) => { await pg.locator('main .fold-head').first().click(); await pg.locator('form input[required]:visible').first().fill('') })
  const anon = await browser.newContext({ viewport: { width: 375, height: 812 }, ...contextOptions })
  await anon.route(`${API}/**`, answer)
  const guest = await anon.newPage()
  for (const path of ['/login','/join/sample-invite','/reset-password']) {
    await guest.goto(origin + path); await guest.waitForTimeout(250)
    const password = guest.locator('[data-password-field]')
    await password.fill('EsempioSicuro123!')
    await guest.getByRole('button',{name:'Mostra password',exact:true}).click()
    check(await password.getAttribute('type') === 'text' && await password.inputValue() === 'EsempioSicuro123!', `password: ${path} reveal changed the password`)
    await guest.getByRole('button',{name:'Nascondi password',exact:true}).click()
    check(await password.getAttribute('type') === 'password' && await password.inputValue() === 'EsempioSicuro123!', `password: ${path} hide changed the password`)
  }
  await emptyForm(guest, 'login form', '/login')
  await emptyForm(guest, 'forgot password form', '/forgot-password')
  await emptyForm(guest, 'join form', '/join/sample-invite')
  await guest.goto(origin + '/login')
  await guest.fill('input[type=email]', 'persona@example.org')
  await guest.fill('input[type=password]', 'corta')
  // Login does not check the length, so the sign up form is the one with the 8 character rule.
  await emptyForm(guest, 'reset password form', '/reset-password')
  await anon.close()

  }
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
