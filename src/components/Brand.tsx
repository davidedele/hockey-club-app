import { t } from '../i18n'

// The club name with a small stick and puck, shown on the signed out pages.
export default function Brand() {
  return (
    <div className="brand">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 3 13 20H23" />
        <ellipse cx="21" cy="12.5" rx="4" ry="1.8" />
      </svg>
      <span>{t('app.name')}</span>
    </div>
  )
}
