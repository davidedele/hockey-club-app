import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const SIZE = 256
const LINK_SECONDS = 3600

// Crops the photo to a square and shrinks it to 256 by 256 pixels as JPEG.
// Redrawing it also drops the photo's metadata, such as where it was taken.
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('photo')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('photo'))), 'image/jpeg', 0.85))
}

// Pictures are private, so each one is shown through a signed link that works for an hour.
// Links are kept for 50 minutes and then asked for again.
const cache = new Map<string, { url: string; at: number }>()
const fresh = (p: string) => {
  const hit = cache.get(p)
  return hit && Date.now() - hit.at < 50 * 60000 ? hit.url : null
}

export function useAvatarUrls(paths: (string | null | undefined)[]): Map<string, string> {
  const key = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort().join('|')
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    const wanted = key ? key.split('|') : []
    let live = true
    void (async () => {
      const missing = wanted.filter((p) => !fresh(p))
      if (missing.length) {
        const { data } = await supabase.storage.from('avatars').createSignedUrls(missing, LINK_SECONDS)
        for (const d of data ?? []) if (d.path && d.signedUrl) cache.set(d.path, { url: d.signedUrl, at: Date.now() })
      }
      if (live) setUrls(new Map(wanted.flatMap((p) => (fresh(p) ? [[p, fresh(p)!] as [string, string]] : []))))
    })()
    return () => {
      live = false
    }
  }, [key])
  return urls
}
