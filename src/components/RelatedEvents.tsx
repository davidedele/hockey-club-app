import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { t, errorText } from '../i18n'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/time'
import type { EventRow } from '../lib/types'
export default function RelatedEvents({event,staff}:{event:EventRow;staff:boolean}){
 const [related,setRelated]=useState<EventRow[]>([])
 const [error,setError]=useState('')
 useEffect(()=>{let active=true;const root=event.parent_event_id??event.id;void supabase.from('events').select('*,event_groups(group_id)').or(`id.eq.${root},parent_event_id.eq.${root}`).order('starts_at').then(r=>{if(!active)return;if(r.error)setError(errorText(r.error));else{setError('');setRelated((r.data??[]) as EventRow[])}});return()=>{active=false}},[event.id,event.parent_event_id])
 if(!staff&&!event.parent_event_id&&related.length<2&&!error)return null
 return <section className="linked-event-note"><h2>{t('linked.title')}</h2><p className="hint">{t('linked.independent')}</p>{error&&<p className="error" role="alert">{error}</p>}<ol className="related-events">{related.map(r=><li key={r.id} className={r.id===event.id?'current':''}><Link to={`/events/${r.id}`}>{r.title}</Link><span>{formatDay(r.starts_at)} · {formatTime(r.starts_at)}{r.cancelled_at?` · ${t('events.cancelled')}`:''}</span></li>)}</ol>{staff&&!event.parent_event_id&&<div className="actions"><Link className="button secondary" to={`/events/new?parent=${event.id}&position=before`}>{t('linked.before')}</Link><Link className="button secondary" to={`/events/new?parent=${event.id}&position=after`}>{t('linked.after')}</Link></div>}</section>
}
