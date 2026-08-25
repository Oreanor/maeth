import { SIZE, colOf, rowOf } from './types'

const FILES = 'ABCD'

/** Board square in file/rank notation (A–D, 1–4; row 1 is the top rank). */
export function cellSquare(cell: number): string {
  return `${FILES[colOf(cell)]}${rowOf(cell) + 1}`
}

/** The inverse: "C3" back to a cell index, or null if that is not a square. */
export function squareCell(square: string): number | null {
  const match = /^([A-D])([1-4])$/.exec(square.trim().toUpperCase())
  if (!match) return null
  return (Number(match[2]) - 1) * SIZE + FILES.indexOf(match[1]!)
}
