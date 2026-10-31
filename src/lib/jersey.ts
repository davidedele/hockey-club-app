export interface Holder {
  id: string
  jersey_number: number | null
  first_name: string
  last_name: string
}

// The shirt numbers already used by other people in the same teams, sorted, without repeats (V2).
// A hint for the person choosing a number, never a lock.
export function takenNumbers(holders: Holder[], myId: string): number[] {
  const numbers = holders.filter((h) => h.id !== myId && h.jersey_number !== null).map((h) => h.jersey_number as number)
  return [...new Set(numbers)].sort((a, b) => a - b)
}

// The other people in the teams who already wear this number.
export function wearing(holders: Holder[], myId: string, number: number): Holder[] {
  return holders.filter((h) => h.id !== myId && h.jersey_number === number)
}
