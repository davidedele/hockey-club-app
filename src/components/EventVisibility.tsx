import { useState } from 'react'
import Fold from './Fold'
import { t, type MessageKey } from '../i18n'
import { EVENT_DETAILS } from '../lib/eventaccess'
import type { EventDetailKey } from '../lib/types'
export default function EventVisibility({ participant, observer, onParticipant, onObserver, game }: {
  game: boolean
  participant: EventDetailKey[]; observer: EventDetailKey[]
  onParticipant: (keys: EventDetailKey[]) => void; onObserver: (keys: EventDetailKey[]) => void
}) {
  const [open, setOpen] = useState(false)
  const summary = (keys: EventDetailKey[]) => keys.length === EVENT_DETAILS.length ? t('events.allDetails') : keys.length === 0 ? t('events.basicDetails') : t('visibility.selected', { n: String(keys.length) })
  return <div className="visibility-settings"><Fold id="event-visibility" title={t('visibility.title')} summary={t('visibility.summary', { invited: summary(participant), others: summary(observer) })} open={open} onToggle={() => setOpen(!open)}>
    <p className="hint">{t('visibility.help')}</p>
    <div className="visibility-audiences">
      {([{ title: 'visibility.invited', keys: participant, set: onParticipant }, { title: 'visibility.others', keys: observer, set: onObserver }] as const).map((audience) =>
        <fieldset key={audience.title}><legend>{t(audience.title)}</legend>{EVENT_DETAILS.filter((key) => game || key !== 'game').map((key) =>
          <label className="check" key={key}><input type="checkbox" checked={audience.keys.includes(key)} onChange={(e) => audience.set(e.target.checked ? [...audience.keys, key] : audience.keys.filter((k) => k !== key))} />{t(`visibility.${key}` as MessageKey)}</label>
        )}</fieldset>)}
    </div>
  </Fold></div>
}
