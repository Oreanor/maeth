import {
  DUEL_ATTACKER_WIN_P,
  allLegalMoves,
  applyFailedStrike,
  applyMove,
  attackSquares,
  isAttackedBy,
  isDuelMove,
} from './engine'
import { CELLS, opposite, type GameState, type Move } from './types'

// Alpha-beta search for the MOVE phase. The phase is short (each piece moves at
// most once, ≤ 8 plies), so the search usually reaches terminal positions and
// plays the move phase near-optimally. Evaluation is from White's perspective:
// White maximises, Black minimises.
//
// Passing makes turns non-alternating (a stuck side is skipped), so we don't use
// negamax sign-flipping — we branch on `state.turn` explicitly, which stays
// correct whoever is to move.

const WIN = 1000
const MAX_DEPTH = 8 // a whole move phase
const TIME_BUDGET_MS = 120 // cap per decision so the UI never freezes

// Expectiminimax prunes far less than plain alpha-beta (chance nodes break the
// window), so instead of a fixed depth we deepen iteratively until the time
// budget runs out and keep the best move from the last completed depth.
let deadline = 0
let aborted = false

function outOfTime(): boolean {
  if (performance.now() >= deadline) {
    aborted = true
    return true
  }
  return false
}

/** Static evaluation from White's perspective (positive = good for White). */
function evalWhite(state: GameState): number {
  const diff = state.captures.white - state.captures.black
  if (state.phase === 'over') {
    if (state.status.kind === 'win') return (state.status.winner === 'white' ? WIN : -WIN) + diff
    return diff
  }

  // Positional: pressure that still-active pieces put on the enemy. Threatening
  // an undefended piece (a likely free capture) is worth more than a defended
  // one. Symmetric, so a hanging own piece shows up as the opponent's plus.
  const board = state.board
  let pos = 0
  for (let i = 0; i < CELLS; i++) {
    const p = board[i]
    if (!p || p.moved) continue
    const sign = p.color === 'white' ? 1 : -1
    const enemy = opposite(p.color)
    for (const sq of attackSquares(board, i)) {
      const occ = board[sq]
      if (occ && occ.color === enemy) {
        pos += sign * (isAttackedBy(board, sq, enemy) ? 0.3 : 0.6)
      }
    }
  }
  return diff * 100 + pos
}

/** Captures first — improves alpha-beta pruning. */
function ordered(moves: Move[]): Move[] {
  return moves.slice().sort((a, b) => Number(b.capture) - Number(a.capture))
}

/**
 * Value of playing `move`. A duel is a chance node: the expected value of the
 * win/lose outcomes. We don't prune inside the chance node (full windows), but
 * the decision node above still prunes on the resulting expected value.
 */
function moveValue(state: GameState, move: Move, depth: number, alpha: number, beta: number): number {
  if (isDuelMove(state.board, move)) {
    const won = search(applyMove(state, move), depth - 1, -Infinity, Infinity)
    const lost = search(applyFailedStrike(state, move), depth - 1, -Infinity, Infinity)
    return DUEL_ATTACKER_WIN_P * won + (1 - DUEL_ATTACKER_WIN_P) * lost
  }
  return search(applyMove(state, move), depth - 1, alpha, beta)
}

function search(state: GameState, depth: number, alpha: number, beta: number): number {
  if (state.phase === 'over' || depth === 0 || outOfTime()) {
    return evalWhite(state)
  }
  const moves = ordered(allLegalMoves(state))
  if (moves.length === 0) return evalWhite(state)

  if (state.turn === 'white') {
    let value = -Infinity
    for (const m of moves) {
      value = Math.max(value, moveValue(state, m, depth, alpha, beta))
      alpha = Math.max(alpha, value)
      if (alpha >= beta) break
    }
    return value
  } else {
    let value = Infinity
    for (const m of moves) {
      value = Math.min(value, moveValue(state, m, depth, alpha, beta))
      beta = Math.min(beta, value)
      if (beta <= alpha) break
    }
    return value
  }
}

/** Every root move with what the search thinks it is worth, at a fixed depth. */
function valuesAtDepth(state: GameState, moves: Move[], depth: number): ScoredMove[] {
  return moves.map((move) => ({ move, value: moveValue(state, move, depth, -Infinity, Infinity) }))
}

/** A root move and its value, from White's point of view as ever. */
export interface ScoredMove {
  move: Move
  value: number
}

/**
 * Between moves the search cannot tell apart, take the enemy that has NOT moved
 * yet.
 *
 * Every capture is worth the same single point, so once a line is searched out
 * to the end both often come to exactly the same number and the choice was a
 * coin toss — which reads as nonsense to anyone watching: a piece that has
 * already had its move can never hurt you again, and one that has not is still
 * owed a blow. Taking the live one denies that blow. It is a tie-break rather
 * than an evaluation term on purpose: it must never talk the search out of a
 * line it actually calculated.
 */
function preferLiveTargets(board: GameState['board'], pool: Move[]): Move[] {
  const rank = (move: Move): number => {
    const victim = move.capture ? board[move.to] : null
    if (!victim) return 0
    return victim.moved ? 1 : 2
  }
  let top = -Infinity
  for (const move of pool) top = Math.max(top, rank(move))
  return pool.filter((move) => rank(move) === top)
}

/** Every legal move for the side to move, best first, via time-budgeted
 *  iterative-deepening expectiminimax. Keeps the values from the last depth
 *  that finished in time. */
export function rankRootMoves(state: GameState): ScoredMove[] {
  const moves = ordered(allLegalMoves(state))
  if (moves.length === 0) return []

  deadline = performance.now() + TIME_BUDGET_MS
  let ranked = valuesAtDepth(state, moves, 1)
  for (let depth = 2; depth <= MAX_DEPTH; depth++) {
    aborted = false
    const deeper = valuesAtDepth(state, moves, depth)
    if (aborted) break // ran out of time mid-search → keep the previous depth
    ranked = deeper
    if (performance.now() >= deadline) break
  }
  const sign = state.turn === 'white' ? -1 : 1
  return ranked.slice().sort((a, b) => sign * (a.value - b.value))
}

/** The move it would play, plus the ones it weighed against it. */
export function bestMoveWithContext(
  state: GameState,
): { move: Move; ranked: ScoredMove[]; tied: Move[] } | null {
  const ranked = rankRootMoves(state)
  if (ranked.length === 0) return null
  const top = ranked[0]!.value
  const tied = ranked.filter((entry) => Math.abs(entry.value - top) <= 1e-9).map((e) => e.move)
  const finalists = preferLiveTargets(state.board, tied)
  return { move: finalists[Math.floor(Math.random() * finalists.length)]!, ranked, tied }
}

export function searchBestMove(state: GameState): Move | null {
  return bestMoveWithContext(state)?.move ?? null
}
