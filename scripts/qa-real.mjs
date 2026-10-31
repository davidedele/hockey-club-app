// Reads the real TEST project as the test player and the test board account, in a browser, and checks
// that the numbers on screen are the numbers in the database. Read only: it writes nothing.
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

// 0. With QA_WRITE=1 the board makes one event named "Prova QA 3" for tomorrow in every group, so the player has something
// to answer, and removes only that event at the end.
let created = null
let boardRest = null
if (process.env.QA_WRITE) {
  const { context, page, rest } = await session(env.TEST_BOARD_EMAIL, env.TEST_BOARD_PASSWORD, 'board')
  boardRest = rest
  await page.goto(`${origin}/events/new`); await page.waitForLoadState('networkidle').catch(() => {})
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date())
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  await page.fill('input[autocomplete="off"], form input:not([type]):first-of-type', 'Prova QA 3').catch(() => {})
  await page.locator('form input').first().fill('Prova QA 3').catch(() => {})
  await page.fill('input[type=date]', tomorrow)
  const times = page.locator('input[type=time]')
  await times.nth(0).fill('20:00'); await times.nth(1).fill('21:30')
  const chips = page.locator('form .chips.wrap button.chip')
  for (let i = 0; i < await chips.count(); i++) { const c = chips.nth(i); if ((await c.getAttribute('aria-pressed')) === 'false' && !/Nessuna|Grande|Piccola/.test(await c.innerText())) await c.click() }
  await page.click('form button[type=submit]')
  await page.waitForURL(/\/events\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {})
  const id = (page.url().match(/events\/([0-9a-f-]{36})/) ?? [])[1]
  created = id ?? null
  say(Boolean(id), `board: made the event "Prova QA 3" for tomorrow${id ? '' : ' (the form did not lead to an event page)'}`)
  await context.close()
}

// 1. The player: the number of events without an answer is the same on the banner, in the bell, on Home and on Eventi, and equals the database.
{
  const { context, page, rest, errors } = await session(env.TEST_PLAYER_EMAIL, env.TEST_PLAYER_PASSWORD, 'player')
  const me = (await rest('profiles?select=id&limit=1000')).length >= 0 ? null : null
  const user = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token')); return JSON.parse(localStorage.getItem(k)).user.id })
  const [events, answers, mine, off] = await Promise.all([
    rest(`events?select=id,starts_at,ends_at,cancelled_at,event_groups(group_id)&cancelled_at=is.null&ends_at=gt.${new Date().toISOString()}&starts_at=lt.${weekEndIso()}`),
    rest(`attendance_answers?select=event_id&user_id=eq.${user}`),
    rest(`group_members?select=group_id&user_id=eq.${user}`),
    rest(`attendance_records?select=event_id&user_id=eq.${user}&status=eq.not_called_up`),
  ])
  const answered = new Set([...answers, ...off].map((x) => x.event_id))
  const groups = new Set(mine.map((x) => x.group_id))
  const expected = events.filter((e) => !answered.has(e.id) && e.event_groups.some((g) => groups.has(g.group_id))).length
  // The banner is not shown on Home and Eventi (their own lists say it), so it is read on Membri.
  await page.goto(`${origin}/members`); await page.waitForLoadState('networkidle').catch(() => {})
  const banner = await page.locator('.banners .banner[role=status] > span').first().innerText().catch(() => '')
  const bannerN = /Hai 1 evento/.test(banner) ? 1 : Number((banner.match(/Hai (\d+) eventi/) ?? [])[1] ?? 0)
  await page.click('.top .bell summary')
  const bell = await page.locator('.top .bell-list').innerText()
  await page.keyboard.press('Escape')
  const bellN = /Hai 1 evento/.test(bell) ? 1 : Number((bell.match(/Hai (\d+) eventi/) ?? [])[1] ?? 0)
  await page.goto(`${origin}/`); await page.waitForLoadState('networkidle').catch(() => {})
  const homeN = Number(await page.locator('#home-pending .count').innerText().catch(() => '0'))
  await page.goto(`${origin}/events`); await page.waitForLoadState('networkidle').catch(() => {})
  await page.setViewportSize({ width: 1280, height: 800 })
  const eventsN = Number(await page.locator('.todo .count').innerText().catch(() => '0'))
  say(bannerN === expected && bellN === expected && homeN === expected && eventsN === expected, `player: events without an answer this week: database ${expected}, banner ${bannerN}, bell ${bellN}, Home ${homeN}, Eventi ${eventsN}`)
  say(errors.length === 0, `player: no script errors (${errors.length})`)
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of ['/profile/notifications', '/profile/documents', '/profile/absences', '/stats', '/campionato']) {
    await page.goto(origin + path); await page.waitForLoadState('networkidle').catch(() => {})
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
    const broken = await page.locator('main .error[role=alert]').count()
    say(!sideways && !broken, `player: ${path} opens without sideways scroll or an error message`)
  }
  await context.close()
}

// 2. The board in the staff views: nothing about the person's own events or certificate.
for (const view of ['board', 'coach']) {
  const { context, page } = await session(env.TEST_BOARD_EMAIL, env.TEST_BOARD_PASSWORD, view)
  await page.goto(`${origin}/members`); await page.waitForLoadState('networkidle').catch(() => {})
  say((await page.locator('.banners .banner:visible').count()) === 0, `board in the ${view} view: no banner on Membri`)
  await page.click('.top .bell summary')
  say(!/senza risposta/.test(await page.locator('.top .bell-list').innerText()), `board in the ${view} view: the bell has no events without an answer`)
  await context.close()
}

if (created) {
  const { context, page } = await session(env.TEST_BOARD_EMAIL, env.TEST_BOARD_PASSWORD, 'board')
  const token = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token')); return JSON.parse(localStorage.getItem(k)).access_token })
  const res = await fetch(`${env.TEST_SUPABASE_URL}/rest/v1/events?id=eq.${created}&title=eq.Prova%20QA%203`, { method: 'DELETE', headers: { apikey: env.TEST_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, Prefer: 'return=representation' } })
  const gone = await res.json()
  say(Array.isArray(gone) && gone.length === 1, 'board: removed the event "Prova QA 3" that this run made, and nothing else')
  await context.close()
}
await browser.close()
server.close()
console.log(lines.join('\n'))
process.exit(lines.some((l) => l.startsWith('FAIL')) ? 1 : 0)
