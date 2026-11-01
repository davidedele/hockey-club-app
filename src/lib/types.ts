export type Role = 'coach' | 'board'
export type Position = 'goalie' | 'defence' | 'forward'

export interface Group {
  id: number
  code: string
  name: string
  game_dark: string | null
  game_light: string | null
  logo_path: string | null
  league_team?: string | null
  league_championships?: number[]
}

export interface Profile {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: Position | null
  avatar_path: string | null
}

export interface Contact {
  user_id: string
  email: string
  phone: string | null
}

export interface Invite {
  id: string
  group_id: number
  created_at: string
  expires_at: string
  used_at: string | null
  used_by?: string | null
  revoked_at: string | null
  max_uses: number
  use_count: number
}

export type EventType = 'training' | 'game'
export type Answer = 'present' | 'absent'
export type Status = 'on_time' | 'late' | 'excused' | 'unexcused' | 'injured' | 'not_called_up'

export interface EventRow {
  id: string
  series_id: string | null
  type: EventType
  title: string
  starts_at: string
  ends_at: string
  meetup_at: string | null
  venue: string | null
  opponent: string | null
  home_away: 'home' | 'away' | null
  score_for: number | null
  score_against: number | null
  jersey: 'light' | 'dark' | null
  rink_id: number | null
  cancelled_at: string | null
  league_match_id: number | null
  video_url: string | null
  event_groups: { group_id: number }[]
}

export interface AttendanceRow {
  user_id: string
  first_name: string
  last_name: string
  answer: Answer | null
  status: Status | null
}

export interface UnansweredRow {
  user_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  missing: number
}

export interface SummaryRow {
  user_id: string
  first_name: string
  last_name: string
  events_total: number
  answered_present: number
  answered_absent: number
  no_answer: number
  on_time: number
  late: number
  excused: number
  unexcused: number
  injured: number
  not_called_up: number
}

// One person in one game: their numbers and, once visible, the ratings and MVP votes they received.
export interface GameResultRow {
  user_id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: Position | null
  played: boolean
  goals: number | null
  assists: number | null
  penalty_minutes: number | null
  shots_against: number | null
  saves: number | null
  rating_avg: number | null
  rating_count: number | null
  mvp_votes: number | null
  my_rating: number | null
}

export interface SeasonStatRow {
  user_id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: Position | null
  games: number
  goals: number
  assists: number
  points: number
  penalty_minutes: number
  shots_against: number | null
  saves: number | null
  mvp: number
  rating_avg: number | null
}

export interface SeasonRecord {
  games: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
}

export type AbsenceReason = 'work' | 'injury' | 'illness' | 'travel' | 'other'

export interface AbsencePeriod {
  id: string
  user_id: string
  starts_on: string
  ends_on: string
  reason: AbsenceReason | null
}

export type DocumentKind = 'medical_certificate' | 'privacy_consent'

export interface MemberDocument {
  user_id: string
  kind: DocumentKind
  valid_until: string | null
  file_path: string | null
  accepted_at: string | null
  // Medical certificate: the date of issue, who found it ('read' by the reader, 'typed' by the member)
  // and when staff confirmed it after opening the file. valid_until is issued_on plus one year.
  issued_on?: string | null
  issued_source?: 'read' | 'typed' | null
  verified_at?: string | null
  verified_by?: string | null
}

export interface LeagueChampionship {
  id: number
  name: string
  position: number
}

export interface LeagueMatch {
  id: number
  championship_id: number | null
  championship: string
  starts_at: string
  home: string
  away: string
  home_score: number | null
  away_score: number | null
  venue: string | null
}

export interface LeagueStanding {
  championship_id: number
  position: number
  team: string
  played: number
  points: number
  goal_diff: number
}

export interface LeagueSync {
  started_at: string | null
  finished_at: string | null
  ok: boolean | null
  message: string | null
}

export interface LeaguePlayerTotal {
  team: string
  player_name: string
  player_number: string | null
  games: number
  goals: number
  assists: number
  points: number
  pp_goals: number
  penalties: number
  penalty_minutes: number
}

export interface Rink {
  id: number
  name: string
  address?: string | null
  note?: string | null
}

export interface RinkPrice {
  rink_id: number
  price_cents: number
}

export type LineupSlot = 'left_wing' | 'centre' | 'right_wing' | 'left_defence' | 'right_defence' | 'goalie'

// One place in the line-up of one event, with the player who holds it.
export interface LineupPlace {
  slot: LineupSlot
  unit: number
  user_id: string
  profiles: { first_name: string; last_name: string; jersey_number: number | null } | null
}

// Somebody the event is shown to, as the coach sees them while picking.
export interface LineupCandidate {
  user_id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: Position | null
  answer: Answer | null
}

// A drill in the club's library, used in any number of training plans.
export interface Drill {
  id: string
  title: string
  notes: string | null
  file_path: string | null
  video_url: string | null
  created_by: string | null
  created_at: string
}

// The plan of one training: the coach's words and whether it stays up after the session.
export interface EventPlan {
  event_id: string
  notes: string | null
  visible_after: boolean
}

// One drill inside one plan, in its place in the order.
export interface PlanDrill {
  id: string
  event_id: string
  drill_id: string
  step: number
  minutes: number | null
  drills: Drill | null
}

export interface Announcement {
  id: string
  author_id: string | null
  title: string
  body: string
  email: boolean
  pinned_at: string | null
  created_at: string
  announcement_groups: { group_id: number }[]
  profiles: { first_name: string; last_name: string } | null
}
