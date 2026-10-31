import { describe, expect, it } from 'vitest'
import { takenNumbers, wearing, type Holder } from './jersey'

const h = (id: string, n: number | null): Holder => ({ id, jersey_number: n, first_name: 'A', last_name: id })
const list = [h('me', 7), h('a', 9), h('b', 7), h('c', null), h('d', 9), h('e', 0)]

describe('takenNumbers', () => {
  it('lists the numbers of the others once, sorted, zero included', () => {
    expect(takenNumbers(list, 'me')).toEqual([0, 7, 9])
  })
  it('does not count the person own number', () => {
    expect(takenNumbers([h('me', 7)], 'me')).toEqual([])
  })
})

describe('wearing', () => {
  it('finds the others who have the number', () => {
    expect(wearing(list, 'me', 7).map((x) => x.id)).toEqual(['b'])
    expect(wearing(list, 'me', 9).map((x) => x.id)).toEqual(['a', 'd'])
    expect(wearing(list, 'me', 3)).toEqual([])
  })
})
