import { describe, expect, it } from 'vitest'
import { searchBestMove } from '../search'
import { allLegalMoves } from '../engine'
import { emptyBoard, piece, playState } from './kit'

describe('searchBestMove', () => {
  it('returns null when there are no legal moves', () => {
    expect(searchBestMove(playState(emptyBoard()))).toBeNull()
  })

  it('always returns one of the legal moves', () => {
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[10] = piece('king', 'black')
    const state = playState(b, 'white')
    const move = searchBestMove(state)
    expect(move).not.toBeNull()
    const legal = allLegalMoves(state)
    expect(legal).toContainEqual(move)
  })

  it('grabs a free, game-winning capture', () => {
    // White can take Black's lone piece cleanly (no contest), which wins.
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[7] = piece('farmer', 'black') // diag range 1 — does not threaten 5, so no duel
    const move = searchBestMove(playState(b, 'white'))
    expect(move).toMatchObject({ from: 5, to: 7, capture: true })
  })

  it('searches a non-terminal, many-piece position (positional eval)', () => {
    // Three movers per side → at shallow depths the search bottoms out on
    // non-terminal nodes, exercising the positional evaluation.
    const b = emptyBoard()
    b[0] = piece('rohanWarrior', 'white')
    b[2] = piece('ent', 'white')
    b[5] = piece('king', 'white')
    b[10] = piece('king', 'black')
    b[13] = piece('ent', 'black')
    b[15] = piece('hobbit', 'black')
    const move = searchBestMove(playState(b, 'white'))
    expect(move).not.toBeNull()
    expect(allLegalMoves(playState(b, 'white'))).toContainEqual(move)
  })

  it('evaluates a contested capture as a chance node', () => {
    // White's rohan can drive onto the balrog, which aims back at it (a duel).
    const b = emptyBoard()
    b[5] = piece('rohanWarrior', 'white')
    b[2] = piece('ent', 'white')
    b[13] = piece('balrog', 'black') // threatens 5 → capturing it is a duel
    b[10] = piece('king', 'black')
    const move = searchBestMove(playState(b, 'white'))
    expect(move).not.toBeNull()
    expect(allLegalMoves(playState(b, 'white'))).toContainEqual(move)
  })
})
