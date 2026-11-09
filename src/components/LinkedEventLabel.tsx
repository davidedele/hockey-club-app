import { Link } from 'react-router-dom'
import { t } from '../i18n'
import type { EventRow } from '../lib/types'
export default function LinkedEventLabel({event,events}:{event:EventRow;events:EventRow[]}){
 const parent=events.find(e=>e.id===event.parent_event_id)
 if(!event.parent_event_id)return null
 return <span className="linked-label"><Link to={`/events/${event.parent_event_id}`}>{t('linked.label',{title:parent?.title??t('linked.event')})}</Link></span>
}
