import { readableInk } from '../lib/colour'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import NextPanel from '../components/NextPanel'
import PageHeader from '../components/PageHeader'
import { errorText, t } from '../i18n'
import { useClub } from '../lib/club'
import { certificateState } from '../lib/documents'
import { useGroupFilter } from '../lib/groupfilter'
import { prettyName } from '../lib/league'
import { useSession } from '../lib/session'
import { unanswered } from '../lib/unanswered'
import { supabase } from '../lib/supabase'
import { formatDay, formatShortDay, formatTime } from '../lib/time'
import type { Answer, EventRow, Group, LeagueMatch, LeagueStanding, MemberDocument } from '../lib/types'

interface Announcement { id: string; title: string; created_at: string }
const SHOWN = 3

// The greeting changes with the time of day on an Italian clock.
function greeting(name: string): string {
  const hour = Number(new Intl.DateTimeFormat('it-IT', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Rome' }).format(new Date()))
  const key = hour >= 5 && hour < 13 ? 'home.morning' : hour >= 13 && hour < 18 ? 'home.afternoon' : 'home.evening'
  return t(key, { name })
}

// The home: what the person needs at a glance, each part opening the page where it is handled.
// The next event can be answered here, as on the events page.
export default function Home() {
  const { profile, isStaff } = useSession()
  // Being present at an event is a player thing: the answer buttons and the list of events to answer are in the Giocatore view only (decision 93).
  const asPlayer = !isStaff
  const club = useClub()
  const { groupId } = useGroupFilter()
  const [events, setEvents] = useState<EventRow[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [myGroups, setMyGroups] = useState<number[]>([])
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map())
  const [notCalled, setNotCalled] = useState<Set<string>>(new Set())
  const [count, setCount] = useState<number | undefined>()
  const [news, setNews] = useState<Announcement[]>([])
  const [matches, setMatches] = useState<LeagueMatch[]>([])
  const [standings, setStandings] = useState<LeagueStanding[]>([])
  const [docs, setDocs] = useState<MemberDocument[]>([])
  const [members, setMembers] = useState<number | null>(null)
  const [missing, setMissing] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!profile) return
    const now = new Date().toISOString()
    const [e, g, m, a, r, n, lm, ls] = await Promise.all([
      supabase.from('events').select('*, event_groups(group_id)').gt('ends_at', now).order('starts_at').limit(60),
      supabase.from('groups').select('*').order('id'),
      supabase.from('group_members').select('group_id').eq('user_id', profile.id),
      supabase.from('attendance_answers').select('event_id, answer').eq('user_id', profile.id),
      supabase.from('attendance_records').select('event_id').eq('user_id', profile.id).eq('status', 'not_called_up'),
      supabase.from('announcements').select('id, title, created_at').order('created_at', { ascending: false }).limit(SHOWN),
      supabase.from('league_matches').select('*').not('home_score', 'is', null).order('starts_at', { ascending: false }).limit(200),
      supabase.from('league_standings').select('*').order('position'),
    ])
    setEvents((e.data ?? []) as EventRow[])
    setGroups((g.data ?? []) as Group[])
    setMyGroups(((m.data ?? []) as { group_id: number }[]).map((x) => x.group_id))
    setAnswers(new Map(((a.data ?? []) as { event_id: string; answer: Answer }[]).map((x) => [x.event_id, x.answer])))
    setNotCalled(new Set(((r.data ?? []) as { event_id: string }[]).map((x) => x.event_id)))
    setNews((n.data ?? []) as Announcement[])
    setMatches((lm.data ?? []) as LeagueMatch[])
    setStandings((ls.data ?? []) as LeagueStanding[])
    if (isStaff) {
      const [d, p, u] = await Promise.all([
        supabase.from('member_documents').select('*').eq('kind', 'medical_certificate'),
        supabase.from('profiles').select('id'),
        supabase.rpc('unanswered_people', { p_days: 7 }),
      ])
      setDocs((d.data ?? []) as MemberDocument[])
      setMembers(((p.data ?? []) as { id: string }[]).length)
      setMissing(((u.data ?? []) as unknown[]).length)
    }
    setLoaded(true)
  }, [profile, isStaff])

  useEffect(() => {
    void load()
  }, [load])

  const live = useMemo(() => events.filter((e) => !e.cancelled_at), [events])
  const mineOnly = (e: EventRow) => e.event_groups.some((x) => myGroups.includes(x.group_id))
  const inView = (e: EventRow) => groupId === null || e.event_groups.some((x) => x.group_id === groupId)
  const next = live.find((e) => mineOnly(e) && inView(e)) ?? live.find(inView)
  // The same events as the banner, the bell and the Eventi heading: this week, until Monday 00:00 (decision 92).
  const pending: EventRow[] = asPlayer ? unanswered({ events, answers, notCalledUp: notCalled, myGroups }).inWindow : []

  useEffect(() => {
    if (!next) return
    void supabase.rpc('event_present_counts', { p_event_ids: [next.id] }).then(({ data }) => {
      setCount(((data ?? []) as { present: number }[])[0]?.present)
    })
  }, [next?.id, answers]) // eslint-disable-line react-hooks/exhaustive-deps

  async function answer(e: EventRow, value: Answer) {
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('answer_attendance', { p_event_id: e.id, p_answer: value })
    if (error) setError(errorText(error))
    else {
      setAnswers(new Map(answers).set(e.id, value))
      window.dispatchEvent(new Event('attendance-changed'))
    }
    setBusy(false)
  }

  // The league part: the chosen group, or the person's own group with a league team.
  const linked = groups.filter((g) => g.league_team && (g.league_championships ?? []).length)
  const team = linked.find((g) => g.id === groupId) ?? linked.find((g) => myGroups.includes(g.id)) ?? linked[0]
  const last = team ? matches.find((x) => x.home === team.league_team || x.away === team.league_team) : undefined
  const row = team ? standings.find((s) => s.team === team.league_team && (team.league_championships ?? []).includes(s.championship_id)) : undefined

  const groupName = (e: EventRow) => e.event_groups.map((x) => groups.find((g) => g.id === x.group_id)?.name).filter(Boolean).join(', ')
  const colours = (e: EventRow): CSSProperties | undefined => {
    const g = e.event_groups.map((x) => groups.find((y) => y.id === x.group_id)).find((y) => y?.game_dark && y?.game_light)
    return g ? ({ '--team-dark': g.game_dark, '--team-light': g.game_light, '--band-ink': readableInk(g.game_dark) } as CSSProperties) : undefined
  }
  const certs = isStaff ? [...new Set(docs.map((d) => d.user_id))].map((id) => certificateState(docs.find((d) => d.user_id === id)).level) : []
  const certSoon = certs.filter((l) => l === 'soon').length
  const certBad = members === null ? null : members - certs.filter((l) => l === 'ok' || l === 'soon').length

  if (!profile) return null
  const dash = '–'

  return (
    <div className="page home-page">
      <PageHeader title={greeting(profile.first_name)} description={formatDay(new Date().toISOString())} />
      {error && <p className="error" role="alert">{error}</p>}

      <div className="home-grid">
        <div className="home-main">
          {next ? (
            <NextPanel club={club.name || t('app.name')} colours={colours(next)} event={next} groups={groupName(next)} mine={answers.get(next.id) ?? null} count={count} canAnswer={asPlayer && mineOnly(next)} busy={busy} onAnswer={(v) => void answer(next, v)} />
          ) : (
            loaded && <section className="card"><h2>{t('home.next')}</h2><p className="hint">{t('events.empty')}</p></section>
          )}

          {asPlayer && <section className="card" aria-labelledby="home-pending">
            <div className="card-head">
              <h2 id="home-pending">{t('dash.todo')}{loaded && pending.length > 0 && <span className="count">{pending.length}</span>}</h2>
              <Link to="/events">{t('home.toEvents')}</Link>
            </div>
            {!loaded ? <p className="hint">{dash}</p> : pending.length === 0 ? <p className="hint">{t('dash.allDone')}</p> : (
              <ul className="home-list">
                {pending.slice(0, SHOWN).map((e) => (
                  <li key={e.id}>
                    <Link to={`/events/${e.id}`}>
                      <span className="hl-when">{formatShortDay(e.starts_at)} <strong>{formatTime(e.starts_at)}</strong></span>
                      <span className="hl-what">{e.type === 'game' && e.opponent ? t('events.vs', { club: club.name || t('app.name'), opponent: e.opponent }) : e.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {pending.length > SHOWN && <p className="hint">{t('home.pendingMore', { n: String(pending.length - SHOWN) })}</p>}
          </section>}
        </div>

        <div className="home-side">
          <section className="card" aria-labelledby="home-news">
            <div className="card-head">
              <h2 id="home-news">{t('ann.title')}</h2>
              <Link to="/announcements">{t('home.allNews')}</Link>
            </div>
            {!loaded ? <p className="hint">{dash}</p> : news.length === 0 ? <p className="hint">{t('home.noNews')}</p> : (
              <ul className="home-list">
                {news.map((a) => (
                  <li key={a.id}>
                    <Link to="/announcements">
                      <span className="hl-when">{formatShortDay(a.created_at)}</span>
                      <span className="hl-what">{a.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {team && (
            <section className="card" aria-labelledby="home-league">
              <div className="card-head">
                <h2 id="home-league">{t('home.league', { group: team.name })}</h2>
                <Link to="/campionato">{t('champ.title')}</Link>
              </div>
              <dl className="home-facts">
                <div>
                  <dt>{t('home.position')}</dt>
                  <dd>{row ? t('home.positionValue', { pos: String(row.position), points: String(row.points) }) : dash}</dd>
                </div>
                <div>
                  <dt>{t('home.lastResult')}</dt>
                  <dd>
                    {last ? (
                      <Link to={`/campionato/partita/${last.id}`}>
                        {prettyName(last.home)} {last.home_score} : {last.away_score} {prettyName(last.away)}
                      </Link>
                    ) : dash}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {isStaff && (
            <section className="card" aria-labelledby="home-staff">
              <h2 id="home-staff">{t('home.staff')}</h2>
              <dl className="home-facts">
                <div>
                  <dt>{t('home.noAnswer')}</dt>
                  <dd><Link to="/attendance?tab=missing">{missing === null ? dash : t(missing === 1 ? 'home.peopleOne' : 'home.peopleMany', { n: String(missing) })}</Link></dd>
                </div>
                <div>
                  <dt>{t('home.certBad')}</dt>
                  <dd><Link to="/members">{certBad === null ? dash : t(certBad === 1 ? 'home.peopleOne' : 'home.peopleMany', { n: String(certBad) })}</Link></dd>
                </div>
                <div>
                  <dt>{t('home.certSoon')}</dt>
                  <dd><Link to="/members">{members === null ? dash : t(certSoon === 1 ? 'home.peopleOne' : 'home.peopleMany', { n: String(certSoon) })}</Link></dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
