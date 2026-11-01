import { useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Fold, { useFolds } from '../components/Fold'
import { t, type MessageKey } from '../i18n'
import { readCopy, usable, type OfflineCopy, type OfflineEvent } from '../lib/offline'
import { useGroupFilter } from '../lib/groupfilter'
import { useSession } from '../lib/session'
import { formatDay, formatShortDay, formatTime } from '../lib/time'

// What was saved on this phone, read only (decision 137). Shown when there is no signal. It always says that the data
// is not up to date and when it was saved.
export default function Offline() {
  const { session, unreachable } = useSession()
  const userId = session?.user.id
  const [copy, setCopy] = useState<OfflineCopy | null | undefined>(undefined)
  const folds = useFolds()
  const { inView } = useGroupFilter()

  useEffect(() => {
    let live = true
    void readCopy().then((c) => { if (live) setCopy(usable(c, userId, new Date()) ? c : null) })
    return () => { live = false }
  }, [userId])

  // Events that are not over yet. In the Giocatore view only the person's own groups show (decision 131); with no
  // connection the groups cannot be loaded, and the copy holds only what the person may read anyway.
  const events = useMemo(
    () => (copy?.events ?? []).filter((e) => Date.parse(e.ends_at) >= Date.now() && (unreachable || inView(e.group_ids))),
    [copy, unreachable, inView],
  )

  const summary = (e: OfflineEvent) => [formatTime(e.starts_at), e.venue, e.cancelled ? t('offline.cancelled') : e.answer ? t(`answer.${e.answer}` as MessageKey) : null].filter(Boolean).join(', ')

  return (
    <div className="page">
      <PageHeader title={t('offline.title')} back={unreachable ? undefined : { to: '/', label: t('nav.home') }} />
      <div className="box offline-note" role="status">
        <strong>{t('offline.stale')}</strong>
        {copy && <span>{t('offline.saved', { day: formatShortDay(copy.saved_at), time: formatTime(copy.saved_at) })}</span>}
      </div>
      <button type="button" className="secondary" onClick={() => window.location.reload()}>{t('offline.retry')}</button>

      {copy === null && <p className="hint">{t('offline.none')}</p>}
      {copy && events.length === 0 && <p className="hint">{t('offline.empty')}</p>}
      {events.length > 0 && <h2 className="sr-only">{t('offline.events')}</h2>}
      {events.map((e) => {
        const lineup = (copy?.lineups ?? []).filter((l) => l.event_id === e.id)
        const plan = (copy?.plans ?? []).find((p) => p.event_id === e.id)
        const title = e.type === 'game' && e.opponent ? `${t('eventType.game')}: ${e.opponent}` : e.title || t(`eventType.${e.type}` as MessageKey)
        return (
          <Fold key={e.id} id={e.id} title={`${formatShortDay(e.starts_at)} ${title}`} summary={summary(e)} open={folds.open === e.id} onToggle={() => folds.toggle(e.id)}>
            <dl className="off-lines">
              <div><dt>{t('offline.when')}</dt><dd>{formatDay(e.starts_at)}, {formatTime(e.starts_at)} {t('offline.to')} {formatTime(e.ends_at)}</dd></div>
              {e.meetup_at && <div><dt>{t('event.meetup')}</dt><dd>{formatTime(e.meetup_at)}</dd></div>}
              {e.venue && <div><dt>{t('event.venue')}</dt><dd>{e.venue}</dd></div>}
              {e.type === 'game' && e.home_away && <div><dt>{t('event.opponent')}</dt><dd>{e.opponent} ({t(e.home_away === 'home' ? 'event.home' : 'event.away')})</dd></div>}
              {e.cancelled && <div><dt>{t('offline.status')}</dt><dd>{t('offline.cancelled')}</dd></div>}
              {e.answer && <div><dt>{t('offline.yourAnswer')}</dt><dd>{t(`answer.${e.answer}` as MessageKey)}</dd></div>}
            </dl>
            {lineup.length > 0 && (
              <>
                <h3>{t('offline.lineup')}</h3>
                <ul className="list">
                  {lineup.sort((a, b) => a.slot.localeCompare(b.slot) || a.unit - b.unit).map((l) => (
                    <li key={`${l.slot}${l.unit}`} className="row">
                      <span>{l.slot === 'goalie' ? t('lineup.goalieN', { n: String(l.unit) }) : `${t(`slot.${l.slot}` as MessageKey)} ${l.unit}`}</span>
                      <span><span data-person-name>{l.name}</span>{l.jersey_number ? ` (${l.jersey_number})` : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {plan && (
              <>
                <h3>{t('plan.title')}</h3>
                {plan.notes && <p>{plan.notes}</p>}
                {plan.drills.length > 0 && (
                  <ol className="list">
                    {plan.drills.map((d) => <li key={d.step} className="row"><span>{d.title}</span>{d.minutes ? <span>{t('offline.minutes', { n: String(d.minutes) })}</span> : null}</li>)}
                  </ol>
                )}
              </>
            )}
          </Fold>
        )
      })}
      <p className="hint">{t('offline.rule')}</p>
    </div>
  )
}
