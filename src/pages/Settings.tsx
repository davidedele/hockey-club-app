import { Navigate } from 'react-router-dom'
import Crest from '../components/Crest'
import SectionShell from '../components/SectionShell'
import { t, type MessageKey } from '../i18n'
import { useClub } from '../lib/club'
import { useSession } from '../lib/session'
import ClubSettings from './ClubSettings'
import Invites from './Invites'

// The settings: club, groups, rinks, ice hours and invites for the board; invites only for coaches.
export default function Settings() {
  const { isStaff, isBoard, loading } = useSession()
  const club = useClub()
  if (!loading && !isStaff) return <Navigate to="/events" replace />
  const keys = isBoard ? ['club', 'documents', 'groups', 'rinks', 'ice', 'league', 'invites'] : ['invites']
  return (
    <SectionShell
      base="/settings"
      label={t('settings.title')}
      card={
        <div className="shell-card">
          <span className="shell-crest"><Crest /></span>
          <div>
            <p className="shell-title">{t('settings.title')}</p>
            <p className="hint">{club.name || t('app.name')}</p>
          </div>
        </div>
      }
      items={keys.map((k) => ({ to: `/settings/${k}`, label: t(`settings.${k}` as MessageKey) }))}
      indexTo={`/settings/${keys[0]}`}
      index={isBoard ? <ClubSettings /> : <Invites />}
    />
  )
}
