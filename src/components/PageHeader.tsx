import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCrumb } from '../lib/crumb'

// The top of every page: the title, an optional line under it and the page's own actions.
// A sub page also names its parent. On phones that is a back button above the title; on computers
// the breadcrumb in the top bar does the same, so the button is hidden there.
export default function PageHeader(props: {
  title: string
  back?: { to: string; label: string }
  description?: ReactNode
  actions?: ReactNode
  // The breadcrumb's last step, when it should differ from the title.
  crumb?: string
}) {
  const { title, back, description, actions, crumb } = props
  useCrumb(back ? crumb ?? title : '')
  return (
    <header className="page-head">
      {back && (
        <Link className="page-back" data-back to={back.to}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          {back.label}
        </Link>
      )}
      <div className="page-head-row">
        <div className="page-head-text">
          <h1>{title}</h1>
          {description && <p className="page-desc">{description}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </header>
  )
}
