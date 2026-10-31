import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { t } from '../i18n'
import type { Notifications } from '../lib/notifications'

// What is new for the person, in one place: events to answer, announcements, new messages.
export default function Bell({ note }: { note: Notifications }) {
  const location = useLocation()
  const box = useRef<HTMLDetailsElement>(null)
  // The panel closes on a tap outside, on Escape (the focus goes back to the bell) and after a link is followed.
  // The listeners are always there and look at the element itself, so a quick key press after opening works.
  useEffect(() => {
    const close = (refocus: boolean) => {
      const el = box.current
      if (!el?.open) return
      el.open = false
      if (refocus) el.querySelector('summary')?.focus()
    }
    const outside = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) close(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [])
  const total = note.pending + note.announcements + note.threads.reduce((sum, x) => sum + x.unread, 0)
  return (
    // The key closes the list after a link is followed.
    <details className="bell" ref={box} key={location.pathname + location.search}>
      <summary aria-label={total > 0 ? t('bell.withCount', { n: String(total) }) : t('bell.title')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9zM10 20a2 2 0 0 0 4 0" />
        </svg>
        {total > 0 && <span className="bell-count" aria-hidden="true">{total > 9 ? '9+' : total}</span>}
      </summary>
      <div className="bell-list" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) { if (box.current) box.current.open = false } }}>
        <h2>{t('bell.title')}</h2>
        {total === 0 && <p className="hint">{t('bell.none')}</p>}
        {note.pending > 0 && <Link to="/events">{note.pending === 1 ? t('banner.one') : t('banner.many', { n: String(note.pending) })}</Link>}
        {note.announcements > 0 && <Link to="/announcements">{t(note.announcements === 1 ? 'bell.announcementsOne' : 'bell.announcements', { n: String(note.announcements) })}</Link>}
        {note.threads.map((x) => (
          <Link key={x.event_id} to={`/events/${x.event_id}?tab=discussion`}>{t(x.unread === 1 ? 'bell.threadOne' : 'bell.thread', { title: x.title, day: x.day, n: String(x.unread) })}</Link>
        ))}
      </div>
    </details>
  )
}
