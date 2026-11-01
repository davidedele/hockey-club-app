import { describe, expect, it } from 'vitest'

// The two server functions that read a league game page each carry their own copy of the reader, because a
// function is deployed on its own. The copies must not drift apart.
const files = import.meta.glob('../../supabase/functions/*/match.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('league game page reader', () => {
  it('is the same in league-match and league-details', () => {
    const a = files['../../supabase/functions/league-match/match.ts']
    const b = files['../../supabase/functions/league-details/match.ts']
    expect(a).toBeTruthy()
    expect(b).toBe(a)
  })
})
