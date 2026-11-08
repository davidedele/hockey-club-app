import { t } from '../i18n'
import { eventLocation, mapsUrl } from '../lib/maps'
import type { EventType, Rink } from '../lib/types'

// "Apri in Mappe": opens the venue in Apple Maps on an iPhone and in Google Maps elsewhere.
// Shows nothing for an event with no place at all.
export default function MapsButton({ rink, venue, eventType = 'game' }: { rink?: Rink | null; venue?: string | null; eventType?: EventType }) {
  const query = eventLocation({ type: eventType, venue: venue ?? null }, rink).query
  if (!query) return null
  return (
    <a className="button secondary maps-button" href={mapsUrl(query)} target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
      {t('maps.open')}
      <span className="sr-only"> {query}</span>
    </a>
  )
}
