import { describe, expect, it } from 'vitest'
import { CELLS, SIZE, colOf, idx, onBoard, opposite, rowOf } from '../types'

describe('coordinate helpers', () => {
  it('round-trips idx ↔ row/col', () => {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const i = idx(r, c)
        expect(rowOf(i)).toBe(r)
        expect(colOf(i)).toBe(c)
      }
    }
  })

  it('covers every cell exactly once', () => {
    const seen = new Set<number>()
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) seen.add(idx(r, c))
    expect(seen.size).toBe(CELLS)
  })

  it('onBoard rejects out-of-range coordinates', () => {
    expect(onBoard(0, 0)).toBe(true)
    expect(onBoard(SIZE - 1, SIZE - 1)).toBe(true)
    expect(onBoard(-1, 0)).toBe(false)
    expect(onBoard(0, -1)).toBe(false)
    expect(onBoard(SIZE, 0)).toBe(false)
    expect(onBoard(0, SIZE)).toBe(false)
  })

  it('opposite flips colour', () => {
    expect(opposite('white')).toBe('black')
    expect(opposite('black')).toBe('white')
  })
})
