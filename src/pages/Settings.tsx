import { Link, Navigate } from 'react-router-dom'
import { t, type MessageKey } from '../i18n'
import { useSession } from '../lib/session'

// The board's settings: club, groups and invites. Coaches only have invites, so they go straight there.
export default function Settings() {
  const { isStaff, isBoard, loading } = useSession()
  if (!loading && !isStaff) return <Navigate to="/events" replace />
  if (!loading && !isBoard) return <Navigate to="/settings/invites" replace />
  const items: { to: string; key: string; show: boolean }[] = [
    { to: '/settings/club', key: 'club', show: isBoard },
    { to: '/settings/groups', key: 'groups', show: isBoard },
    { to: '/settings/rinks', key: 'rinks', show: isBoard },
    { to: '/settings/ice', key: 'ice', show: isBoard },
    { to: '/settings/invites', key: 'invites', show: true },
  ]
  return (
    <div className="page narrow">
      <h1>{t('settings.title')}</h1>
      <ul className="list settings">
        {items.filter((i) => i.show).map((i) => (
          <li key={i.to}>
            <Link to={i.to}>
              <span className="settings-text">
                <span className="settings-name">{t(`settings.${i.key}` as MessageKey)}</span>
                <span className="hint">{t(`settings.${i.key}Hint` as MessageKey)}</span>
              </span>
              <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
