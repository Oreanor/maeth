import { colOf, rowOf } from './types'

const FILES = 'ABCD'

/** Board square in file/rank notation (A–D, 1–4; row 1 is the top rank). */
export function cellSquare(cell: number): string {
  return `${FILES[colOf(cell)]}${rowOf(cell) + 1}`
}
