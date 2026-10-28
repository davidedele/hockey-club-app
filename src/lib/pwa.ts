import { useEffect, useState } from 'react'

// The browser offers to install the app once, early, so it is kept for the install button.
interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let installEvent: InstallEvent | null = null
const listeners = new Set<() => void>()

export function startPwa() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    listeners.forEach((l) => l())
  })
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // The app works without it, only without the offline start.
      })
    })
  }
}

export const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

export function useInstall() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const update = () => setTick((n) => n + 1)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  return {
    canPrompt: installEvent !== null,
    prompt: async () => {
      if (!installEvent) return
      await installEvent.prompt()
      await installEvent.userChoice
      installEvent = null
      listeners.forEach((l) => l())
    },
  }
}

// The name of the main script in an app page, such as /assets/index-3fa9.js. It changes with every
// new version of the app, so two different names mean a new version is online.
export function findScriptSrc(html: string): string | null {
  const m = html.match(/<script[^>]*\ssrc="([^"]*\/assets\/[^"]+\.js)"/)
  return m ? m[1] : null
}

function currentScriptSrc(): string | null {
  const el = document.querySelector('script[type="module"][src*="/assets/"]')
  return el ? el.getAttribute('src') : null
}

// True when a newer version of the app is online. Checked when the app opens, when it comes back
// to the front, and every half hour.
export function useNewVersion(): boolean {
  const [found, setFound] = useState(false)
  useEffect(() => {
    const current = currentScriptSrc()
    if (!current) return
    let stop = false
    async function check() {
      try {
        const res = await fetch('/index.html', { cache: 'no-store' })
        const latest = findScriptSrc(await res.text())
        if (!stop && latest && latest !== current) setFound(true)
      } catch {
        // Offline: nothing to compare.
      }
    }
    const onShow = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onShow)
    const timer = window.setInterval(() => void check(), 30 * 60 * 1000)
    const first = window.setTimeout(() => void check(), 5000)
    return () => {
      stop = true
      document.removeEventListener('visibilitychange', onShow)
      window.clearInterval(timer)
      window.clearTimeout(first)
    }
  }, [])
  return found
}
