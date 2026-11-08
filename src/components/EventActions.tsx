import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { errorText, t } from '../i18n'
import { supabase } from '../lib/supabase'
import { formatDay } from '../lib/time'
import type { EventRow, EventScope } from '../lib/types'
import { ConfirmDialog } from './ConfirmAction'
import EventScopeSelect from './EventScopeSelect'
export interface ScopedEvent { id: string; title: string; starts_at: string; ends_at: string }
export function scopeSummary(rows: ScopedEvent[]) {
  return rows.length ? t('series.summary', { n: String(rows.length), from: formatDay(rows[0].starts_at), to: formatDay(rows[rows.length - 1].starts_at) }) : ''
}
export default function EventActions({ event, onChanged }: { event: EventRow; onChanged: (deleted: boolean) => void }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 })
  const menuList = useRef<HTMLDivElement>(null)
  const [action, setAction] = useState<'cancel' | 'restore' | 'delete' | null>(null)
  const [scope, setScope] = useState<EventScope>('one')
  const [rows, setRows] = useState<ScopedEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!action) return
    let current = true
    setLoading(true); setRows([]); setError('')
    void supabase.rpc('event_scope', { p_event_id: event.id, p_scope: scope }).then(({ data, error }) => {
      if (!current) return
      if (error) setError(errorText(error))
      else if (!data?.length) setError(t('error.event_scope_changed'))
      else setRows(data as ScopedEvent[])
      setLoading(false)
    })
    return () => { current = false }
  }, [action, event.id, scope])
  function closeMenu() { if (menu.current) menu.current.open = false; setMenuOpen(false) }
  useEffect(() => {
    if (!menuOpen) return
    menuList.current?.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true })
    const closeOutside = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !menuList.current?.contains(e.target as Node)) closeMenu() }
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        closeMenu(); menu.current?.querySelector('summary')?.focus({ preventScroll: true })
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && menuList.current?.contains(document.activeElement)) {
        e.preventDefault()
        const items = Array.from(menuList.current.querySelectorAll<HTMLElement>('a, button'))
        const at = items.indexOf(document.activeElement as HTMLElement)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus({ preventScroll: true })
      }
    }
    const closeOnScroll = () => closeMenu()
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', closeOnScroll, true)
    window.addEventListener('resize', closeOnScroll)
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', closeOnScroll, true); window.removeEventListener('resize', closeOnScroll) }
  }, [menuOpen])
  function open(next: typeof action) { closeMenu(); setRows([]); setLoading(true); setScope('one'); setAction(next) }
  async function run() {
    if (!action || !rows.length) return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('manage_events', { p_event_id: event.id, p_scope: scope, p_action: action, p_expected_count: rows.length })
    if (error) setError(errorText(error))
    else { setAction(null); window.dispatchEvent(new Event('attendance-changed')); onChanged(action === 'delete') }
    setBusy(false)
  }
  const title = action === 'delete' ? t('event.deleteTitle') : action === 'restore' ? t('event.restore') : t('event.cancelTitle')
  return <>
    <details className="ev-menu event-actions" ref={menu} onToggle={(e) => {
      const opened = e.currentTarget.open
      if (opened) {
        const box = e.currentTarget.querySelector('summary')!.getBoundingClientRect()
        setMenuPosition({ left: Math.max(8, Math.min(box.right - 208, window.innerWidth - 216)), top: box.bottom + 148 <= window.innerHeight ? box.bottom + 4 : Math.max(8, box.top - 148) })
      }
      setMenuOpen(opened)
    }}>
      <summary aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`${t('event.menu')}: ${event.title}`}><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></summary>
    </details>
    {menuOpen && createPortal(<div ref={menuList} role="menu" aria-label={`${t('event.menu')}: ${event.title}`} className="ev-menu-list event-actions-list" style={{ position: 'fixed', ...menuPosition, right: 'auto', width: 208 }}><Link role="menuitem" to={`/events/${event.id}/edit`} onClick={closeMenu}>{t('event.edit')}</Link>
        <button type="button" role="menuitem" onClick={() => open(event.cancelled_at ? 'restore' : 'cancel')}>{event.cancelled_at ? t('event.restore') : t('event.cancel')}</button>
        <button type="button" role="menuitem" className="danger-text" onClick={() => open('delete')}>{t('event.deleteStart')}</button>
      </div>, document.body)}
    <ConfirmDialog open={action !== null} title={title} body={t('series.actionSummary', { title: event.title, summary: scopeSummary(rows) })}
      busy={busy} confirmDisabled={loading || rows.length === 0} closeOnChoose={false} choices={[{ label: title, onChoose: () => void run() }]} onClose={() => { if (!busy) { setAction(null); menu.current?.querySelector('summary')?.focus({ preventScroll: true }) } }}>
      {event.series_id && <EventScopeSelect value={scope} onChange={(value) => { setRows([]); setLoading(true); setScope(value) }} disabled={busy} />}
      {action === 'delete' && <p className="hint">{t('series.actionHelp')}</p>}
      {loading && <p role="status" className="hint">{t('common.loading')}</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </ConfirmDialog>
  </>
}
