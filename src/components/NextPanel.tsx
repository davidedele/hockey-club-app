import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n'
import { jerseyName, useClub } from '../lib/club'
import { useRinks } from '../lib/rinks'
import MapsButton from './MapsButton'
import { formatDay, formatTime } from '../lib/time'
import type { Answer, EventRow } from '../lib/types'

// The next event as a large panel: when, where, the meetup, and the person's own answer.
// On game day it uses the team's colours. Shown on the home and on the events page.
export default function NextPanel(props: { club: string; colours: CSSProperties | undefined; event: EventRow; groups: string; mine: Answer | null; count: number | undefined; canAnswer: boolean; busy: boolean; onAnswer: (v: Answer) => void }) {
  const { event: e, mine } = props
  const club = useClub()
  const rink = useRinks().find((r) => r.id === e.rink_id) ?? null
  const game = e.type === 'game'
  const started = new Date(e.starts_at).getTime() <= Date.now()
  const label = started ? t('events.now') : t(game ? 'events.nextGame' : 'events.nextTraining')
  return (
    <section className={game ? 'next game' : 'next'} style={game ? props.colours : undefined} aria-label={label}>
      {game && <div className="stripes" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>}
      <div className="next-in">
        <div className="label">
          <strong>{label}</strong>
          <span>{props.groups}</span>
        </div>
        {game && e.opponent && <div className="vs">{t('events.vs', { club: props.club, opponent: e.opponent })}</div>}
        <div className="day-line">{formatDay(e.starts_at)}</div>
        <div className="time">
          <span className="big">{formatTime(e.starts_at)}</span>{' '}
          <span className="until">{t('events.until', { time: formatTime(e.ends_at) })}</span>
        </div>
        <dl className="pair">
          <div>
            <dt>{t('event.meetup')}</dt>
            <dd>{e.meetup_at ? formatTime(e.meetup_at) : t('common.none')}</dd>
          </div>
          <div>
            <dt>{t('event.venue')}</dt>
            <dd>{e.venue || t('common.none')}</dd>
          </div>
          {game && e.jersey && (
            <div>
              <dt>{t('event.jersey')}</dt>
              <dd>{jerseyName(club, e.jersey)}</dd>
            </div>
          )}
        </dl>
        <MapsButton rink={rink} venue={e.venue} />
        {props.canAnswer && (
          <div className="answers">
            <button className={mine === 'present' ? 'answer on present' : 'answer'} aria-pressed={mine === 'present'} disabled={props.busy} onClick={() => props.onAnswer('present')}>{t('answer.present')}</button>
            <button className={mine === 'absent' ? 'answer on absent' : 'answer'} aria-pressed={mine === 'absent'} disabled={props.busy} onClick={() => props.onAnswer('absent')}>{t('answer.absent')}</button>
          </div>
        )}
        <div className="foot">
          <span role="status">{props.canAnswer ? t(mine ? 'events.saved' : 'events.notYet') : ''}</span>
          {props.count !== undefined && <span className="count">{t(props.count === 1 ? 'events.presentOne' : 'events.presentMany', { n: String(props.count) })}</span>}
        </div>
        <Link className="open" to={`/events/${e.id}`}>{t('events.details')}</Link>
      </div>
    </section>
  )
}
