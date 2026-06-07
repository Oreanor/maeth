import type { PieceKind } from './pieces'

export const SIZE = 4
export const CELLS = SIZE * SIZE
/** Pieces placed per side before the move phase begins. */
export const PIECES_PER_SIDE = 4

export type Color = 'white' | 'black'

/** A piece sitting on the board. `moved` becomes true after its single move. */
export interface PlacedPiece {
  kind: PieceKind
  color: Color
  moved: boolean
}

export type Cell = PlacedPiece | null
/** Flat board, length CELLS. Index = row * SIZE + col, row 0 at the top. */
export type Board = Cell[]

export interface Move {
  from: number
  to: number
  capture: boolean
}

export type Phase = 'lottery' | 'draft' | 'play' | 'over'

/** Online turn lottery before the draft — odd roll → white, even → black. */
export interface LotteryState {
  step: 'await_roll' | 'revealed'
  roll?: number
  firstTurn?: Color
}

export type GameStatus =
  | { kind: 'playing' }
  | { kind: 'win'; winner: Color }
  | { kind: 'draw' }

export interface GameState {
  phase: Phase
  /** Present only while `phase === 'lottery'`. */
  lottery?: LotteryState | null
  board: Board
  /** Whose turn it is to act (draw+place during draft, or move during play). */
  turn: Color
  /** Remaining undrawn pieces, shuffled. Length tells how many are left. */
  deck: PieceKind[]
  /** Piece the current player has drawn and must place (draft phase only). */
  pending: PieceKind | null
  /** How many pieces each side has placed so far. */
  placed: Record<Color, number>
  /** How many enemy pieces each side has captured. */
  captures: Record<Color, number>
  status: GameStatus
  history: Move[]
}

// --- coordinate helpers ---

export const idx = (row: number, col: number): number => row * SIZE + col
export const rowOf = (i: number): number => Math.floor(i / SIZE)
export const colOf = (i: number): number => i % SIZE
export const onBoard = (row: number, col: number): boolean =>
  row >= 0 && row < SIZE && col >= 0 && col < SIZE

export const opposite = (c: Color): Color => (c === 'white' ? 'black' : 'white')
