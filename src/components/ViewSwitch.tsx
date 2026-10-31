import { t, type MessageKey } from '../i18n'
import { useSession, type View } from '../lib/session'
import MenuSelect from './MenuSelect'

// For people with more than one role: look at the app as the board, as a coach or as a player.
// It only changes what is shown; what the person may do stays tied to the real roles.
export default function ViewSwitch({ compact = false }: { compact?: boolean }) {
  const { view, views, setView } = useSession()
  if (views.length < 2) return null
  const icon = compact ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
  ) : undefined
  return (
    <MenuSelect
      className={compact ? 'view-switch compact' : 'view-switch'}
      label={t('view.label')}
      value={view}
      options={views.map((v) => ({ value: v as View, label: t(`view.${v}` as MessageKey) }))}
      onChange={setView}
      icon={icon}
      align="end"
    />
  )
}
