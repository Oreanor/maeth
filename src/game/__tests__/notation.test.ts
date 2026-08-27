import { describe, expect, it } from 'vitest'
import { cellSquare, squareCell } from '../notation'

describe('cellSquare', () => {
  it('maps corners to file/rank notation — A1 is the bottom-left square', () => {
    expect(cellSquare(0)).toBe('A4') // row 0 (top), col 0
    expect(cellSquare(3)).toBe('D4') // row 0 (top), col 3
    expect(cellSquare(12)).toBe('A1') // row 3 (bottom), col 0
    expect(cellSquare(15)).toBe('D1') // row 3 (bottom), col 3
  })

  it('maps a middle square', () => {
    expect(cellSquare(5)).toBe('B3') // row 1, col 1
  })

  it('reads back every square it writes', () => {
    for (let cell = 0; cell < 16; cell++) expect(squareCell(cellSquare(cell))).toBe(cell)
  })
})
