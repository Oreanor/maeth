import { SIZE, colOf, rowOf } from './types'

export const FILES = 'ABCD'

/**
 * Board square in file/rank notation: A–D left to right, 1–4 bottom to top, so
 * A1 is the bottom-left square and D4 the top-right one — the way a chess board
 * is read. Board rows run the other way, top down, which is why the rank is
 * counted back from SIZE rather than up from the row.
 */
export function cellSquare(cell: number): string {
  return `${FILES[colOf(cell)]}${SIZE - rowOf(cell)}`
}

/** The inverse: "C3" back to a cell index, or null if that is not a square. */
export function squareCell(square: string): number | null {
  const match = /^([A-D])([1-4])$/.exec(square.trim().toUpperCase())
  if (!match) return null
  return (SIZE - Number(match[2])) * SIZE + FILES.indexOf(match[1]!)
}
