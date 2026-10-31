import { useCallback, useEffect, useState } from 'react'
import { isInstalled, isIos } from './pwa'
import { supabase } from './supabase'

// The public half of the push key pair. The private half stays a secret of the server function.
const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

// The base64 key of the browser's push service, as the bytes it wants.
export function keyBytes(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export type PushState =
  | 'unsupported' // this browser cannot receive push
  | 'needsInstall' // an iPhone where the app is not on the home screen yet
  | 'notConfigured' // the club has not set the push keys
  | 'denied' // the person said no in the browser
  | 'off' // possible, not switched on here
  | 'on'

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

// What can be done on this device. On an iPhone push works only for the app on the home screen
// (iOS 16.4 or later), and only after the person taps a button to allow it.
export function usePush() {
  const [state, setState] = useState<PushState>('off')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    if (isIos() && !isInstalled()) return setState('needsInstall')
    if (!pushSupported()) return setState('unsupported')
    if (!PUBLIC_KEY) return setState('notConfigured')
    if (Notification.permission === 'denied') return setState('denied')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off')
    } catch {
      setState('off')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function enable() {
    setBusy(true)
    setError(false)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return await refresh()
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY!) as BufferSource }))
      const json = sub.toJSON()
      const { error: e } = await supabase.rpc('save_push_subscription', { p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth })
      if (e) throw e
    } catch {
      setError(true)
    }
    await refresh()
    setBusy(false)
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
    } catch {
      setError(true)
    }
    await refresh()
    setBusy(false)
  }

  return { state, busy, error, enable, disable }
}
