import { PIECES, attackSquares } from '@/game/engine'
import { CELLS, opposite, type Board, type Color } from '@/game/types'

/**
 * Who can reach whom, as the pieces themselves would reckon it.
 *
 * The engine's `attackSquares` is geometry and counts every piece; a piece that
 * has already made its one move is spent and can no longer act on what it
 * covers. Everything here filters those out, so "aims at" and "under threat
 * from" mean what they say out loud.
 */

/** Enemies this piece can still strike. Empty once it has moved. */
export function aimsAt(board: Board, cell: number): number[] {
  const piece = board[cell]
  if (!piece || piece.moved) return []
  const enemy = opposite(piece.color)
  return attackSquares(board, cell).filter((square) => board[square]?.color === enemy)
}

/** Enemy pieces that can still strike this square. */
export function liveAttackers(board: Board, cell: number, color: Color): number[] {
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) {
    const piece = board[i]
    if (!piece || piece.color !== color || piece.moved || i === cell) continue
    if (attackSquares(board, i).includes(cell)) out.push(i)
  }
  return out
}

/** Enemies still able to come for the piece standing here. */
export function threatenedBy(board: Board, cell: number): number[] {
  const piece = board[cell]
  if (!piece) return []
  return liveAttackers(board, cell, opposite(piece.color))
}

/**
 * Who would be able to strike this piece if it went to `to` — the board as it
 * would be after the move, not as it is now.
 *
 * The piece that moves is spent when it lands, so anything that reaches it
 * there takes it for nothing. This is what a piece is entitled to grumble
 * about before it obeys an order.
 */
export function threatsAfterMove(board: Board, from: number, to: number): number[] {
  const piece = board[from]
  if (!piece) return []
  const after = board.slice()
  // An archer strikes without leaving its square; everyone else lands on the
  // square they aimed at.
  const shooting = PIECES[piece.kind].archer === true && board[to] != null
  if (shooting) after[to] = null
  else {
    after[to] = { ...piece, moved: true }
    after[from] = null
  }
  return liveAttackers(after, shooting ? from : to, opposite(piece.color))
}
