import { t } from '../i18n'
import { useNewVersion } from '../lib/pwa'

// A line on every screen when a newer version of the app is online.
export default function UpdateBanner() {
  const found = useNewVersion()
  if (!found) return null
  return (
    <div className="banner" role="status">
      <span>{t('pwa.update')}</span>
      <button type="button" className="small" onClick={() => window.location.reload()}>{t('pwa.updateButton')}</button>
    </div>
  )
}
