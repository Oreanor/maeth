import type { Board, Color } from '@/game/types'

/**
 * One line, hanging over one piece.
 *
 * Everything said on the board comes out in this shape, whoever produced it:
 * the piece the player opened a conversation with, the one it passed a message
 * to, the two arguing about a capture, or somebody complaining that the armour
 * is hot. The boards then have a single thing to draw instead of one path per
 * source — which is what they had, and it showed.
 */
export interface Speech {
  cell: number
  /** Null while the piece is thinking: the bubble shows three dots instead. */
  text: string | null
  thinking?: boolean
  /** Speaking for the side the player is NOT commanding — colours the bubble. */
  hostile: boolean
}

/** A line from a piece, with its side worked out from the board. */
export function speechFrom(
  board: Board,
  human: Color,
  cell: number,
  text: string | null,
  thinking = false,
): Speech | null {
  const piece = board[cell]
  if (!piece) return null
  return { cell, text, thinking, hostile: piece.color !== human }
}
