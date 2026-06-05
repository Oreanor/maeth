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

/** Pick the best move at a fixed depth; ties broken randomly. */
function chooseAtDepth(state: GameState, moves: Move[], depth: number): Move {
  const maximizing = state.turn === 'white'
  let bestVal = maximizing ? -Infinity : Infinity
  let pool: Move[] = [moves[0]]
  for (const m of moves) {
    const v = moveValue(state, m, depth, -Infinity, Infinity)
    const better = maximizing ? v > bestVal + 1e-9 : v < bestVal - 1e-9
    const equal = Math.abs(v - bestVal) <= 1e-9
    if (better) {
      bestVal = v
      pool = [m]
    } else if (equal) {
      pool.push(m)
    }
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Best move for the side to move, via time-budgeted iterative-deepening
 *  expectiminimax. Keeps the choice from the last depth that finished in time. */
export function searchBestMove(state: GameState): Move | null {
  const moves = ordered(allLegalMoves(state))
  if (moves.length === 0) return null

  deadline = performance.now() + TIME_BUDGET_MS
  let best = moves[0]
  for (let depth = 2; depth <= MAX_DEPTH; depth++) {
    aborted = false
    const choice = chooseAtDepth(state, moves, depth)
    if (aborted) break // ran out of time mid-search → keep the previous depth
    best = choice
    if (performance.now() >= deadline) break
  }
  return best
}
