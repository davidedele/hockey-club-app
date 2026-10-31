// Text on a colour chosen by the club (the game colours of a group): dark text on a light colour,
// white text on a dark one, so a yellow band is as readable as a black one.
export function readableInk(hex: string | null | undefined): '#111111' | '#ffffff' {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const luminance = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return luminance > 0.4 ? '#111111' : '#ffffff'
}
