// Invented sample data for scripts/ui-check.mjs. Nothing here is real: the names, addresses and
// numbers are made up, so the checker can run without an account or a network and the repository
// holds no personal data. The signed in person (ME) is a board member who is also a coach.
// Dates are relative to the day the checker runs, so there are always events ahead and behind.

export const ME = '00000000-0000-4000-8000-000000000001'

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const eid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// A moment "days" from now at the given local hour and minute (Europe/Rome is close enough for samples).
function at(days, hour, minute = 0) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(hour - 1, minute, 0, 0)
  return d.toISOString()
}

const people = [
  { id: ME, first_name: 'Chiara', last_name: 'Ferri', jersey_number: null, position: null, groups: [1, 2] },
  { id: uid(2), first_name: 'Marco', last_name: 'Bianchi', jersey_number: 9, position: 'goalie', groups: [1] },
  { id: uid(3), first_name: 'Luca', last_name: 'Rossi', jersey_number: 7, position: 'defence', groups: [1] },
  { id: uid(4), first_name: 'Paolo', last_name: 'Verdi', jersey_number: 16, position: 'forward', groups: [1, 2] },
  { id: uid(5), first_name: 'Elena', last_name: 'Neri', jersey_number: null, position: null, groups: [1] },
  { id: uid(6), first_name: 'Giorgio', last_name: 'Gallo', jersey_number: 21, position: 'forward', groups: [1, 3] },
  { id: uid(7), first_name: 'Sara', last_name: 'Conti', jersey_number: 4, position: 'defence', groups: [2] },
  { id: uid(8), first_name: 'Davide', last_name: 'Longo', jersey_number: 11, position: 'forward', groups: [3, 4] },
  { id: uid(9), first_name: 'Anna', last_name: 'Moretti', jersey_number: null, position: null, groups: [5] },
]
const member = uid(3)

const groups = [
  { id: 1, code: 'A', name: 'A', game_dark: '#fffb00', game_light: '#000000', logo_path: null, league_team: 'HC Sample', league_championships: [1, 2] },
  { id: 2, code: 'B', name: 'B', game_dark: null, game_light: null, logo_path: null, league_team: 'HC Sample', league_championships: [3] },
  { id: 3, code: 'C1', name: 'C1', game_dark: null, game_light: null, logo_path: null, league_team: null, league_championships: [] },
  { id: 4, code: 'C2', name: 'C2', game_dark: null, game_light: null, logo_path: null, league_team: null, league_championships: [] },
  { id: 5, code: 'S', name: 'Start', game_dark: null, game_light: null, logo_path: null, league_team: null, league_championships: [] },
]

const ev = (n, o) => ({
  id: eid(n), series_id: null, type: 'training', title: 'Allenamento', starts_at: at(0, 20), ends_at: at(0, 21, 30), meetup_at: null,
  venue: 'Pista Sample', opponent: null, home_away: null, score_for: null, score_against: null, created_at: at(-40, 9),
  jersey: null, league_match_id: null, rink_id: 1, cancelled_at: null, created_by: ME, ...o,
})
const week = '20000000-0000-4000-8000-000000000001'
const events = [
  ev(1, { starts_at: at(-30, 20), ends_at: at(-30, 21, 30), series_id: week }),
  ev(2, { type: 'game', title: 'Partita', opponent: 'HC Esempio', home_away: 'home', starts_at: at(-12, 18), ends_at: at(-12, 19, 30), meetup_at: at(-12, 17), score_for: 5, score_against: 3, rink_id: null, video_url: 'https://example.test/video-partita' }),
  ev(3, { type: 'game', title: 'Partita', opponent: 'HC Prova Uno', home_away: 'away', starts_at: at(-6, 21), ends_at: at(-6, 22, 30), score_for: 2, score_against: 4, rink_id: null }),
  ev(4, { starts_at: at(-3, 20), ends_at: at(-3, 21, 30), series_id: week }),
  ev(5, { starts_at: at(1, 20), ends_at: at(1, 21, 30), series_id: week, meetup_at: at(1, 19, 30) }),
  ev(6, { type: 'game', title: 'Partita', opponent: 'HC Orsi', home_away: 'home', starts_at: at(3, 18), ends_at: at(3, 19, 30), meetup_at: at(3, 17), rink_id: null, jersey: 'light' }),
  ev(7, { starts_at: at(8, 20), ends_at: at(8, 21, 30), series_id: week }),
  ev(8, { starts_at: at(10, 20), ends_at: at(10, 21, 30), cancelled_at: at(5, 9), title: 'Allenamento annullato' }),
  ev(9, { type: 'game', title: 'Partita', opponent: 'HC Lupi', home_away: 'away', starts_at: at(15, 21), ends_at: at(15, 22, 30), rink_id: null }),
  ev(10, { starts_at: at(22, 20), ends_at: at(22, 21, 30), series_id: week }),
  ev(11, { starts_at: at(2, 19), ends_at: at(2, 20), title: 'Allenamento B' }),
  // A training of C1, a group the sample person (A and B) does not belong to: the Giocatore view must never show it.
  ev(13, { title: 'Allenamento C1 riservato', starts_at: new Date(Date.now() + 30 * 60000).toISOString(), ends_at: new Date(Date.now() + 90 * 60000).toISOString(), rink_id: null }),
  // Starts in ten minutes, so there is always one event without an answer inside the week (the window ends at Monday 00:00).
  ev(12, { title: 'Allenamento di prova', starts_at: new Date(Date.now() + 10 * 60000).toISOString(), ends_at: new Date(Date.now() + 100 * 60000).toISOString(), rink_id: null }),
]
const ids = { training: eid(5), game: eid(2), member, futureGame: eid(6) }

const eventGroups = events.flatMap((e) => (e.id === eid(13) ? [{ event_id: e.id, group_id: 3 }] : e.id === eid(11) ? [{ event_id: e.id, group_id: 2 }] : [{ event_id: e.id, group_id: 1 }, ...(e.id === eid(5) ? [{ event_id: e.id, group_id: 2 }] : [])])).map((r) => ({ ...r, created_at: at(-40, 9) }))

const groupMembers = people.flatMap((p) => p.groups.map((g) => ({ group_id: g, user_id: p.id, joined_at: at(-90, 9) })))

const profiles = people.map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, jersey_number: p.jersey_number, position: p.position, created_at: at(-90, 9), avatar_path: null }))
const contacts = people.map((p) => ({ user_id: p.id, email: `${p.first_name}.${p.last_name}@example.test`.toLowerCase(), phone: p.id === uid(3) ? '3331234567' : null }))

const answers = [
  { event_id: eid(5), user_id: uid(2), answer: 'present', answered_at: at(-1, 9), from_period: null },
  { event_id: eid(5), user_id: uid(3), answer: 'absent', answered_at: at(-1, 10), from_period: null },
  { event_id: eid(5), user_id: ME, answer: 'present', answered_at: at(-1, 11), from_period: null },
  { event_id: eid(6), user_id: uid(4), answer: 'present', answered_at: at(-1, 12), from_period: null },
  { event_id: eid(2), user_id: uid(2), answer: 'present', answered_at: at(-14, 9), from_period: null },
]
const records = [
  { event_id: eid(2), user_id: uid(2), status: 'on_time' },
  { event_id: eid(2), user_id: uid(3), status: 'late' },
  { event_id: eid(2), user_id: uid(4), status: 'on_time' },
  { event_id: eid(2), user_id: uid(5), status: 'excused' },
  { event_id: eid(1), user_id: uid(2), status: 'on_time' },
  { event_id: eid(1), user_id: uid(6), status: 'not_called_up' },
]

const stats = [
  { event_id: eid(2), user_id: uid(2), goals: 0, assists: 1, penalty_minutes: 0, shots_against: 28, saves: 25 },
  { event_id: eid(2), user_id: uid(3), goals: 1, assists: 0, penalty_minutes: 4, shots_against: null, saves: null },
  { event_id: eid(2), user_id: uid(4), goals: 3, assists: 2, penalty_minutes: 0, shots_against: null, saves: null },
]

const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)
const certFile = (id) => `${id}/medical_certificate-2000000000.jpg`
// Certificates: one valid (the reader found the date), one close to the end, one typed and waiting for staff, one with a file and no date.
const cert = (id, issuedAgo, source, verified) => ({ user_id: id, kind: 'medical_certificate', issued_on: day(-issuedAgo), issued_source: source, valid_until: new Date(Date.parse(day(-issuedAgo)) + 365 * 864e5).toISOString().slice(0, 10), file_path: certFile(id), accepted_at: null, verified_at: verified ? at(-5, 9) : null, verified_by: null, updated_by: id, updated_at: at(-20, 9) })
const docs = [
  { user_id: ME, kind: 'privacy_consent', valid_until: null, file_path: null, accepted_at: at(-60, 9), updated_by: ME, updated_at: at(-60, 9) },
  cert(uid(2), 165, 'read', false),
  cert(uid(3), 353, 'read', false),
  cert(uid(4), 20, 'typed', false),
  { ...cert(uid(6), 30, 'typed', true), verified_by: uid(6) },
  { user_id: uid(5), kind: 'medical_certificate', issued_on: null, issued_source: null, valid_until: null, file_path: certFile(uid(5)), accepted_at: null, verified_at: null, verified_by: null, updated_by: uid(5), updated_at: at(-20, 9) },
]

const standings = [
  { championship_id: 1, position: 1, team: 'HC Esempio', played: 8, points: 21, goal_diff: 18 },
  { championship_id: 1, position: 2, team: 'HC Sample', played: 8, points: 17, goal_diff: 9 },
  { championship_id: 1, position: 3, team: 'HC Orsi', played: 8, points: 9, goal_diff: -4 },
  { championship_id: 2, position: 1, team: 'HC Sample', played: 6, points: 15, goal_diff: 12 },
  { championship_id: 3, position: 2, team: 'HC Sample', played: 6, points: 10, goal_diff: 2 },
]
const leagueMatches = [
  { id: 501, championship_id: 1, championship: 'Campionato A', starts_at: at(-12, 18), home: 'HC Sample', away: 'HC Esempio', home_score: 5, away_score: 3, venue: 'Pista Sample', seen_at: at(-1, 9) },
  { id: 502, championship_id: 1, championship: 'Campionato A', starts_at: at(3, 18), home: 'HC Sample', away: 'HC Orsi', home_score: null, away_score: null, venue: 'Pista Sample', seen_at: at(-1, 9) },
  { id: 503, championship_id: 3, championship: 'Campionato B', starts_at: at(-6, 21), home: 'HC Prova Uno', away: 'HC Sample', home_score: 4, away_score: 2, venue: 'Altra pista', seen_at: at(-1, 9) },
]

// Older and later games of other teams, so the lists have more than ten rows and the "Mostra altre 10" button shows.
const teams = ['HC Orsi', 'HC Esempio', 'HC Lupi', 'HC Falchi', 'HC Aquile']
for (let i = 0; i < 14; i++) {
  leagueMatches.push({ id: 600 + i, championship_id: 1, championship: 'Campionato A', starts_at: at(-120 + i * 3, 20), home: teams[i % 5], away: teams[(i + 2) % 5], home_score: 2 + (i % 4), away_score: i % 3, venue: 'Altra pista', seen_at: at(-1, 9) })
  leagueMatches.push({ id: 700 + i, championship_id: 1, championship: 'Campionato A', starts_at: at(20 + i * 3, 20), home: teams[(i + 1) % 5], away: teams[(i + 3) % 5], home_score: null, away_score: null, venue: 'Altra pista', seen_at: at(-1, 9) })
}

const summary = people.filter((p) => p.groups.includes(1)).map((p, i) => ({
  user_id: p.id, first_name: p.first_name, last_name: p.last_name, position: p.position, events_total: 5, answered_present: 3 - (i % 3), answered_absent: i % 2, no_answer: 1 + (i % 2),
  on_time: 2, late: i % 2, excused: i % 3 === 0 ? 1 : 0, unexcused: 0, injured: 0, not_called_up: 0,
}))

const gridRows = people.filter((p) => p.groups.includes(1)).flatMap((p, i) =>
  [eid(1), eid(2), eid(4)].map((e, k) => ({
    event_id: e, starts_at: events.find((x) => x.id === e).starts_at, title: events.find((x) => x.id === e).title, type: events.find((x) => x.id === e).type, cancelled: false,
    user_id: p.id, first_name: p.first_name, last_name: p.last_name, answer: (i + k) % 3 === 0 ? 'present' : (i + k) % 3 === 1 ? 'absent' : null,
    status: k === 0 ? (i % 2 ? 'on_time' : 'late') : null,
  })))

const attendance = people.filter((p) => p.groups.includes(1)).map((p, i) => ({
  user_id: p.id, first_name: p.first_name, last_name: p.last_name, answer: i % 3 === 0 ? 'present' : i % 3 === 1 ? 'absent' : null, status: null,
}))

export const fixtures = {
  me: { email: 'chiara.ferri@example.test' },
  ids,
  match: {
    id: 501, status: 'Completata', championship: 'Campionato A', season: '2026/2027', date: '12/10/2026', time: '18:00', venue: 'Pista Sample',
    home: { name: 'HC Sample', score: 5, roster: [{ role: 'Portieri', players: [{ number: '9', name: 'Marco Bianchi' }] }, { role: 'Attaccanti', players: [{ number: '16', name: 'Paolo Verdi' }, { number: '21', name: 'Giorgio Gallo' }] }] },
    away: { name: 'HC Esempio', score: 3, roster: [] },
    goals: [{ side: 'home', time: '04:12', scorer: { number: '16', name: 'Paolo Verdi' }, assists: [{ number: '21', name: 'Giorgio Gallo' }], kind: null }, { side: 'away', time: '11:40', scorer: { number: '8', name: 'Mario Esempio' }, assists: [], kind: 'Powerplay' }],
    penalties: [{ side: 'home', time: '07:30', player: { number: '7', name: 'Luca Rossi' }, infraction: 'Sgambetto', minutes: '2', serving: null }],
  },
  tables: {
    profiles, profile_contacts: contacts, groups, group_members: groupMembers,
    user_roles: [{ user_id: ME, role: 'board' }, { user_id: ME, role: 'coach' }],
    events, event_groups: eventGroups, attendance_answers: answers, attendance_records: records,
    club_settings: [{ id: true, name: 'Hockey Club Sample', logo_path: null, game_dark: '#fffb00', game_light: '#000000', jersey_light_name: 'Chiara', jersey_dark_name: 'Scura', privacy_notice_path: null, mfa_required_from: '2026-11-30T23:43:00Z' }],
    fanta_picks: [],
    game_predictions: [{ event_id: eid(6), pred_for: 4, pred_against: 2 }],
    game_stats: stats, mvp_votes: [], game_ratings: [],
    announcements: [
      { id: '30000000-0000-4000-8000-000000000002', author_id: ME, title: 'Quota di iscrizione', body: 'La quota va versata entro la fine del mese.', email: false, pinned_at: at(-8, 9), created_at: at(-9, 9) },
      { id: '30000000-0000-4000-8000-000000000001', author_id: ME, title: 'Cambio orario del martedì', body: 'Da questa settimana ci si trova alle 20 e 15.', email: false, pinned_at: null, created_at: at(-1, 9) },
    ],
    announcement_groups: [
      { announcement_id: '30000000-0000-4000-8000-000000000001', group_id: 1 },
      { announcement_id: '30000000-0000-4000-8000-000000000002', group_id: 1 },
      { announcement_id: '30000000-0000-4000-8000-000000000002', group_id: 2 },
    ],
    announcement_seen: [{ user_id: ME, seen_at: at(-5, 9) }],
    drills: [
      { id: '40000000-0000-4000-8000-000000000001', title: 'Passaggi a coppie', notes: 'Due file, passaggio e cambio di fila.', file_path: null, video_url: 'https://example.test/video', created_by: ME, created_at: at(-30, 9) },
      { id: '40000000-0000-4000-8000-000000000002', title: 'Tiri da fermo', notes: null, file_path: null, video_url: null, created_by: ME, created_at: at(-20, 9) },
    ],
    event_plan: [{ event_id: eid(5), notes: 'Riscaldamento breve, poi esercizi a coppie.', visible_after: false, updated_by: ME, updated_at: at(-1, 9) }],
    event_plan_drills: [{ id: '50000000-0000-4000-8000-000000000001', event_id: eid(5), drill_id: '40000000-0000-4000-8000-000000000001', step: 1, minutes: 15 }],
    event_lineup: [{ event_id: eid(5), slot: 'goalie', unit: 1, user_id: uid(2), set_by: ME, set_at: at(-1, 9) }],
    event_messages: [{ id: '60000000-0000-4000-8000-000000000001', event_id: eid(5), user_id: uid(2), body: 'Porto io i pettorali.', created_at: at(-1, 15) }],
    event_message_seen: [{ event_id: eid(5), user_id: ME, seen_at: at(-1, 9) }],
    club_documents: [
      { id: '80000000-0000-4000-8000-000000000001', title: 'Statuto del club', file_path: 'club/doc-2000000001.pdf', created_by: ME, created_at: at(-40, 9) },
      { id: '80000000-0000-4000-8000-000000000002', title: 'Regolamento della lega, stagione in corso, con le norme sulle iscrizioni e sui tesseramenti', file_path: 'club/doc-2000000002.pdf', created_by: ME, created_at: at(-10, 9) },
    ],
    member_documents: docs, absence_periods: [],
    rinks: [{ id: 1, name: 'Grande', address: 'Via Esempio 1, Milano', note: 'Parcheggio sul retro' }, { id: 2, name: 'Piccola', address: null, note: null }],
    rink_prices: [{ rink_id: 1, price_cents: 15000 }, { rink_id: 2, price_cents: 9000 }],
    invites: [
      { id: '70000000-0000-4000-8000-000000000001', group_id: 1, token_hash: null, created_by: ME, created_at: at(-1, 9), expires_at: at(6, 9), used_by: null, used_at: null, revoked_at: null, max_uses: 1, use_count: 0 },
      { id: '70000000-0000-4000-8000-000000000002', group_id: 2, token_hash: null, created_by: ME, created_at: at(-20, 9), expires_at: at(-13, 9), used_by: uid(7), used_at: at(-18, 9), revoked_at: null, max_uses: 1, use_count: 1 },
    ],
    league_matches: leagueMatches, league_standings: standings,
    league_championships: [{ id: 1, name: 'Campionato A', position: 1 }, { id: 2, name: 'Coppa A', position: 2 }, { id: 3, name: 'Campionato B', position: 3 }],
    league_sync: [{ id: true, started_at: at(-1, 8), finished_at: at(-1, 8, 1), ok: true, message: null, details_started_at: at(-1, 8), details_finished_at: at(-1, 8, 1), details_message: null }],
    // Most of the finished games of the sample competition have been read, three are still to come.
    league_match_reads: leagueMatches.filter((m) => m.championship_id === 1 && m.home_score !== null).slice(0, 12).map((m) => ({ match_id: m.id })),
    reminder_prefs: [], calendar_tokens: [{ user_id: ME, token: 'sampletoken0123456789sampletoken0123456789', created_at: at(-30, 9) }],
  },
  rpc: {
    my_season: [{ events_total: '12', answered_present: '9', answered_absent: '2', no_answer: '1', on_time: '8', late: '1', excused: '2', unexcused: '0', injured: '0', not_called_up: '1', games: 5, goals: 3, assists: 4, penalty_minutes: 6, mvp: 1, rating_avg: '7.5', rated_games: 3 }],
    my_milestones: [
      { kind: 'streak', level: 10, reached_at: at(-5, 21) },
      { kind: 'goals', level: 10, reached_at: at(-12, 18) },
      { kind: 'goals', level: 1, reached_at: at(-60, 18) },
    ],
    prediction_table: people.filter((p) => p.groups.includes(1)).slice(0, 5).map((p, i) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, predictions: 4 - (i % 2), exact: i === 0 ? 2 : 0, points: 40 - 6 * i })),
    game_prediction_list: people.filter((p) => p.groups.includes(1)).slice(0, 4).map((p, i) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, pred_for: 5 - i, pred_against: 2, points: i === 0 ? 13 : i === 1 ? 1 : 7 })),
    season_leaders: [
      { category: 'goals', user_id: uid(2), first_name: 'Marco', last_name: 'Bianchi', value: 12 },
      { category: 'goals', user_id: uid(3), first_name: 'Luca', last_name: 'Rossi', value: 12 },
      { category: 'assists', user_id: uid(3), first_name: 'Luca', last_name: 'Rossi', value: 9 },
      { category: 'present', user_id: uid(2), first_name: 'Marco', last_name: 'Bianchi', value: 31 },
    ],
    // Players of the championship, long names and many rows on purpose (the table limit and the narrow screens).
    league_player_totals: Array.from({ length: 26 }, (_, i) => ({
      team: ['HC Sample', 'HC Orsi', 'HC Esempio', 'HC Lupi della Valle Antica'][i % 4],
      player_name: i === 3 ? 'Giovanni Battista Montefusco Della Rovere' : `Giocatore ${String.fromCharCode(65 + i)}${String.fromCharCode(97 + (i % 20))}ti`,
      player_number: i % 5 === 0 ? null : String(2 + i * 3), games: 3 + (i % 8), goals: 14 - Math.floor(i / 2), assists: 9 - Math.floor(i / 3), points: 23 - Math.floor(i / 2) - Math.floor(i / 3),
      pp_goals: i % 4, penalties: 6 - Math.floor(i / 5), penalty_minutes: 22 - i,
    })),
    // Fantahockey: the next game day, the last one with the picks of six people, and the season table.
    league_hidden_list: [
      { team: 'HC Sample', player_name: 'Mario Rossi', hidden_at: at(-2, 10), hidden_by_name: 'Delegeanu Davide' },
      { team: 'HC Altro Club con un nome molto lungo', player_name: 'Giovanni Battista Montefiore', hidden_at: at(-1, 9), hidden_by_name: null },
    ],
    league_team_players: [{ player_name: 'Mario Rossi' }, { player_name: 'Luca Bianchi' }],
    fanta_next_round: [{ round_day: '2026-11-08', starts_at: at(3, 18), games: 2 }],
    fanta_last_round: [{ round_day: '2026-10-20', starts_at: at(-12, 19), games: 1, over: true }],
    fanta_candidates: people.filter((p) => p.groups.length).map((p) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, jersey_number: p.jersey_number })),
    fanta_round_list: people.filter((p) => p.groups.includes(1)).slice(0, 6).flatMap((p, i) =>
      [0, 1, 2].map((k) => { const q = people[(i + k + 1) % people.length]; return { user_id: p.id, first_name: p.first_name, last_name: p.last_name, player_id: q.id, player_first_name: q.first_name, player_last_name: q.last_name, points: (i * 3 + k * 5) % 11 } })),
    fanta_table: people.filter((p) => p.groups.includes(1)).slice(0, 6).map((p, i) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, rounds: 3 - (i % 2), points: 40 - 5 * i })),
    is_staff: true, is_board: true, is_member: true,
    attendance_summary: summary,
    attendance_grid: gridRows,
    event_attendance: attendance,
    event_present_counts: events.map((e) => ({ event_id: e.id, present: e.id === eid(2) ? 3 : e.id === eid(5) ? 2 : 0 })),
    event_present_people: [{ user_id: uid(2), first_name: 'Marco', last_name: 'Bianchi' }, { user_id: ME, first_name: 'Chiara', last_name: 'Ferri' }],
    unanswered_people: people.filter((p) => p.groups.includes(1) && p.id !== ME).slice(0, 4).map((p, i) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, email: `${p.first_name}.${p.last_name}@example.test`.toLowerCase(), phone: null, missing: 1 + (i % 3) })),
    my_event_threads: [{ event_id: eid(5), last_message_at: at(-1, 15), messages: 1, unread: 1, archived: false }],
    game_results: people.filter((p) => p.groups.includes(1) && p.id !== ME).slice(0, 4).map((p, i) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, jersey_number: p.jersey_number, position: p.position, played: true, goals: i, assists: 1, penalty_minutes: i === 1 ? 4 : 0, shots_against: i === 0 ? 28 : null, saves: i === 0 ? 25 : null, rating_avg: 7 + i * 0.5, rating_count: 3, mvp_votes: i === 2 ? 2 : 0, my_rating: null })),
    opponent_history: [
      { starts_at: at(-20, 18), home_away: 'home', score_for: 5, score_against: 2, source: 'club' },
      { starts_at: at(-90, 18), home_away: 'away', score_for: 1, score_against: 4, source: 'league' },
    ],
    season_record: [{ games: 4, wins: 3, draws: 0, losses: 1, goals_for: 14, goals_against: 9 }],
    season_results: events.filter((e) => e.type === 'game' && e.score_for !== null).map((e) => ({ event_id: e.id, starts_at: e.starts_at, opponent: e.opponent, home_away: e.home_away, score_for: e.score_for, score_against: e.score_against })),
    season_player_stats: people.filter((p) => p.groups.includes(1) && p.id !== ME).map((p, i) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, jersey_number: p.jersey_number, position: p.position, games: 4, goals: 6 - i, assists: 3, points: 9 - i, penalty_minutes: 2 * i, shots_against: p.position === 'goalie' ? 90 : null, saves: p.position === 'goalie' ? 80 : null, mvp: i === 0 ? 2 : 0, rating_avg: 7.4 })),
    lineup_candidates: people.filter((p) => p.groups.includes(1) && p.id !== ME).map((p) => ({ user_id: p.id, first_name: p.first_name, last_name: p.last_name, jersey_number: p.jersey_number, position: p.position, answer: p.id === uid(2) ? 'present' : null })),
    my_calendar_token: 'sampletoken0123456789sampletoken0123456789',
  },
}
