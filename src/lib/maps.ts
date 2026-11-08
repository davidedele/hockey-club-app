import type { EventType, Rink } from './types'
// The link that opens a place in the maps app: Apple Maps on iPhone and iPad, Google Maps elsewhere.
// Both open the installed app. A place is the address of the rink when there is one, otherwise the
// name of the rink or the free text venue of the event.
export function isApple(agent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, touchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints): boolean {
  // An iPad asks for the desktop site and calls itself a Mac, but has a touch screen.
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && touchPoints > 1)
}

export function placeQuery(place: { address?: string | null; rink?: string | null; venue?: string | null }): string {
  const text = [place.address, place.address ? null : place.rink, place.address ? null : place.venue].find((x) => x && x.trim() !== '')
  return (text ?? '').trim()
}

export function mapsUrl(query: string, apple: boolean = isApple()): string {
  const q = encodeURIComponent(query)
  return apple ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`
}

// The place as a person reads it: the free text venue and the rink, written once each ("Agorà · Grande").
export function placeLabel(place: { venue?: string | null; rink?: string | null }): string {
  return [place.venue, place.rink].map((x) => (x ?? '').trim()).filter((x, i, all) => x !== '' && all.indexOf(x) === i).join(' · ')
}

// One address source for both the displayed training place and the map destination.
export function eventLocation(event: { type: EventType; venue: string | null }, rink?: Rink | null) {
  const rinkAddress = rink?.address?.trim() || ''
  const locked = event.type === 'training' && rinkAddress !== ''
  const venue = locked ? rinkAddress : event.venue?.trim() || ''
  const query = locked ? rinkAddress : venue || rinkAddress || rink?.name?.trim() || ''
  return { locked, venue, query, label: placeLabel({ venue, rink: rink?.name }) }
}
