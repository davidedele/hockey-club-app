// The substitution timer (V10): which line is on the ice, since when, and how long each line has played.
// Everything is kept on the phone; nothing is saved.
export interface Shifts {
  onIce: string | null
  since: number | null
  totals: Record<string, number>
}

export const emptyShifts = (): Shifts => ({ onIce: null, since: null, totals: {} })

// Closes the shift in progress, adding its time to the line that was on.
function close(s: Shifts, now: number): Record<string, number> {
  if (s.onIce === null || s.since === null) return s.totals
  return { ...s.totals, [s.onIce]: (s.totals[s.onIce] ?? 0) + Math.max(0, now - s.since) }
}

// A line goes on the ice; the one that was on goes off. Tapping the line already on changes nothing.
export function putOn(s: Shifts, key: string, now: number): Shifts {
  if (s.onIce === key) return s
  return { onIce: key, since: now, totals: close(s, now) }
}

export function stop(s: Shifts, now: number): Shifts {
  return { onIce: null, since: null, totals: close(s, now) }
}

// Milliseconds the line has been on in its current shift, and in the whole game.
export const shiftMs = (s: Shifts, key: string, now: number) => (s.onIce === key && s.since !== null ? Math.max(0, now - s.since) : 0)
export const totalMs = (s: Shifts, key: string, now: number) => (s.totals[key] ?? 0) + shiftMs(s, key, now)

export function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
