// Service worker: keeps the app files so the app opens like an installed app, also with a weak or
// missing connection. It only handles the app's own files. Data calls to the database, to the
// calendar feed and to anything on another address are never touched or stored here.
const SHELL = 'shell-v1'
const FILES = 'files-v1'
const MAX_FILES = 80

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add(new Request('/index.html', { cache: 'reload' }))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== SHELL && n !== FILES).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html')

// Pages: the network first, so a new version shows at once; the saved page only when offline.
async function page(request) {
  try {
    const res = await fetch(request)
    if (res.ok && isHtml(res)) {
      const cache = await caches.open(SHELL)
      await cache.put('/index.html', res.clone())
    }
    return res
  } catch {
    const saved = await caches.match('/index.html')
    return saved || Response.error()
  }
}

// Built files have a new name whenever they change, so a saved copy is always right.
async function file(request) {
  const cache = await caches.open(FILES)
  const saved = await cache.match(request)
  if (saved) return saved
  const res = await fetch(request)
  // A missing file can come back as the app page; never keep that.
  if (res.ok && !isHtml(res)) {
    await cache.put(request, res.clone())
    const keys = await cache.keys()
    if (keys.length > MAX_FILES) await cache.delete(keys[0])
  }
  return res
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(page(request))
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(file(request))
  }
})
