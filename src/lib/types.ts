export type Role = 'coach' | 'board'
export type Position = 'goalie' | 'defence' | 'forward'

export interface Group {
  id: number
  code: string
  name: string
}

export interface Profile {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: Position | null
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
  revoked_at: string | null
}
