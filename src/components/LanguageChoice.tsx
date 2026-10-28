import { chooseLanguage, currentLanguage, LANGUAGES, t, type Language } from '../i18n'

const NAMES: Record<Language, string> = { it: 'Italiano', en: 'English' }

// The language of the app, kept in this browser. Changing it loads the page again.
export default function LanguageChoice() {
  const now = currentLanguage()
  return (
    <section aria-labelledby="language-title">
      <h2 id="language-title">{t('language.title')}</h2>
      <div className="chips wrap">
        {LANGUAGES.map((code) => (
          <button
            type="button"
            key={code}
            className={code === now ? 'chip on' : 'chip'}
            aria-pressed={code === now}
            lang={code}
            onClick={() => { if (code !== now) chooseLanguage(code) }}
          >
            {NAMES[code]}
          </button>
        ))}
      </div>
      <p className="hint">{t('language.hint')}</p>
    </section>
  )
}
