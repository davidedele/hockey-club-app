import { describe, expect, it } from 'vitest'
import { keyBytes } from './push'

describe('push key', () => {
  it('turns the url safe base64 key into bytes', () => {
    expect(Array.from(keyBytes('AQID'))).toEqual([1, 2, 3])
    expect(Array.from(keyBytes('-_8'))).toEqual([251, 255])
  })
})
