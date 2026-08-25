import { allLegalMoves, attackSquares, isDuelMove, PIECES } from '@/game/engine'
import { chooseBotPlacement } from '@/game/bot'
import { bestMoveWithContext } from '@/game/search'
import { cellSquare } from '@/game/notation'
import { opposite, type Board, type Color, type GameState, type Move } from '@/game/types'
import type { PieceKind } from '@/game/pieces'
import { liveAttackers } from './threats'

/**
 * "How should I move?" — answered by the same engine that plays the bot, not by
 * the model. The search picks the move, this file says why in plain words, and
 * the piece only has to retell it in its own voice. A character inventing chess
 * advice would be worse than useless: it would be confidently wrong.
 */

const nameAt = (board: Board, cell: number): string =>
  board[cell] ? `${PIECES[board[cell]!.kind].name} on ${cellSquare(cell)}` : `piece on ${cellSquare(cell)}`

const nameOf = (kind: PieceKind): string => PIECES[kind].name

/** Why the search likes this move, in sentences a character can retell. */
function moveReasons(state: GameState, move: Move, mover: Color): string[] {
  const board = state.board
  const enemy = opposite(mover)
  const reasons: string[] = []

  if (move.capture) {
    reasons.push(
      isDuelMove(board, move)
        ? `it strikes the ${nameAt(board, move.to)}, but that piece can hit back, so it is a duel and the die may go either way`
        : `it takes the ${nameAt(board, move.to)} for free — that piece cannot strike back`,
    )
    // Taking a piece that has already moved scores exactly the same point, so
    // whenever a live one could be taken instead it is taken instead; when a
    // spent one is still the pick, the player deserves to hear why.
    reasons.push(
      board[move.to]!.moved
        ? 'that one had already spent its move — it could never have struck anyone again, so this is a point and nothing more'
        : 'that one had NOT moved yet, so the blow it was still owed dies with it — always worth more than taking a piece that is already spent',
    )
    const victimAims = attackSquares(board, move.to).filter((sq) => board[sq]?.color === mover)
    if (victimAims.length > 0) {
      reasons.push(`that piece was aiming at the ${nameAt(board, victimAims[0]!)}, and the threat goes with it`)
    }
  }

  const wasHunted = liveAttackers(board, move.from, enemy)
  if (wasHunted.length > 0) {
    reasons.push(`it steps out from under the ${nameAt(board, wasHunted[0]!)}, which could still reach ${cellSquare(move.from)}`)
  }

  // Where it lands, judged on the board as it will be — the mover is spent
  // there and cannot answer anyone, so any live enemy reaching it is a plain
  // loss rather than a duel.
  const after = board.slice()
  after[move.to] = { ...board[move.from]!, moved: true }
  after[move.from] = null
  const hunters = liveAttackers(after, move.to, enemy)
  reasons.push(
    hunters.length === 0
      ? `on ${cellSquare(move.to)} nothing of theirs that can still move is able to reach it`
      : `${cellSquare(move.to)} is not safe — the ${nameAt(after, hunters[0]!)} can still come for it, and the calculation accepts that price`,
  )

  return reasons
}

/** Why this is a good square to set the drawn piece down on. */
function placementReasons(state: GameState, cell: number, kind: PieceKind, mover: Color): string[] {
  const enemy = opposite(mover)
  const board = state.board.slice()
  board[cell] = { kind, color: mover, moved: false }

  const controlled = attackSquares(board, cell)
  const aimed = controlled.filter((sq) => board[sq]?.color === enemy)
  const covered = controlled.filter((sq) => board[sq]?.color === mover)
  const hunters = liveAttackers(board, cell, enemy)
  const reasons: string[] = []

  if (aimed.length >= 2) reasons.push(`from there it aims at two of theirs at once — the ${nameAt(board, aimed[0]!)} and the ${nameAt(board, aimed[1]!)}`)
  else if (aimed.length === 1) reasons.push(`from there it aims at the ${nameAt(board, aimed[0]!)}`)
  if (covered.length > 0) reasons.push(`it backs up the ${nameAt(board, covered[0]!)}`)
  reasons.push(
    hunters.length === 0
      ? 'nothing of theirs can reach that square'
      : `the ${nameAt(board, hunters[0]!)} can reach that square, so it is a fighting post, not a safe one`,
  )
  if (aimed.length === 0 && hunters.length === 0) {
    reasons.push('there is nothing to threaten yet — it takes an open, central post and waits')
  }
  return reasons
}

/**
 * The engine's recommendation for the human, ready to go into the prompt, or
 * null when there is nothing to recommend (not their turn, nothing to move).
 */
export function adviseHuman(state: GameState, human: Color): string | null {
  if (state.turn !== human) {
    return `It is not ${human === 'white' ? 'the white' : 'the black'} army's turn at all right now — there is nothing for the player to play until the other side has acted.`
  }

  if (state.phase === 'draft') {
    if (state.pending == null) {
      return 'The player has not drawn a piece yet: they must pull one blindly out of the deck first, and only then choose a square for it.'
    }
    // The very heuristic the bot places by, asked on the player's behalf.
    const cell = chooseBotPlacement(state)
    if (cell == null) return null
    const reasons = placementReasons(state, cell, state.pending, human)
    return [
      `THE CALCULATION SAYS: put the ${nameOf(state.pending)} they have drawn on ${cellSquare(cell)}.`,
      `Why: ${reasons.join('; ')}.`,
    ].join(' ')
  }

  if (state.phase !== 'play') return null

  const moves = allLegalMoves(state)
  if (moves.length === 0) return 'The player has no legal move at all — their turn is skipped.'
  const search = bestMoveWithContext(state)
  if (!search) return null
  const { move, ranked, tied } = search

  const reasons = moveReasons(state, move, human)
  // What it weighed this against. Without it every "why not the other one?"
  // has to be answered out of thin air, which is where invention starts.
  const runnerUp = ranked.find((entry) => entry.move !== move && !tied.includes(entry.move))
  const alternatives = [
    tied.length > 1
      ? `${tied.length} moves come out exactly equal by the count of pieces, and this is the one it plays — among equals it takes the enemy that has NOT moved yet, because a spent piece can never hurt anyone again.`
      : null,
    runnerUp
      ? `The next best it looked at is ${nameAt(state.board, runnerUp.move.from)} → ${cellSquare(runnerUp.move.to)}, and it comes out worse.`
      : null,
  ].filter(Boolean)

  return [
    `THE CALCULATION SAYS: of the ${moves.length} legal moves available the strongest is ${nameAt(state.board, move.from)} → ${cellSquare(move.to)}.`,
    `Why: ${reasons.join('; ')}.`,
    ...alternatives,
  ].join(' ')
}
