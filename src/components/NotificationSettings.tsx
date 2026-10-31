import { useEffect, useState } from 'react'
import { errorText, t, type MessageKey } from '../i18n'
import { usePush } from '../lib/push'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'

const KINDS = ['reminder', 'changes', 'announcement', 'certificate'] as const
const CHANNELS = ['auto', 'both', 'push', 'email', 'off'] as const
type Kind = (typeof KINDS)[number]
type Channel = (typeof CHANNELS)[number]

// Where notifications reach the person: the button that allows them on this phone, and for each kind
// of notification the channel the person prefers.
export default function NotificationSettings() {
  const { profile } = useSession()
  const push = usePush()
  const [prefs, setPrefs] = useState<Map<string, Channel>>(new Map())
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    void supabase.from('notification_prefs').select('kind, channel').eq('user_id', profile.id).then(({ data }) => {
      setPrefs(new Map(((data ?? []) as { kind: string; channel: Channel }[]).map((x) => [x.kind, x.channel])))
    })
  }, [profile])

  async function choose(kind: Kind, channel: Channel) {
    setError('')
    const { error: e } = await supabase.rpc('set_notification_pref', { p_kind: kind, p_channel: channel })
    if (e) return setError(errorText(e))
    setPrefs(new Map(prefs).set(kind, channel))
  }

  return (
    <section aria-labelledby="push-title">
      <h2 id="push-title">{t('push.title')}</h2>
      {push.state === 'on' && (
        <>
          <p className="doc-status ok"><span className="dot" aria-hidden="true" />{t('push.on')}</p>
          <button type="button" className="secondary" disabled={push.busy} onClick={() => void push.disable()}>{t('push.disable')}</button>
        </>
      )}
      {push.state === 'off' && (
        <>
          <p className="hint">{t('push.intro')}</p>
          <button type="button" disabled={push.busy} onClick={() => void push.enable()}>{t('push.enable')}</button>
        </>
      )}
      {push.state === 'needsInstall' && <p className="hint">{t('push.needsInstall')}</p>}
      {push.state === 'denied' && <p className="hint">{t('push.denied')}</p>}
      {push.state === 'unsupported' && <p className="hint">{t('push.unsupported')}</p>}
      {push.state === 'notConfigured' && <p className="hint">{t('push.notConfigured')}</p>}
      {push.error && <p className="error" role="alert">{t('push.error')}</p>}

      <h2>{t('push.kinds')}</h2>
      <p className="hint">{t('push.kindsHint')}</p>
      {KINDS.map((kind) => (
        <div className="field" key={kind}>
          <label htmlFor={`pref-${kind}`}>{t(`push.kind.${kind}` as MessageKey)}</label>
          <select id={`pref-${kind}`} className="full" value={prefs.get(kind) ?? 'auto'} onChange={(e) => void choose(kind, e.target.value as Channel)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{t(`push.channel.${c}` as MessageKey)}</option>)}
          </select>
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
