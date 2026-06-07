import { describe, expect, it } from 'vitest'
import { cellSquare } from '../notation'

describe('cellSquare', () => {
  it('maps corners to file/rank notation (row 1 at top)', () => {
    expect(cellSquare(0)).toBe('A1') // row 0, col 0
    expect(cellSquare(3)).toBe('D1') // row 0, col 3
    expect(cellSquare(12)).toBe('A4') // row 3, col 0
    expect(cellSquare(15)).toBe('D4') // row 3, col 3
  })

  it('maps a middle square', () => {
    expect(cellSquare(5)).toBe('B2') // row 1, col 1
  })
})
