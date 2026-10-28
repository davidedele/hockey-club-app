import { NavLink } from 'react-router-dom'
import { t } from '../i18n'

// Switches between the league page and the club's own statistics.
export default function SeasonTabs() {
  return (
    <nav className="segments" aria-label={t('champ.title')}>
      <NavLink to="/campionato">{t('champ.tabLeague')}</NavLink>
      <NavLink to="/stats">{t('champ.tabStats')}</NavLink>
    </nav>
  )
}
