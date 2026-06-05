import type { DuelRoll } from './engine'
import type { PieceDef, PieceKind } from './pieces'
import type { Color, GameState, Move } from './types'

// Shared state/contract types for the game UI layer: the hook's public surface
// plus the animation/duel descriptors passed to the board and modals.

export type AnimKind = 'move' | 'capture' | 'duel'

/** A move being animated on the board. */
export interface AnimInfo {
  from: number
  to: number
  kind: AnimKind
  attacker: PieceKind
  /** Captured piece (for the shrink), when kind is 'capture'. */
  victim: PieceKind | null
  owner: Color
}

/** A resolved duel plus who attacked, for the duel modal. */
export type DuelEvent = DuelRoll & { by: Color }

/** Enough of a move to replay its slide after a won duel. */
export type PendingMove = Pick<AnimInfo, 'from' | 'to' | 'attacker' | 'victim' | 'owner'>

/** The visual animation plus the not-yet-committed result it will apply. */
export type ActiveAnim = AnimInfo & { next: GameState; duelEvent: DuelEvent | null }

export interface UseGameOptions {
  /** Color the human plays (the other side is the bot when vsBot). */
  humanColor: Color
  vsBot: boolean
}

export interface UseGame {
  state: GameState
  /** Empty cells the human may drop the pending piece on (draft phase). */
  placementTargets: number[]
  /** Selected piece during the move phase. */
  selected: number | null
  /** Destinations of the selected piece. */
  legalTargets: number[]
  /** Full legal moves of the selected piece (for capture/move arrows). */
  selectedMoves: Move[]
  /** Meta of the piece the human just drew, if it's their turn to place. */
  pendingDef: PieceDef | null
  /** Cell currently previewed during the draft (ghost piece + move arrows). */
  previewCell: number | null
  /** A resolved duel awaiting acknowledgement — shown as a modal; the game is
   *  paused (the bot won't move) until it's dismissed. */
  duel: DuelEvent | null
  /** Dismiss the duel modal and let play continue. */
  dismissDuel: () => void
  /** Move currently being animated (arrow + slide + capture), or null. */
  anim: AnimInfo | null
  isHumanTurn: boolean
  thinking: boolean
  /** Unified board click — branches on phase internally. */
  onCell: (cell: number) => void
  /** Hover/touch a cell to preview the pending piece there (draft only). */
  onCellEnter: (cell: number) => void
  /** Drop the draft preview (e.g. pointer left the board). */
  clearPreview: () => void
  reset: () => void
}
