export type Role = 'coach' | 'board'
export type Position = 'goalie' | 'defence' | 'forward'

export interface Group {
  id: number
  code: string
  name: string
  game_dark: string | null
  game_light: string | null
  logo_path: string | null
  weekly_limit: number | null
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
