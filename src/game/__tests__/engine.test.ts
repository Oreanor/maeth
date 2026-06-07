import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DUEL_ATTACKER_WIN_P,
  allLegalMoves,
  applyFailedStrike,
  applyMove,
  attackSquares,
  beginDraft,
  createInitialState,
  createLotteryState,
  firstTurnFromRoll,
  isAttackedBy,
  isDuelMove,
  legalMovesFrom,
  movablePieces,
  pieceMoves,
  placePiece,
  placementCells,
  replayPlace,
  resolveMove,
} from '../engine'
import type { GameState, Move } from '../types'
import { emptyBoard, piece, playState } from './kit'

const tos = (moves: Move[]) => new Set(moves.map((m) => m.to))

describe('createInitialState', () => {
  it('starts a fresh draft for white with a full deck and one drawn piece', () => {
    const s = createInitialState()
    expect(s.phase).toBe('draft')
    expect(s.turn).toBe('white')
    expect(s.board).toHaveLength(16)
    expect(s.board.every((c) => c === null)).toBe(true)
    expect(s.deck).toHaveLength(15)
    expect(s.pending).not.toBeNull()
    expect(s.placed).toEqual({ white: 0, black: 0 })
    expect(s.captures).toEqual({ white: 0, black: 0 })
    expect(s.status).toEqual({ kind: 'playing' })
    expect(s.history).toEqual([])
  })
})

describe('turn lottery', () => {
  it('createLotteryState waits for a roll with an empty board', () => {
    const s = createLotteryState()
    expect(s.phase).toBe('lottery')
    expect(s.lottery).toEqual({ step: 'await_roll' })
    expect(s.deck).toEqual([])
    expect(s.pending).toBeNull()
    expect(s.board.every((c) => c === null)).toBe(true)
  })

  it('maps odd rolls to white and even rolls to black', () => {
    expect(firstTurnFromRoll(1)).toBe('white')
    expect(firstTurnFromRoll(3)).toBe('white')
    expect(firstTurnFromRoll(5)).toBe('white')
    expect(firstTurnFromRoll(2)).toBe('black')
    expect(firstTurnFromRoll(4)).toBe('black')
    expect(firstTurnFromRoll(6)).toBe('black')
  })

  it('beginDraft shuffles and sets the first turn', () => {
    const s = beginDraft('black')
    expect(s.phase).toBe('draft')
    expect(s.lottery).toBeNull()
    expect(s.turn).toBe('black')
    expect(s.deck).toHaveLength(15)
    expect(s.pending).not.toBeNull()
  })
})

describe('pieceMoves', () => {
  it('slides a sliding piece up to its range, clipped by the board', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white') // ortho, range 2
    expect(tos(pieceMoves(b, 5))).toEqual(new Set([1, 4, 6, 7, 9, 13]))
    expect(pieceMoves(b, 5).every((m) => !m.capture)).toBe(true)
  })

  it('returns nothing for an empty square', () => {
    expect(pieceMoves(emptyBoard(), 0)).toEqual([])
  })

  it('is blocked by a friendly piece and stops on (capturing) an enemy', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[6] = piece('ent', 'white') // friendly to the right blocks that ray
    b[7] = piece('farmer', 'black')
    const right = pieceMoves(b, 5).filter((m) => m.to === 6 || m.to === 7)
    expect(right).toEqual([]) // friendly at 6 blocks the whole ray
  })

  it('captures an enemy at the end of a clear ray', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[7] = piece('farmer', 'black') // 6 is empty
    const cap = pieceMoves(b, 5).find((m) => m.to === 7)
    expect(cap).toEqual({ from: 5, to: 7, capture: true })
    expect(pieceMoves(b, 5).find((m) => m.to === 6)).toEqual({ from: 5, to: 6, capture: false })
  })

  it('an archer slides to empty squares and shoots the first enemy on a ray', () => {
    const b = emptyBoard()
    b[5] = piece('orcArcher', 'white') // ortho, range 1, archer
    expect(pieceMoves(b, 5).map((m) => ({ ...m }))).toEqual(
      expect.arrayContaining([
        { from: 5, to: 1, capture: false },
        { from: 5, to: 4, capture: false },
        { from: 5, to: 6, capture: false },
        { from: 5, to: 9, capture: false },
      ]),
    )
    b[6] = piece('hobbit', 'black')
    expect(pieceMoves(b, 5)).toEqual(
      expect.arrayContaining([
        { from: 5, to: 6, capture: true },
        { from: 5, to: 4, capture: false },
      ]),
    )
    expect(pieceMoves(b, 5).find((m) => m.to === 7)).toBeUndefined() // blocked by hobbit at 6
  })

  it("the 'zh' pattern moves vertically and diagonally but never sideways", () => {
    const b = emptyBoard()
    b[5] = piece('nazgul', 'white') // zh, range 2
    const dests = tos(pieceMoves(b, 5))
    expect(dests.has(1)).toBe(true) // up
    expect(dests.has(0)).toBe(true) // up-left diagonal
    expect(dests.has(4)).toBe(false) // no west
    expect(dests.has(6)).toBe(false) // no east
  })
})

describe('attackSquares / isAttackedBy', () => {
  it('controls empty squares and the first blocker in each ray', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[6] = piece('ent', 'white') // friendly blocker — still controlled
    const controlled = new Set(attackSquares(b, 5))
    expect(controlled.has(6)).toBe(true) // first blocker is controlled
    expect(controlled.has(7)).toBe(false) // ray stops at the blocker
  })

  it('detects whether a colour controls a square', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'black') // controls {1,4,6,7,9,13}
    expect(isAttackedBy(b, 7, 'black')).toBe(true)
    expect(isAttackedBy(b, 0, 'black')).toBe(false)
    expect(isAttackedBy(b, 7, 'white')).toBe(false)
  })
})

describe('legalMovesFrom', () => {
  it('only lets the side to move use its own un-moved pieces in the play phase', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    const s = playState(b, 'white')
    expect(legalMovesFrom(s, 5).length).toBeGreaterThan(0)
    expect(legalMovesFrom(s, 5)).toEqual(pieceMoves(b, 5))

    expect(legalMovesFrom(playState(b, 'black'), 5)).toEqual([]) // not black's piece
    b[5] = piece('rohanWarrior', 'white', true)
    expect(legalMovesFrom(playState(b), 5)).toEqual([]) // already moved
    expect(legalMovesFrom({ ...playState(b), phase: 'draft' } as GameState, 5)).toEqual([])
  })
})

describe('applyMove', () => {
  it('moves a sliding piece and flips the turn', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[0] = piece('king', 'black') // keep black alive so the game continues
    const next = applyMove(playState(b), { from: 5, to: 9, capture: false })
    expect(next.board[5]).toBeNull()
    expect(next.board[9]).toMatchObject({ kind: 'rohanWarrior', color: 'white', moved: true })
    expect(next.turn).toBe('black')
    expect(next.captures.white).toBe(0)
    expect(next.history).toHaveLength(1)
  })

  it('counts a capture and removes the victim', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[7] = piece('farmer', 'black')
    b[0] = piece('king', 'black')
    const next = applyMove(playState(b), { from: 5, to: 7, capture: true })
    expect(next.board[7]).toMatchObject({ kind: 'rohanWarrior', color: 'white', moved: true })
    expect(next.captures.white).toBe(1)
  })

  it('an archer stays put when shooting and slides when moving to an empty square', () => {
    const b = emptyBoard()
    b[5] = piece('orcArcher', 'white')
    b[6] = piece('hobbit', 'black')
    b[0] = piece('king', 'black')
    const shot = applyMove(playState(b), { from: 5, to: 6, capture: true })
    expect(shot.board[5]).toMatchObject({ kind: 'orcArcher', moved: true })
    expect(shot.board[6]).toBeNull()
    expect(shot.captures.white).toBe(1)

    const b2 = emptyBoard()
    b2[5] = piece('orcArcher', 'white')
    b2[0] = piece('king', 'black')
    const slide = applyMove(playState(b2), { from: 5, to: 9, capture: false })
    expect(slide.board[5]).toBeNull()
    expect(slide.board[9]).toMatchObject({ kind: 'orcArcher', moved: true })
  })

  it('is a no-op off the play phase or from an empty square', () => {
    const draft = { ...playState(emptyBoard()), phase: 'draft' } as GameState
    expect(applyMove(draft, { from: 0, to: 1, capture: false })).toBe(draft)
    const s = playState(emptyBoard())
    expect(applyMove(s, { from: 0, to: 1, capture: false })).toBe(s)
  })
})

describe('normalizePlay (via applyMove)', () => {
  it('ends the game when neither side can move, scoring by captures', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white') // the only mover
    b[0] = piece('king', 'black', true) // already moved → stuck
    const next = applyMove(playState(b, 'white', { white: 1, black: 0 }), {
      from: 5,
      to: 9,
      capture: false,
    })
    expect(next.phase).toBe('over')
    expect(next.status).toEqual({ kind: 'win', winner: 'white' })
  })

  it('declares a draw on equal captures', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[0] = piece('king', 'black', true)
    const next = applyMove(playState(b, 'white'), { from: 5, to: 9, capture: false })
    expect(next.phase).toBe('over')
    expect(next.status).toEqual({ kind: 'draw' })
  })

  it('passes the turn back when the side to move is stuck but the other is not', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white') // moves now
    b[0] = piece('ent', 'white') // still has moves afterwards
    b[15] = piece('king', 'black', true) // black is stuck
    const next = applyMove(playState(b, 'white'), { from: 5, to: 9, capture: false })
    expect(next.phase).toBe('play')
    expect(next.turn).toBe('white') // black had no move, so it was skipped
  })
})

describe('duels', () => {
  afterEach(() => vi.restoreAllMocks())

  it('isDuelMove only when the victim also threatens the attacker', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[13] = piece('balrog', 'black') // zh range 3 → aims up through 9,5
    expect(isDuelMove(b, { from: 5, to: 13, capture: true })).toBe(true)

    const b2 = emptyBoard()
    b2[5] = piece('rohanWarrior', 'white')
    b2[7] = piece('farmer', 'black') // diag range 1 → does not aim at 5
    expect(isDuelMove(b2, { from: 5, to: 7, capture: true })).toBe(false)
    expect(isDuelMove(b2, { from: 5, to: 6, capture: false })).toBe(false)
  })

  it('a failed strike leaves the attacker in place and flips the turn', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[13] = piece('balrog', 'black')
    const next = applyFailedStrike(playState(b), { from: 5, to: 13, capture: true })
    expect(next.board[5]).toMatchObject({ kind: 'rohanWarrior', moved: true })
    expect(next.board[13]).toMatchObject({ kind: 'balrog' }) // survived
    expect(next.captures.white).toBe(0)
    expect(next.turn).toBe('black')
  })

  it('resolveMove rolls the dice on a contested capture (attacker ≥ defender wins)', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValueOnce(0) // 6 vs 1
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[13] = piece('balrog', 'black')
    const { next, duel } = resolveMove(playState(b), { from: 5, to: 13, capture: true })
    expect(duel).toEqual({ attacker: 6, defender: 1, success: true })
    expect(next.captures.white).toBe(1)
    expect(next.board[13]).toMatchObject({ kind: 'rohanWarrior' })
  })

  it('resolveMove keeps the attacker on a lost duel', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99) // 1 vs 6
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[13] = piece('balrog', 'black')
    const { next, duel } = resolveMove(playState(b), { from: 5, to: 13, capture: true })
    expect(duel?.success).toBe(false)
    expect(next.captures.white).toBe(0)
    expect(next.board[5]).toMatchObject({ kind: 'rohanWarrior', moved: true })
  })

  it('with duels disabled a contested capture is a clean take (no dice)', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[13] = piece('balrog', 'black')
    const { next, duel } = resolveMove(playState(b), { from: 5, to: 13, capture: true }, { duels: false })
    expect(duel).toBeNull()
    expect(next.captures.white).toBe(1)
  })

  it('an uncontested capture never rolls', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[7] = piece('farmer', 'black')
    b[0] = piece('king', 'black')
    const { duel } = resolveMove(playState(b), { from: 5, to: 7, capture: true })
    expect(duel).toBeNull()
  })

  it('exposes the closed-form attacker win probability', () => {
    expect(DUEL_ATTACKER_WIN_P).toBeCloseTo(21 / 36, 10)
  })
})

describe('allLegalMoves / movablePieces', () => {
  it('collects every move for the side to move', () => {
    const b = emptyBoard()
    b[0] = piece('rohanWarrior', 'white')
    b[5] = piece('ent', 'white')
    b[15] = piece('king', 'black')
    const all = allLegalMoves(playState(b, 'white'))
    expect(all.every((m) => m.from === 0 || m.from === 5)).toBe(true)
    expect(new Set(movablePieces(playState(b, 'white')))).toEqual(new Set([0, 5]))
  })

  it('returns nothing off the play phase', () => {
    const draft = { ...playState(emptyBoard()), phase: 'draft' } as GameState
    expect(allLegalMoves(draft)).toEqual([])
    expect(movablePieces(draft)).toEqual([])
  })
})

describe('placementCells', () => {
  it('lists empty cells in the draft, and nothing otherwise', () => {
    const b = emptyBoard()
    b[0] = piece('king', 'white')
    const draft: GameState = {
      ...playState(b),
      phase: 'draft',
      pending: 'hobbit',
    }
    expect(placementCells(draft)).toHaveLength(15)
    expect(placementCells(draft)).not.toContain(0)
    expect(placementCells({ ...draft, pending: null })).toEqual([])
    expect(placementCells(playState(b))).toEqual([]) // not the draft phase
  })
})

describe('placePiece', () => {
  it('places the drawn piece, hands over the turn and draws the next', () => {
    const draft: GameState = {
      phase: 'draft',
      board: emptyBoard(),
      turn: 'white',
      deck: ['ent', 'king'],
      pending: 'hobbit',
      placed: { white: 0, black: 0 },
      captures: { white: 0, black: 0 },
      status: { kind: 'playing' },
      history: [],
    }
    const next = placePiece(draft, 5)
    expect(next.board[5]).toMatchObject({ kind: 'hobbit', color: 'white', moved: false })
    expect(next.placed).toEqual({ white: 1, black: 0 })
    expect(next.turn).toBe('black')
    expect(next.pending).toBe('king') // drawn from the back of the deck
    expect(next.deck).toEqual(['ent'])
    expect(next.phase).toBe('draft')
  })

  it('is a no-op on an occupied cell, a null pending, or outside the draft', () => {
    const draft: GameState = {
      ...playState(emptyBoard()),
      phase: 'draft',
      pending: 'hobbit',
      deck: [],
    }
    draft.board[5] = piece('king', 'white')
    expect(placePiece(draft, 5)).toBe(draft) // occupied
    expect(placePiece({ ...draft, pending: null }, 0)).toEqual({ ...draft, pending: null })
    expect(placePiece(playState(emptyBoard()), 0)).toMatchObject({ phase: 'play' })
  })

  it('completes the draft and opens the play phase on the last placement', () => {
    const b = emptyBoard()
    for (let i = 0; i < 7; i++) b[i] = piece('rohanWarrior', i % 2 === 0 ? 'white' : 'black')
    const draft: GameState = {
      phase: 'draft',
      board: b,
      turn: 'black',
      deck: [],
      pending: 'ent',
      placed: { white: 4, black: 3 },
      captures: { white: 0, black: 0 },
      status: { kind: 'playing' },
      history: [],
    }
    const next = placePiece(draft, 9)
    expect(next.phase).toBe('play')
    expect(next.turn).toBe('white')
    expect(next.pending).toBeNull()
  })
})

describe('replayPlace', () => {
  it('places an explicit kind and ignores the deck', () => {
    const draft: GameState = {
      phase: 'draft',
      board: emptyBoard(),
      turn: 'white',
      deck: ['ent'],
      pending: 'hobbit',
      placed: { white: 0, black: 0 },
      captures: { white: 0, black: 0 },
      status: { kind: 'playing' },
      history: [],
    }
    const next = replayPlace(draft, 3, 'king')
    expect(next.board[3]).toMatchObject({ kind: 'king', color: 'white' })
    expect(next.turn).toBe('black')
    expect(next.deck).toEqual(['ent']) // untouched
  })

  it('opens the play phase on the final replayed placement', () => {
    const b = emptyBoard()
    for (let i = 0; i < 7; i++) b[i] = piece('rohanWarrior', i % 2 === 0 ? 'white' : 'black')
    const draft: GameState = {
      phase: 'draft',
      board: b,
      turn: 'black',
      deck: [],
      pending: null,
      placed: { white: 4, black: 3 },
      captures: { white: 0, black: 0 },
      status: { kind: 'playing' },
      history: [],
    }
    expect(replayPlace(draft, 9, 'ent').phase).toBe('play')
  })

  it('is a no-op on an occupied cell or outside the draft', () => {
    const b = emptyBoard()
    b[3] = piece('king', 'white')
    const draft: GameState = { ...playState(b), phase: 'draft', pending: null }
    expect(replayPlace(draft, 3, 'ent')).toBe(draft) // occupied
    const play = playState(b)
    expect(replayPlace(play, 0, 'ent')).toBe(play) // wrong phase → returns input unchanged
  })
})
