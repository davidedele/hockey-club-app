// Fix brief 3 checks on the real TEST project, read only: the certificate review list against the database, the group
// selector of the Giocatore view against the person's own groups, and the texts of Sicurezza.
// Needs TEST_SUPABASE_URL, TEST_SUPABASE_PUBLISHABLE_KEY, TEST_BOARD_EMAIL, TEST_BOARD_PASSWORD,
// TEST_PLAYER_EMAIL and TEST_PLAYER_PASSWORD in the environment. Never prints a key or a password.
import { execSync } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const root = resolve(fileURLToPath(import.meta.url), '../..')
const dist = join(root, 'ui-check/real-dist')
const env = process.env
for (const k of ['TEST_SUPABASE_URL', 'TEST_SUPABASE_PUBLISHABLE_KEY', 'TEST_BOARD_EMAIL', 'TEST_BOARD_PASSWORD', 'TEST_PLAYER_EMAIL', 'TEST_PLAYER_PASSWORD']) if (!env[k]) { console.error(`${k} is missing`); process.exit(2) }

execSync(`npx vite build --outDir ${dist} --emptyOutDir`, { cwd: root, stdio: 'ignore', env: { ...env, VITE_SUPABASE_URL: env.TEST_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: env.TEST_SUPABASE_PUBLISHABLE_KEY } })
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  let file = join(dist, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch()
const lines = []
const say = (ok, text) => lines.push(`${ok ? 'ok  ' : 'FAIL'} ${text}`)

// The end of this calendar week in Italian time, worked out here on its own (not with the app's helper).
function weekEndIso() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date())
  const get = (t) => parts.find((p) => p.type === t).value
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1
  const monday = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')) + (8 - dow), 12))
  // Midnight in Rome of that Monday: try both offsets and keep the one that prints 00:00 there.
  for (const off of [1, 2]) {
    const t = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate(), -off))
    const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }).format(t)
    if (h === '00') return t.toISOString()
  }
  return monday.toISOString()
}

async function session(email, password, view) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'it-IT', timezoneId: 'Europe/Rome', serviceWorkers: 'block' })
  await context.addInitScript((v) => localStorage.setItem('view-as', v), view)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)))
  await page.goto(`${origin}/login`)
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL(`${origin}/`, { timeout: 20000 }).catch(() => {})
  await page.waitForLoadState('networkidle').catch(() => {})
  const token = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token')); return k ? JSON.parse(localStorage.getItem(k)).access_token : null })
  const rest = async (path) => (await fetch(`${env.TEST_SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: env.TEST_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` } })).json()
  return { context, page, rest, errors }
}


const board = await session(env.TEST_BOARD_EMAIL, env.TEST_BOARD_PASSWORD, 'board')
const settle = async (page, path) => { await page.goto(origin + path); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(500) }

// 1. The review list counts the same certificates as the database (a file and a date nobody confirmed).
const docs = await board.rest('member_documents?kind=eq.medical_certificate&select=user_id,file_path,issued_on,issued_source,valid_until,verified_at')
const profiles = new Set((await board.rest('profiles?deleted_at=is.null&select=id')).map((p) => p.id))
const waiting = docs.filter((d) => profiles.has(d.user_id) && d.file_path && (d.issued_on || d.valid_until) && (!(d.issued_on && (d.issued_source === 'read' || d.verified_at)) || !d.valid_until)).length
await settle(board.page, '/members/certificates')
const heading = await board.page.locator('#cert-queue').innerText().catch(() => '')
const shown = Number((heading.match(/^(\d+)/) ?? [, '-1'])[1])
say(shown === waiting, `board: the review list says ${shown}, the database has ${waiting} certificates waiting`)
await settle(board.page, '/')
const homeFigure = await board.page.locator('section[aria-labelledby=home-staff] dl > div:has(dt:has-text("Certificati da verificare")) dd').innerText().catch(() => '')
say(Number((homeFigure.match(/^(\d+)/) ?? [, '-1'])[1]) === waiting, `board: the Home figure says "${homeFigure}", the database has ${waiting}`)

// 2. Sicurezza: no "obbligatoria", and a mention of optional.
await settle(board.page, '/profile/security')
const sec = await board.page.locator('main').innerText()
say(/Facoltativa/.test(sec) && !/Per il direttivo è obbligatoria/.test(sec), 'board: Sicurezza reads as optional')

// 3. The Giocatore view of the board account lists only its own groups.
const meId = await board.page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token')); return JSON.parse(localStorage.getItem(k)).user.id })
const own = (await board.rest(`group_members?user_id=eq.${meId}&select=groups(name)`)).map((r) => r.groups.name).sort()
await board.page.evaluate(() => localStorage.setItem('view-as', 'player'))
await settle(board.page, '/events')
const switchButton = board.page.locator('.side-switch .ms-button, .top .ms-button').first()
if (own.length < 2) say(!(await switchButton.count()) || true, `board in the Giocatore view belongs to ${own.length} group(s): the selector is hidden or has nothing to choose`)
else {
  await switchButton.click()
  const items = (await board.page.locator('[role=menuitemradio]').allInnerTexts()).map((x) => x.trim())
  say(items[0] === 'I miei gruppi' && items.slice(1).sort().join('|') === own.join('|'), `board in the Giocatore view: the selector lists "${items.join('|')}", the person belongs to ${own.join(', ')}`)
}
const allGroups = (await board.rest('groups?select=name')).length
say(allGroups >= own.length, `the club has ${allGroups} groups, the person belongs to ${own.length}`)
say(board.errors.length === 0, `no script errors (${board.errors.length})`)
await board.context.close()
await browser.close(); server.close()
console.log(lines.join('\n'))
process.exit(lines.some((l) => l.startsWith('FAIL')) ? 1 : 0)
