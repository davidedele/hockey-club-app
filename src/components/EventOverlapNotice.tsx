import { useState } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { dayKey, formatShortDay, formatTime } from '../lib/time'
import type { EventOverlap } from '../lib/eventoverlap'
import Fold from './Fold'

export default function EventOverlapNotice({ overlaps, groupName }: {overlaps: EventOverlap[]; groupName: (id: number) => string}) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(5)
  if (!overlaps.length) return null
  return <div className="overlap-notice">
    <Fold id="overlaps" title={t('overlap.title')} summary={t(overlaps.length === 1 ? 'overlap.one' : 'overlap.many', {n:String(overlaps.length)})} open={open} onToggle={() => setOpen(!open)}>
      <p className="hint">{t('overlap.help')}</p>
      <ul className="list">
        {overlaps.slice(0,shown).map(({first,second,groups}) => <li key={`${first.id}:${second.id}`}>
          <div><span className="hint">{groups.map(groupName).join(', ')} · {formatShortDay(first.starts_at)}</span><br/>
          <Link to={`/events/${first.id}`}>{formatTime(first.starts_at)} {first.title}{first.opponent ? ` · ${first.opponent}` : ''}</Link><br/>
          <Link to={`/events/${second.id}`}>{dayKey(second.starts_at) !== dayKey(first.starts_at) ? `${formatShortDay(second.starts_at)} ` : ''}{formatTime(second.starts_at)} {second.title}{second.opponent ? ` · ${second.opponent}` : ''}</Link></div>
        </li>)}
      </ul>
      {shown < overlaps.length && <button type="button" className="link" onClick={() => setShown(shown+5)}>{t('overlap.more')}</button>}
    </Fold>
  </div>
}
