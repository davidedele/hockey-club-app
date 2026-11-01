// Service worker: keeps the app files so the app opens like an installed app, also with a weak or
// missing connection. It only handles the app's own files. Data calls to the database, to the
// calendar feed and to anything on another address are never touched or stored here.
const SHELL = 'shell-v1'
const FILES = 'files-v1'
const MAX_FILES = 80
// The saved copy of the next events, line-ups and plans for offline use (written and read by the app itself,
// see src/lib/offline.ts). The worker never fills it. It only deletes it, when the app asks (sign out, removed
// person) and when it is installed again, so nothing of a person outlives their session.
const OFFLINE = 'offline-data-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(SHELL).then((cache) => cache.add(new Request('/index.html', { cache: 'reload' }))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== SHELL && n !== FILES && n !== OFFLINE).map((n) => caches.delete(n))))
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'purge-offline') event.waitUntil(caches.delete(OFFLINE))
})

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

// Push notifications: the server sends a short title, a line and a path (see send-reminders/push.ts).
// Nothing else is shown, and tapping opens that path in the app.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // A message that is not JSON still shows something.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Hockey Club', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
