import { describe, expect, it } from 'vitest'
import { chooseBotMove, chooseBotPlacement } from '../bot'
import { placementCells } from '../engine'
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
