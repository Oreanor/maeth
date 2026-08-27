import { attackSquares, beginDraft, isAttackedBy, placePiece, placementCells } from './engine'
import { searchBestMove } from './search'
import {
  CELLS,
  colOf,
  opposite,
  rowOf,
  type Board,
  type Color,
  type GameState,
  type Move,
} from './types'
import type { PieceKind } from './pieces'

// Heuristic bot. All pieces are worth the same (victory = capture count), so
// the evaluation is about threats, safety and tempo rather than material value.

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

/** Keep the highest-scoring options and break ties randomly. */
function best<T>(items: T[], score: (x: T) => number): T | null {
  if (items.length === 0) return null
  let top = -Infinity
  let pool: T[] = []
  for (const it of items) {
    const s = score(it)
    if (s > top + 1e-9) {
      top = s
      pool = [it]
    } else if (s > top - 1e-9) {
      pool.push(it)
    }
  }
  return pick(pool)
}

function countOn(board: Board, squares: number[], color: Color): number {
  let n = 0
  for (const s of squares) if (board[s]?.color === color) n++
  return n
}

// ── placement ────────────────────────────────────────────────────────────────

/**
 * Score placing `kind` on `cell`. Rewards aiming at enemies (forks especially)
 * and covering friends; penalises sitting under attack — heavily if the square
 * isn't defended (the piece just hangs), lightly if it is (a fair trade).
 */
function scorePlacement(board: Board, cell: number, kind: PieceKind, me: Color): number {
  const enemy = opposite(me)
  const temp = board.slice()
  temp[cell] = { kind, color: me, moved: false }

  const controlled = attackSquares(temp, cell)
  const enemiesAimed = countOn(temp, controlled, enemy)
  const friendsCovered = countOn(temp, controlled, me) // own pieces on controlled squares

  // Under the duel rule, exposure isn't all equal: a threat we can't answer is
  // a clean loss, while a *mutual* threat is only a ~coin-flip duel.
  const attackers = enemyAttackersOf(temp, cell, enemy)
  const underAttack = attackers.length > 0
  const oneSided = attackers.some((sq) => !controlled.includes(sq)) // we can't hit back
  const defended = isAttackedBy(temp, cell, me)

  // Aiming is the main goal and safety is a strong, separate bonus — so the
  // ideal cell threatens an enemy AND can't be cleanly hit back. Ranking:
  //   safe + aiming (5+)  >  safe + hiding (2)  >  mutual-duel exposure (~−0.6)
  //   >  one-sided exposure (a clean loss).
  let score = 0
  score += 3 * enemiesAimed // threaten someone
  if (enemiesAimed >= 2) score += 2 // fork
  score += friendsCovered // back up our own pieces
  if (!underAttack) score += 2 // fully safe
  else if (oneSided) score += defended ? -1.2 : -2.5 // can be taken cleanly
  else score += -0.6 // every threat is a mutual duel (coin flip)

  // Small shaping terms (much weaker than aim/safety) so that when we can't
  // safely aim, we still hide *purposefully* — on an active, central square
  // close to the enemy, ready to strike next — instead of a random corner.
  score += 0.12 * controlled.length // mobility / centrality
  score += 0.2 * proximityToEnemies(temp, cell, enemy) // menace the enemy
  return score
}

/** Squares of enemy pieces that control `cell`. */
function enemyAttackersOf(board: Board, cell: number, enemy: Color): number[] {
  const out: number[] = []
  for (let i = 0; i < CELLS; i++) {
    if (board[i]?.color === enemy && i !== cell && attackSquares(board, i).includes(cell)) {
      out.push(i)
    }
  }
  return out
}

/** Sum over enemy pieces of max(0, 3 − Chebyshev distance): closer = higher. */
function proximityToEnemies(board: Board, cell: number, enemy: Color): number {
  const r = rowOf(cell)
  const c = colOf(cell)
  let sum = 0
  for (let i = 0; i < CELLS; i++) {
    if (board[i]?.color === enemy) {
      const d = Math.max(Math.abs(r - rowOf(i)), Math.abs(c - colOf(i)))
      sum += Math.max(0, 3 - d)
    }
  }
  return sum
}

export function chooseBotPlacement(state: GameState): number | null {
  if (state.pending == null) return null
  const kind = state.pending
  const me = state.turn
  return best(placementCells(state), (cell) => scorePlacement(state.board, cell, kind, me))
}

/** One placement of a dealt position, in the order it was made. */
export interface DealtPlacement {
  by: Color
  cell: number
  kind: PieceKind
}

/**
 * Deal a whole opening position: the draft played out for both sides by the
 * same judgement the bot uses on its own turn, so the eight pieces stand
 * somewhere worth standing rather than scattered at random.
 *
 * The placements come back with it because the play-by-play is rebuilt by
 * replaying them — a position with no draft behind it would leave the log with
 * an empty board to move pieces around on.
 */
export function dealPosition(firstDrafter: Color): {
  state: GameState
  placements: DealtPlacement[]
} {
  let state = beginDraft(firstDrafter)
  const placements: DealtPlacement[] = []
  while (state.phase === 'draft' && state.pending != null) {
    const cell = chooseBotPlacement(state)
    if (cell == null) break
    placements.push({ by: state.turn, cell, kind: state.pending })
    state = placePiece(state, cell)
  }
  return { state, placements }
}

/**
 * The dealt position, held back in the lottery so the pieces are already
 * standing while the coin is still in the air — there is nothing to watch an
 * empty board for.
 *
 * Which colour drafted first is its own toss, and it is not the coin's: the
 * last piece placed is the one placed knowing everything, so letting the same
 * side always have it would be a standing advantage. The coin that follows
 * decides only who moves first in the position.
 */
export function dealLottery(): { state: GameState; placements: DealtPlacement[] } {
  const firstDrafter: Color = Math.random() < 0.5 ? 'white' : 'black'
  const { state, placements } = dealPosition(firstDrafter)
  return {
    state: { ...state, phase: 'lottery', lottery: { step: 'await_roll' } },
    placements,
  }
}

// ── moves ────────────────────────────────────────────────────────────────────

// The move phase is short enough to look ahead, so move choice is delegated to
// the alpha-beta search, which plays it near-optimally (sees trades, forks and
// counter-threats several plies deep) instead of judging a single move.
export function chooseBotMove(state: GameState): Move | null {
  return searchBestMove(state)
}
