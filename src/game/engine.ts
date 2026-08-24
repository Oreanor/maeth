import {
  CELLS,
  PIECES_PER_SIDE,
  colOf,
  idx,
  onBoard,
  opposite,
  rowOf,
  type Board,
  type Color,
  type GameState,
  type GameStatus,
  type Move,
} from './types.js'
import { ALL_KINDS, PIECES, dirsFor, type PieceKind } from './pieces.js'

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Fresh local/bot game: deck shuffled, white draws first and must place `pending`. */
export function createInitialState(): GameState {
  const deck = shuffle(ALL_KINDS)
  const pending = deck.pop() ?? null
  return {
    phase: 'draft',
    board: new Array<null>(CELLS).fill(null),
    turn: 'white',
    deck,
    pending,
    placed: { white: 0, black: 0 },
    captures: { white: 0, black: 0 },
    status: { kind: 'playing' },
    history: [],
  }
}

/** Online game before the turn lottery — empty board, no deck yet. */
export function createLotteryState(): GameState {
  return {
    phase: 'lottery',
    lottery: { step: 'await_roll' },
    board: new Array<null>(CELLS).fill(null),
    turn: 'white',
    deck: [],
    pending: null,
    placed: { white: 0, black: 0 },
    captures: { white: 0, black: 0 },
    status: { kind: 'playing' },
    history: [],
  }
}

/** The roller starts on odd values; their opponent starts on even values. */
export function firstTurnFromRoll(roll: number, roller: Color): Color {
  return roll % 2 === 1 ? roller : opposite(roller)
}

/** Begin the draft after the turn lottery — deck shuffled, `firstTurn` draws first. */
export function beginDraft(firstTurn: Color): GameState {
  const deck = shuffle(ALL_KINDS)
  const pending = deck.pop() ?? null
  return {
    phase: 'draft',
    lottery: null,
    board: new Array<null>(CELLS).fill(null),
    turn: firstTurn,
    deck,
    pending,
    placed: { white: 0, black: 0 },
    captures: { white: 0, black: 0 },
    status: { kind: 'playing' },
    history: [],
  }
}

// ── draft phase ──────────────────────────────────────────────────────────────

/** Cells where the current player may drop their pending piece. */
export function placementCells(state: GameState): number[] {
  if (state.phase !== 'draft' || state.pending == null) return []
  const cells: number[] = []
  for (let i = 0; i < CELLS; i++) if (!state.board[i]) cells.push(i)
  return cells
}

/** Place the pending piece on `cell`, then draw for the next player or start play. */
export function placePiece(state: GameState, cell: number): GameState {
  if (state.phase !== 'draft' || state.pending == null) return state
  if (state.board[cell]) return state

  const board = state.board.slice()
  board[cell] = { kind: state.pending, color: state.turn, moved: false }
  const placed = { ...state.placed, [state.turn]: state.placed[state.turn] + 1 }

  const totalPlaced = placed.white + placed.black
  if (totalPlaced >= PIECES_PER_SIDE * 2) {
    // Draft complete → move phase. First mover is whoever placed first in the draft
    // (the player who just placed was last in the draft order).
    const turn: Color = opposite(state.turn)
    return normalizePlay({
      ...state,
      board,
      placed,
      pending: null,
      phase: 'play',
      turn,
      status: { kind: 'playing' },
    })
  }

  // Hand turn to the other player and draw their blind piece.
  const deck = state.deck.slice()
  const pending = deck.pop() ?? null
  return {
    ...state,
    board,
    placed,
    deck,
    pending,
    turn: opposite(state.turn),
  }
}

/** Replay a recorded draft placement by explicit kind (log rebuild; deck is ignored). */
export function replayPlace(state: GameState, cell: number, kind: PieceKind): GameState {
  if (state.phase !== 'draft' || state.board[cell]) return state

  const board = state.board.slice()
  board[cell] = { kind, color: state.turn, moved: false }
  const placed = { ...state.placed, [state.turn]: state.placed[state.turn] + 1 }

  const totalPlaced = placed.white + placed.black
  if (totalPlaced >= PIECES_PER_SIDE * 2) {
    const turn: Color = opposite(state.turn)
    return normalizePlay({
      ...state,
      board,
      placed,
      pending: null,
      phase: 'play',
      turn,
      status: { kind: 'playing' },
    })
  }

  return {
    ...state,
    board,
    placed,
    turn: opposite(state.turn),
  }
}

// ── move phase ───────────────────────────────────────────────────────────────

/**
 * Geometric moves for the piece on `from`: slides in its pattern up to its
 * range, blocked by any piece, capturing an enemy at the end of the path.
 * Does not consider whose turn it is or whether the piece already moved.
 */
export function pieceMoves(board: Board, from: number): Move[] {
  const piece = board[from]
  if (!piece) return []
  const def = PIECES[piece.kind]
  const moves: Move[] = []
  const r0 = rowOf(from)
  const c0 = colOf(from)
  for (const [dr, dc] of dirsFor(def.pattern)) {
    for (let step = 1; step <= def.range; step++) {
      const r = r0 + dr * step
      const c = c0 + dc * step
      if (!onBoard(r, c)) break
      const to = idx(r, c)
      const occupant = board[to]
      if (!occupant) {
        moves.push({ from, to, capture: false })
        continue
      }
      if (occupant.color !== piece.color) moves.push({ from, to, capture: true })
      break // blocked by a piece either way
    }
  }
  return moves
}

/**
 * Squares a piece controls: every empty square it can slide to within range,
 * plus the first occupied square it runs into in each direction. A friendly
 * piece on such a square is "defended"; an enemy piece is "attacked". This is
 * the symmetric primitive the bot uses for both threats and protection.
 */
export function attackSquares(board: Board, from: number): number[] {
  const piece = board[from]
  if (!piece) return []
  const def = PIECES[piece.kind]
  const out: number[] = []
  const r0 = rowOf(from)
  const c0 = colOf(from)
  for (const [dr, dc] of dirsFor(def.pattern)) {
    for (let step = 1; step <= def.range; step++) {
      const r = r0 + dr * step
      const c = c0 + dc * step
      if (!onBoard(r, c)) break
      const to = idx(r, c)
      out.push(to)
      if (board[to]) break // first blocker is controlled, then the ray stops
    }
  }
  return out
}

/** Does any piece of `color` control `square`? */
export function isAttackedBy(board: Board, square: number, color: Color): boolean {
  for (let i = 0; i < CELLS; i++) {
    if (board[i]?.color === color && i !== square && attackSquares(board, i).includes(square)) {
      return true
    }
  }
  return false
}

/** Legal moves the current player may actually make from `from` right now. */
export function legalMovesFrom(state: GameState, from: number): Move[] {
  if (state.phase !== 'play') return []
  const piece = state.board[from]
  if (!piece || piece.color !== state.turn || piece.moved) return []
  return pieceMoves(state.board, from)
}

/** Does `color` have any un-moved piece with a legal move? */
function sideCanMove(board: Board, color: Color): boolean {
  for (let i = 0; i < CELLS; i++) {
    const p = board[i]
    if (p && p.color === color && !p.moved && pieceMoves(board, i).length > 0) return true
  }
  return false
}

function finalStatus(captures: Record<Color, number>): GameStatus {
  if (captures.white > captures.black) return { kind: 'win', winner: 'white' }
  if (captures.black > captures.white) return { kind: 'win', winner: 'black' }
  return { kind: 'draw' }
}

/**
 * Settle the play phase after a turn change: end the game if neither side can
 * move, otherwise pass the turn past a side that has no legal move.
 */
function normalizePlay(state: GameState): GameState {
  if (state.phase !== 'play') return state
  const wCan = sideCanMove(state.board, 'white')
  const bCan = sideCanMove(state.board, 'black')
  if (!wCan && !bCan) {
    return { ...state, phase: 'over', status: finalStatus(state.captures) }
  }
  const canMove = state.turn === 'white' ? wCan : bCan
  // If the side to move is stuck (but the other isn't), it passes.
  return canMove ? state : { ...state, turn: opposite(state.turn) }
}

export function applyMove(state: GameState, move: Move): GameState {
  if (state.phase !== 'play') return state
  const piece = state.board[move.from]
  if (!piece) return state

  const board = state.board.slice()
  const archerShot = PIECES[piece.kind].archer === true && move.capture
  if (archerShot) {
    board[move.from] = { ...piece, moved: true }
    board[move.to] = null
  } else {
    board[move.from] = null
    board[move.to] = { ...piece, moved: true }
  }

  const captures = move.capture
    ? { ...state.captures, [state.turn]: state.captures[state.turn] + 1 }
    : state.captures

  return normalizePlay({
    ...state,
    board,
    captures,
    turn: opposite(state.turn),
    history: [...state.history, move],
  })
}

// ── duels (contested captures) ───────────────────────────────────────────────
//
// When you capture a piece that is ALSO aimed at your attacker (a mutual
// threat), the strike is contested: the attacker rolls one d6. Odd values win,
// even values fail. A failed strike still spends the attacker's move (it stays
// put). Capturing a piece that can't hit you back is a clean, automatic kill.

/** P(attacker wins): three successful faces (1, 3, 5) out of six. */
export const DUEL_ATTACKER_WIN_P = 1 / 2

/** Is this capture a duel — does the victim also threaten the attacker? */
export function isDuelMove(board: Board, move: Move): boolean {
  return move.capture && attackSquares(board, move.to).includes(move.from)
}

/** Outcome of a failed strike: attacker stays on its square, move spent. */
export function applyFailedStrike(state: GameState, move: Move): GameState {
  if (state.phase !== 'play') return state
  const piece = state.board[move.from]
  if (!piece) return state
  const board = state.board.slice()
  board[move.from] = { ...piece, moved: true }
  return normalizePlay({
    ...state,
    board,
    turn: opposite(state.turn),
    history: [...state.history, move],
  })
}

export interface DuelRoll {
  attacker: number
  success: boolean
}

const rollD6 = () => 1 + Math.floor(Math.random() * 6)

/**
 * Resolve a move for actual play: a contested capture rolls the dice, otherwise
 * the move applies normally. Returns the resulting state and the roll (if any)
 * so the UI can show the duel.
 */
export function resolveMove(
  state: GameState,
  move: Move,
  options: { duels?: boolean } = {},
): { next: GameState; duel: DuelRoll | null } {
  const duelsOn = options.duels !== false
  if (!duelsOn || !isDuelMove(state.board, move)) return { next: applyMove(state, move), duel: null }
  const attacker = rollD6()
  const success = attacker % 2 === 1
  const next = success ? applyMove(state, move) : applyFailedStrike(state, move)
  return { next, duel: { attacker, success } }
}

/** All legal moves for the side to move (used by the bot). */
export function allLegalMoves(state: GameState): Move[] {
  if (state.phase !== 'play') return []
  const out: Move[] = []
  for (let i = 0; i < CELLS; i++) {
    if (state.board[i]?.color === state.turn) out.push(...legalMovesFrom(state, i))
  }
  return out
}

/** Cells of the side-to-move that have at least one legal move (pickable). */
export function movablePieces(state: GameState): number[] {
  return [...new Set(allLegalMoves(state).map((m) => m.from))]
}

export { PIECES, type PieceKind }
