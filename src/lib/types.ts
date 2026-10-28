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

export interface Rink {
  id: number
  name: string
}

export interface RinkPrice {
  rink_id: number
  price_cents: number
}

export interface Announcement {
  id: string
  author_id: string | null
  title: string
  body: string
  email: boolean
  created_at: string
  announcement_groups: { group_id: number }[]
  profiles: { first_name: string; last_name: string } | null
}
