import { describe, expect, it } from 'vitest'
import { chooseBotMove, chooseBotPlacement, dealPosition } from '../bot'
import { attackSquares, beginDraft, isAttackedBy, placePiece, placementCells } from '../engine'
import { CELLS, PIECES_PER_SIDE, opposite, type Color, type GameState } from '../types'
import { draftState, emptyBoard, piece, playState } from './kit'

describe('chooseBotPlacement', () => {
  it('returns null when there is nothing to place', () => {
    const s = draftState(['ent'], 'hobbit')
    expect(chooseBotPlacement({ ...s, pending: null })).toBeNull()
  })

  it('picks a legal empty cell', () => {
    const s = draftState(['ent', 'king'], 'orcArcher', 'black')
    s.board[15] = piece('rohanWarrior', 'white') // give the scorer an enemy to weigh
    s.board[0] = piece('king', 'black')
    const cell = chooseBotPlacement(s)
    expect(cell).not.toBeNull()
    expect(placementCells(s)).toContain(cell)
  })

  it('avoids hanging a piece where it can be taken for free', () => {
    // Black to place a 1-range piece. Cell 6 sits next to the white rohan and is
    // not defended; a safe far corner should score higher.
    const s = draftState([], 'farmer', 'black')
    s.board[5] = piece('rohanWarrior', 'white')
    const cell = chooseBotPlacement(s)
    expect(cell).not.toBe(6) // 6 would just hang next to the rohan
  })
})

describe('dealPosition', () => {
  const colours: Color[] = ['white', 'black']

  it.each(colours)('deals a full position ready to play, %s first', (firstTurn) => {
    const { state } = dealPosition(firstTurn)

    expect(state.phase).toBe('play')
    expect(state.pending).toBeNull()
    expect(state.placed).toEqual({ white: PIECES_PER_SIDE, black: PIECES_PER_SIDE })
    // Whoever the coin gave the first move to drafted first and moves first.
    expect(state.turn).toBe(firstTurn)

    const occupied = state.board.filter(Boolean)
    expect(occupied).toHaveLength(PIECES_PER_SIDE * 2)
    expect(occupied.every((p) => p!.moved === false)).toBe(true)
  })

  it('hands back the draft that produced it, in order', () => {
    const { state, placements } = dealPosition('white')

    expect(placements).toHaveLength(PIECES_PER_SIDE * 2)
    expect(placements.map((p) => p.by)).toEqual(
      Array.from({ length: PIECES_PER_SIDE * 2 }, (_, i) => (i % 2 === 0 ? 'white' : 'black')),
    )
    expect(new Set(placements.map((p) => p.cell)).size).toBe(placements.length)
    // The log replays these, so each has to describe the piece actually standing there.
    for (const { cell, kind, by } of placements) {
      expect(state.board[cell]).toEqual({ kind, color: by, moved: false })
    }
  })

  /** Pieces standing where the other side can take them for nothing. */
  const hanging = (board: GameState['board']) => {
    let n = 0
    for (let cell = 0; cell < CELLS; cell++) {
      const piece = board[cell]
      if (!piece) continue
      const attacked = isAttackedBy(board, cell, opposite(piece.color))
      const defended = isAttackedBy(board, cell, piece.color)
      const answers = attackSquares(board, cell).some(
        (s) => board[s]?.color === opposite(piece.color),
      )
      if (attacked && !defended && !answers) n++
    }
    return n
  }

  it('sets the pieces out with judgement, not at random', () => {
    // The point of dealing a position rather than scattering one: it runs the
    // same scorer the bot uses on its own turn, which refuses to drop a piece
    // where it can be taken for nothing. Measured against the alternative,
    // because the scorer will still accept a hanging piece when every square
    // left is worse — the claim is that it hangs far fewer, not none.
    const DEALS = 60
    let dealt = 0
    let scattered = 0
    for (let i = 0; i < DEALS; i++) {
      dealt += hanging(dealPosition('white').state.board)
      let random = beginDraft('white')
      while (random.phase === 'draft' && random.pending != null) {
        const cells = placementCells(random)
        random = placePiece(random, cells[Math.floor(Math.random() * cells.length)]!)
      }
      scattered += hanging(random.board)
    }
    expect(dealt).toBeLessThan(scattered)
  })
})

describe('chooseBotMove', () => {
  it('returns null with no moves and a legal move otherwise', () => {
    expect(chooseBotMove(playState(emptyBoard()))).toBeNull()
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'black')
    b[0] = piece('king', 'white')
    const move = chooseBotMove(playState(b, 'black'))
    expect(move).not.toBeNull()
    expect(move?.from).toBe(5)
  })
})
