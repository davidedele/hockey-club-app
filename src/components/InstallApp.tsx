import { useState } from 'react'
import { t } from '../i18n'
import { isInstalled, isIos, useInstall } from '../lib/pwa'

// How to put the app on the home screen of this phone.
export default function InstallApp() {
  const { canPrompt, prompt } = useInstall()
  const [busy, setBusy] = useState(false)
  return (
    <section aria-labelledby="install-title">
      <h2 id="install-title">{t('install.title')}</h2>
      {isInstalled() ? (
        <p className="hint">{t('install.done')}</p>
      ) : canPrompt ? (
        <button type="button" className="secondary small" disabled={busy} onClick={() => { setBusy(true); void prompt().finally(() => setBusy(false)) }}>{t('install.button')}</button>
      ) : (
        <p className="hint">{t(isIos() ? 'install.ios' : 'install.other')}</p>
      )}
    </section>
  )
}
