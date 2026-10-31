import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

export interface ShellItem {
  to: string
  label: string
  // A short state shown on the right of the item, such as the documents status.
  extra?: ReactNode
}

const Chevron = () => (
  <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
)

// A section with sub pages, such as the settings or the profile: a card with the list of sub pages
// on the left and the open sub page on the right. The list stays in view on every sub page.
// On phones the list is the first page of the section and each sub page opens on its own.
export default function SectionShell(props: {
  base: string
  label: string
  card?: ReactNode
  items: ShellItem[]
  foot?: ReactNode
  // What the section shows on computers when no sub page is chosen, and which item that is.
  index?: ReactNode
  indexTo?: string
}) {
  const { base, label, card, items, foot, index, indexTo } = props
  const { pathname } = useLocation()
  const atIndex = pathname.replace(/\/$/, '') === base
  return (
    <div className={`page section-shell${atIndex ? ' at-index' : ''}`}>
      <aside className="shell-nav">
        {card}
        <nav aria-label={label}>
          <ul>
            {items.map((i) => (
              <li key={i.to}>
                <NavLink to={i.to} className={({ isActive }) => (isActive || (atIndex && i.to === indexTo) ? 'active' : undefined)}>
                  <span className="sl">{i.label}</span>
                  {i.extra && <span className="sx">{i.extra}</span>}
                  <Chevron />
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {foot}
      </aside>
      <div className="shell-content">{atIndex ? index : <Outlet />}</div>
    </div>
  )
}
