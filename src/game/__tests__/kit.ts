import type { Board, Color, GameState, PlacedPiece } from '../types'
import { CELLS } from '../types'
import type { PieceKind } from '../pieces'

/** A placed piece. */
export function piece(kind: PieceKind, color: Color, moved = false): PlacedPiece {
  return { kind, color, moved }
}

/** An empty 4×4 board. */
export function emptyBoard(): Board {
  return new Array<null>(CELLS).fill(null)
}

/** A play-phase state with the given board (draft already finished). */
export function playState(
  board: Board,
  turn: Color = 'white',
  captures: Record<Color, number> = { white: 0, black: 0 },
): GameState {
  return {
    phase: 'play',
    board,
    turn,
    deck: [],
    pending: null,
    placed: { white: 4, black: 4 },
    captures,
    status: { kind: 'playing' },
    history: [],
  }
}

/** A fresh draft-phase state with a known deck/pending (no shuffling). */
export function draftState(deck: PieceKind[], pending: PieceKind, turn: Color = 'white'): GameState {
  return {
    phase: 'draft',
    board: emptyBoard(),
    turn,
    deck,
    pending,
    placed: { white: 0, black: 0 },
    captures: { white: 0, black: 0 },
    status: { kind: 'playing' },
    history: [],
  }
}
