import { SIZE, colOf, rowOf, type Color } from '@/game/types'

/**
 * Which way up the board is.
 *
 * The board is always drawn with the player's own side at the bottom, so every
 * layer over it — the pieces, the arrows, the clouds and bubbles, the ring of
 * coordinates — has to turn a cell index into a place on screen the same way.
 * That rule was written out five times, once per layer; here it is once.
 */
export interface DisplayCell {
  /** Row and column as drawn: 0 is the top / left of the screen. */
  row: number
  col: number
}

export function displayCell(cell: number, orientation: Color): DisplayCell {
  const row = rowOf(cell)
  const col = colOf(cell)
  return orientation === 'white'
    ? { row, col }
    : { row: SIZE - 1 - row, col: SIZE - 1 - col }
}

/** The way back: a place on screen to the cell that is drawn there. */
export function cellAtDisplay(row: number, col: number, orientation: Color): number | null {
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return null
  const boardRow = orientation === 'white' ? row : SIZE - 1 - row
  const boardCol = orientation === 'white' ? col : SIZE - 1 - col
  return boardRow * SIZE + boardCol
}

/** A direction as drawn: turned over with the board, like everything else. */
export function displayStep(dr: number, dc: number, orientation: Color): { dr: number; dc: number } {
  return orientation === 'white' ? { dr, dc } : { dr: -dr, dc: -dc }
}
