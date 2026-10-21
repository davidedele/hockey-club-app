import { Link, Navigate } from 'react-router-dom'
import { t, type MessageKey } from '../i18n'
import { useSession } from '../lib/session'

// One place for staff settings: club, groups (board only) and invites.
export default function Settings() {
  const { isStaff, isBoard, loading } = useSession()
  if (!loading && !isStaff) return <Navigate to="/events" replace />
  const items: { to: string; key: string; show: boolean }[] = [
    { to: '/settings/club', key: 'club', show: true },
    { to: '/settings/groups', key: 'groups', show: isBoard },
    { to: '/settings/invites', key: 'invites', show: true },
  ]
  return (
    <div className="page narrow">
      <h1>{t('settings.title')}</h1>
      <ul className="list settings">
        {items.filter((i) => i.show).map((i) => (
          <li key={i.to}>
            <Link to={i.to}>
              <span className="settings-name">{t(`settings.${i.key}` as MessageKey)}</span>
              <span className="hint">{t(`settings.${i.key}Hint` as MessageKey)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
