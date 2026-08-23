import type { PieceKind } from './pieces'
import type { Color } from './types'

/** Renderer-neutral description of a move animation. */
export type AnimKind = 'move' | 'capture' | 'duel'

/**
 * Visual transition consumed by either the DOM board or a future canvas/Three
 * renderer. It deliberately contains no React, CSS, or scene-graph types.
 */
export interface AnimInfo {
  from: number
  to: number
  kind: AnimKind
  attacker: PieceKind
  /** Captured piece (for the shrink), when kind is 'capture'. */
  victim: PieceKind | null
  owner: Color
}
