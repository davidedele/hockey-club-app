import { Link, useLocation } from 'react-router-dom'
import { t } from '../i18n'
import { useOwnRequirements } from '../lib/requirementdata'
import { needsAction, statusText } from '../lib/requirements'
import { useSession } from '../lib/session'

// A line on every screen while something the club asks of the person is still to do. It names the first thing and
// says how many more wait, then leads to the documents page.
export default function DocumentsBanner() {
  const { isStaff } = useSession()
  const location = useLocation()
  const items = useOwnRequirements()

  // A player thing: shown in the Giocatore view only (decision 106).
  if (isStaff || !items || location.pathname === '/profile/documents' || location.pathname.startsWith('/settings')) return null
  const todo = items.filter(needsAction)
  if (todo.length === 0) return null
  const first = todo[0]
  const text = todo.length === 1
    ? t('banner.reqOne', { title: first.req.title, status: statusText(first.req, first.answer, first.status) })
    : t('banner.reqMany', { n: String(todo.length) })
  return (
    <div className="banner doc-banner" role="status">
      <span>{text}</span>
      <Link to="/profile/documents">{t('docs.open')}</Link>
    </div>
  )
}
