import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'

// A line when the phone has no connection, with the way to the saved copy (decision 137).
export default function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  if (!offline) return null
  return (
    <div className="banner" role="status">
      <span>{t('offline.banner')}</span>
      <Link to="/offline">{t('offline.open')}</Link>
    </div>
  )
}
